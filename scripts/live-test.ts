import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { GeminiAdapter } from '../src/infrastructure/llm/adapters/gemini-adapter.js';
import { ReconAgent, ArchitectAgent, SkepticAgent, WorkspaceFileSystemAdapter, InProcessIpcBus } from '../src/infrastructure/orchestration/index.js';
import type { LlmClientPort, LlmCompletionOptions } from '../src/domain/orchestration/ports/llm-client-port.js';
import type { LLMProviderPort } from '../src/domain/orchestration/ports/llm-provider-port.js';
import { AgentContext } from '../src/domain/orchestration/models/agent-context.js';
import { ContractFeedbackRecord } from '../src/domain/orchestration/models/contract-feedback-record.js';

class LlmAdapterWrapper implements LlmClientPort {
  constructor(private readonly provider: LLMProviderPort) {}
  async complete(options: LlmCompletionOptions): Promise<string> {
    return this.provider.execute(options.userPrompt, options.systemPrompt, { temperature: options.temperature });
  }
}

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is required.');
    process.exit(1);
  }

  const baseDir = path.join(process.cwd(), '.dag-live-test');
  const slug = 'test-feature';
  const workspacePath = path.join(baseDir, slug);
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.writeFile(path.join(workspacePath, '00-requirements.md'), 'Build a simple web server that returns "Hello World" on port 8080.');

  const geminiAdapter = new GeminiAdapter({ apiKey, model: 'gemini-3.6-flash' });
  const llmClient = new LlmAdapterWrapper(geminiAdapter);
  const ipcBus = new InProcessIpcBus();
  const fsAdapter = new WorkspaceFileSystemAdapter(baseDir);

  ipcBus.subscribe('orchestration.stage.complete', (payload) => {
    console.log(`[EVENT] ${payload.role} completed stage. Artifact: ${payload.artifactPath}`);
  });

  const reconAgent = new ReconAgent(ipcBus, fsAdapter, llmClient);
  const architectAgent = new ArchitectAgent(ipcBus, fsAdapter, llmClient);
  const skepticAgent = new SkepticAgent(ipcBus, fsAdapter, llmClient);

  console.log('--- Running Recon Agent ---');
  let context: AgentContext = {
    workspaceSlug: slug,
    requirementsPath: '00-requirements.md',
    contractsPath: '02-contracts.md', reconPath: '01-recon.md'
  };
  
  await reconAgent.execute(context);
  
  console.log('--- Running Architect Agent (Draft) ---');
  await architectAgent.execute(context);
  
  console.log('--- Running Skeptic Agent (Audit) ---');
  let result = await skepticAgent.execute(context);
  
  let cycle = 1;
  while (result.verdict === 'REJECTED') {
    console.log(`\nSKEPTIC REJECTED! Findings:`);
    console.log(JSON.stringify(result.feedback?.findings, null, 2));
    console.log(`\n--- Running Architect Agent (Revision ${cycle}) ---`);
    
    // Simulate orchestrator persisting feedback
    const feedback: ContractFeedbackRecord = { cycle, findings: result.feedback!.findings };
    await fsAdapter.writeFeedbackRecord(slug, cycle, JSON.stringify(feedback));
    
    context = { ...context, pendingFeedback: context.pendingFeedback ? [...context.pendingFeedback, feedback] : [feedback] };
    await architectAgent.execute(context);
    
    console.log(`--- Running Skeptic Agent (Audit ${cycle}) ---`);
    result = await skepticAgent.execute(context);
    cycle++;
    
    if (cycle > 3) {
      console.log('Reached max cycles for test. Bailing out.');
      break;
    }
  }

  if (result.verdict === 'APPROVED') {
    console.log('\nSUCCESS: Skeptic APPROVED the contract!');
  }
}

run().catch(console.error);
