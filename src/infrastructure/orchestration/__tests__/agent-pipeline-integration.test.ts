import { describe, it, expect, vi } from 'vitest';
import { ReconAgent, RECON_ARTIFACT_FILENAME } from '../agents/recon-agent.js';
import { ArchitectAgent, ARCHITECT_ARTIFACT_FILENAME } from '../agents/architect-agent.js';
import { SkepticAgent } from '../agents/skeptic-agent.js';
import { ContractRevisionState } from '../../../domain/orchestration/models/contract-revision-state.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';

const WORKSPACE_SLUG = 'epic-2-agents';
const REQUIREMENTS_PATH = '00-requirements.md';

function createIpcBus(): IpcBusPort {
  return { publish: vi.fn(), subscribe: vi.fn() };
}

/** In-memory workspace file system so artifacts written by one agent are readable by the next, mirroring a real filesystem round-trip. */
function createInMemoryWorkspaceFileSystem(): WorkspaceFileSystemPort {
  const files = new Map<string, string>();
  const feedback = new Map<number, string>();

  files.set(REQUIREMENTS_PATH, '# Requirements\nBuild a widget.');

  return {
    readFile: vi.fn(async (_slug: string, relativePath: string) => {
      const content = files.get(relativePath);
      if (content === undefined) {
        throw new Error(`no such file: ${relativePath}`);
      }
      return content;
    }),
    writeFile: vi.fn(async (_slug: string, relativePath: string, content: string) => {
      files.set(relativePath, content);
    }),
    fileExists: vi.fn(async (_slug: string, relativePath: string) => files.has(relativePath)),
    readFeedbackRecord: vi.fn(async (_slug: string, cycle: number) => {
      const content = feedback.get(cycle);
      if (content === undefined) {
        throw new Error(`no feedback record for cycle ${cycle}`);
      }
      return content;
    }),
    writeFeedbackRecord: vi.fn(async (_slug: string, cycle: number, content: string) => {
      if (feedback.has(cycle)) {
        throw new Error(`feedback record for cycle ${cycle} already exists`);
      }
      feedback.set(cycle, content);
    }),
  };
}

function createScriptedLlmClient(responses: readonly string[]): LlmClientPort {
  const complete = vi.fn();
  responses.forEach((response) => {
    complete.mockImplementationOnce(async () => response);
  });
  return { complete };
}

describe('Recon -> Architect -> Skeptic revision pipeline (in-process)', () => {
  it('runs a full rejection-then-approval cycle and keeps ContractRevisionState invariants intact', async () => {
    const llmClient = createScriptedLlmClient([
      '<report># Recon Report\nExisting conventions noted.</report>',
      '<contract># Contracts\n## Ports\nInitial draft.</contract>',
      JSON.stringify({
        verdict: 'REJECTED',
        findings: [{ section: 'Ports', issue: 'missing adapter', severity: 'BLOCKER' }],
      }),
      '<contract>## Addendum (cycle 1)\nAdded the missing adapter.</contract>',
      JSON.stringify({ verdict: 'APPROVED', findings: [] }),
    ]);
    const workspaceFileSystem = createInMemoryWorkspaceFileSystem();
    const ipcBus = createIpcBus();

    const reconAgent = new ReconAgent(ipcBus, workspaceFileSystem, llmClient);
    const architectAgent = new ArchitectAgent(ipcBus, workspaceFileSystem, llmClient);
    const skepticAgent = new SkepticAgent(ipcBus, workspaceFileSystem, llmClient);

    let revisionState = ContractRevisionState.create(WORKSPACE_SLUG);

    const reconResult = await reconAgent.execute({
      workspaceSlug: WORKSPACE_SLUG,
      requirementsPath: REQUIREMENTS_PATH,
    });
    expect(reconResult.artifactPath).toBe(RECON_ARTIFACT_FILENAME);

    const firstDraftResult = await architectAgent.execute({
      workspaceSlug: WORKSPACE_SLUG,
      requirementsPath: REQUIREMENTS_PATH,
      reconPath: RECON_ARTIFACT_FILENAME,
    });
    expect(firstDraftResult.artifactPath).toBe(ARCHITECT_ARTIFACT_FILENAME);

    const firstAuditResult = await skepticAgent.execute({
      workspaceSlug: WORKSPACE_SLUG,
      requirementsPath: REQUIREMENTS_PATH,
      contractsPath: ARCHITECT_ARTIFACT_FILENAME,
    });
    expect(firstAuditResult.verdict).toBe('REJECTED');
    expect(firstAuditResult.feedback).toBeDefined();

    const applyRejection = revisionState.applySkepticResult(firstAuditResult);
    expect(applyRejection.isOk).toBe(true);
    expect(revisionState.status).toBe('IN_PROGRESS');
    expect(revisionState.currentCycle).toBe(1);
    expect(revisionState.feedbackHistory).toHaveLength(1);

    const feedbackRecord = firstAuditResult.feedback!;
    await workspaceFileSystem.writeFeedbackRecord(
      WORKSPACE_SLUG,
      feedbackRecord.cycle,
      JSON.stringify(feedbackRecord)
    );

    const revisedDraftResult = await architectAgent.execute({
      workspaceSlug: WORKSPACE_SLUG,
      requirementsPath: REQUIREMENTS_PATH,
      reconPath: RECON_ARTIFACT_FILENAME,
      contractsPath: ARCHITECT_ARTIFACT_FILENAME,
      pendingFeedback: [feedbackRecord],
    });
    expect(revisedDraftResult.artifactPath).toBe(ARCHITECT_ARTIFACT_FILENAME);

    const secondAuditResult = await skepticAgent.execute({
      workspaceSlug: WORKSPACE_SLUG,
      requirementsPath: REQUIREMENTS_PATH,
      contractsPath: ARCHITECT_ARTIFACT_FILENAME,
      pendingFeedback: [feedbackRecord],
    });
    expect(secondAuditResult.verdict).toBe('APPROVED');
    expect(secondAuditResult.feedback).toBeUndefined();

    const applyApproval = revisionState.applySkepticResult(secondAuditResult);
    expect(applyApproval.isOk).toBe(true);
    expect(revisionState.status).toBe('APPROVED');
    expect(revisionState.feedbackHistory).toHaveLength(1);

    const secondRejectionAttempt = revisionState.applySkepticResult({
      role: 'skeptic',
      artifactPath: ARCHITECT_ARTIFACT_FILENAME,
      verdict: 'REJECTED',
      feedback: { cycle: 2, raisedAt: new Date().toISOString(), findings: [] },
    });
    expect(secondRejectionAttempt.isErr).toBe(true);

    expect(llmClient.complete).toHaveBeenCalledTimes(5);
  });
});
