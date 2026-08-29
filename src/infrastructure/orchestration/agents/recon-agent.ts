import { SubAgentBase } from '../sub-agent-base.js';
import type { AgentRole } from '../../../domain/orchestration/models/agent-role.js';
import type { AgentContext } from '../../../domain/orchestration/models/agent-context.js';
import type { AgentResult } from '../../../domain/orchestration/models/agent-result.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import { AgentExecutionError } from '../../../domain/orchestration/errors/agent-execution-error.js';
import { ReconPromptBuilder } from '../prompts/recon-prompt-builder.js';

export const RECON_ARTIFACT_FILENAME = '01-recon.md';

/** Sub-Agent that reads a feature's requirements and writes the codebase reconnaissance report. */
export class ReconAgent extends SubAgentBase {
  readonly role: AgentRole = 'recon';

  constructor(
    ipcBus: IpcBusPort,
    private readonly workspaceFileSystem: WorkspaceFileSystemPort,
    private readonly llmClient: LlmClientPort
  ) {
    super(ipcBus);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    if (!context.requirementsPath) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        'requirementsPath is required to perform reconnaissance'
      );
    }

    let requirementsContent: string;
    try {
      requirementsContent = await this.workspaceFileSystem.readFile(
        context.workspaceSlug,
        context.requirementsPath
      );
    } catch (cause) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        `failed to read requirements at ${context.requirementsPath}`,
        cause
      );
    }

    const systemPrompt = ReconPromptBuilder.buildSystemPrompt();
    const userPrompt = ReconPromptBuilder.buildUserPrompt(requirementsContent, '');
    const reconContent = await this.llmClient.complete({ systemPrompt, userPrompt });

    await this.workspaceFileSystem.writeFile(context.workspaceSlug, RECON_ARTIFACT_FILENAME, reconContent);

    this.publishStageComplete({
      role: this.role,
      workspaceSlug: context.workspaceSlug,
      artifactPath: RECON_ARTIFACT_FILENAME,
      timestamp: new Date().toISOString(),
    });

    return { role: this.role, artifactPath: RECON_ARTIFACT_FILENAME };
  }
}
