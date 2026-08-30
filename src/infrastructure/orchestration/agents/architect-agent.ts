import { SubAgentBase } from '../sub-agent-base.js';
import type { AgentRole } from '../../../domain/orchestration/models/agent-role.js';
import type { AgentContext } from '../../../domain/orchestration/models/agent-context.js';
import type { AgentResult } from '../../../domain/orchestration/models/agent-result.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import { AgentExecutionError } from '../../../domain/orchestration/errors/agent-execution-error.js';
import { LlmResponseExtractionError } from '../../../domain/orchestration/errors/llm-response-extraction-error.js';
import { extractXmlBlock } from '../../../domain/orchestration/utils/llm-response-extractor.js';
import { ArchitectPromptBuilder } from '../prompts/architect-prompt-builder.js';

export const ARCHITECT_ARTIFACT_FILENAME = '02-contracts.md';

/** Sub-Agent that drafts 02-contracts.md from requirements/recon, or revises it in response to Skeptic feedback. */
export class ArchitectAgent extends SubAgentBase {
  readonly role: AgentRole = 'architect';

  constructor(
    ipcBus: IpcBusPort,
    private readonly workspaceFileSystem: WorkspaceFileSystemPort,
    private readonly llmClient: LlmClientPort
  ) {
    super(ipcBus);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const isRevisionMode = context.pendingFeedback !== undefined && context.pendingFeedback.length > 0;
    const cycle = isRevisionMode
      ? context.pendingFeedback![context.pendingFeedback!.length - 1].cycle
      : undefined;

    const contractContent = isRevisionMode
      ? await this.draftRevision(context, cycle)
      : await this.draftInitial(context);

    await this.workspaceFileSystem.writeFile(context.workspaceSlug, ARCHITECT_ARTIFACT_FILENAME, contractContent);

    this.publishStageComplete({
      role: this.role,
      workspaceSlug: context.workspaceSlug,
      artifactPath: ARCHITECT_ARTIFACT_FILENAME,
      timestamp: new Date().toISOString(),
    });

    return { role: this.role, artifactPath: ARCHITECT_ARTIFACT_FILENAME };
  }

  private async draftInitial(context: AgentContext): Promise<string> {
    if (!context.requirementsPath) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        'requirementsPath is required to draft the contract'
      );
    }
    if (!context.reconPath) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        'reconPath is required to draft the contract'
      );
    }

    const requirementsExists = await this.workspaceFileSystem.fileExists(
      context.workspaceSlug,
      context.requirementsPath
    );
    if (!requirementsExists) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        `requirements file not found at ${context.requirementsPath}`
      );
    }

    const reconExists = await this.workspaceFileSystem.fileExists(context.workspaceSlug, context.reconPath);
    if (!reconExists) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        `recon file not found at ${context.reconPath}`
      );
    }

    let requirementsContent: string;
    let reconContent: string;
    try {
      requirementsContent = await this.workspaceFileSystem.readFile(context.workspaceSlug, context.requirementsPath);
      reconContent = await this.workspaceFileSystem.readFile(context.workspaceSlug, context.reconPath);
    } catch (cause) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        'failed to read requirements or recon artifacts',
        cause
      );
    }

    const systemPrompt = ArchitectPromptBuilder.buildSystemPrompt();
    const userPrompt = ArchitectPromptBuilder.buildInitialUserPrompt(requirementsContent, reconContent);
    const rawResponse = await this.llmClient.complete({ systemPrompt, userPrompt });
    return this.extractContract(rawResponse, context.workspaceSlug, undefined);
  }

  private async draftRevision(context: AgentContext, cycle: number | undefined): Promise<string> {
    if (!context.contractsPath) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        cycle,
        'contractsPath is required to apply revision feedback'
      );
    }

    const contractsExist = await this.workspaceFileSystem.fileExists(context.workspaceSlug, context.contractsPath);
    if (!contractsExist) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        cycle,
        `referenced contract file not found at ${context.contractsPath}`
      );
    }

    let existingContractContent: string;
    try {
      existingContractContent = await this.workspaceFileSystem.readFile(context.workspaceSlug, context.contractsPath);
    } catch (cause) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        cycle,
        `failed to read existing contract at ${context.contractsPath}`,
        cause
      );
    }

    const systemPrompt = ArchitectPromptBuilder.buildSystemPrompt();
    const userPrompt = ArchitectPromptBuilder.buildRevisionUserPrompt(
      existingContractContent,
      context.pendingFeedback!
    );
    const rawResponse = await this.llmClient.complete({ systemPrompt, userPrompt });
    const addendum = this.extractContract(rawResponse, context.workspaceSlug, cycle);

    return `${existingContractContent}\n\n${addendum}`;
  }

  private extractContract(rawResponse: string, workspaceSlug: string, cycle: number | undefined): string {
    try {
      return extractXmlBlock(rawResponse, 'contract');
    } catch (cause) {
      if (cause instanceof LlmResponseExtractionError) {
        throw new AgentExecutionError(
          this.role,
          workspaceSlug,
          cycle,
          'LLM response did not contain a <contract> block',
          cause
        );
      }
      throw cause;
    }
  }
}
