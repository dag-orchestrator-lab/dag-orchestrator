import { SubAgentBase } from '../sub-agent-base.js';
import type { AgentRole } from '../../../domain/orchestration/models/agent-role.js';
import type { AgentContext } from '../../../domain/orchestration/models/agent-context.js';
import type { AgentResult } from '../../../domain/orchestration/models/agent-result.js';
import type { SkepticVerdict } from '../../../domain/orchestration/models/skeptic-verdict.js';
import type { ContractFinding } from '../../../domain/orchestration/models/contract-finding.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import { AgentExecutionError } from '../../../domain/orchestration/errors/agent-execution-error.js';
import { LlmResponseExtractionError } from '../../../domain/orchestration/errors/llm-response-extraction-error.js';
import { extractJson } from '../../../domain/orchestration/utils/llm-response-extractor.js';
import { validateAgentResult } from '../../../domain/orchestration/validation/contract-invariants.js';
import { SkepticPromptBuilder } from '../prompts/skeptic-prompt-builder.js';

export const SKEPTIC_ARTIFACT_FILENAME = '02-contracts.md';

interface SkepticLlmResponse {
  readonly verdict: SkepticVerdict;
  readonly findings: readonly ContractFinding[];
}

/** Sub-Agent that adversarially audits 02-contracts.md and returns an APPROVED/REJECTED verdict. */
export class SkepticAgent extends SubAgentBase {
  readonly role: AgentRole = 'skeptic';

  constructor(
    ipcBus: IpcBusPort,
    private readonly workspaceFileSystem: WorkspaceFileSystemPort,
    private readonly llmClient: LlmClientPort
  ) {
    super(ipcBus);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const cycle = (context.pendingFeedback?.length ?? 0) + 1;

    if (!context.contractsPath) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        cycle,
        'contractsPath is required to audit the contract'
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

    let contractContent: string;
    try {
      contractContent = await this.workspaceFileSystem.readFile(context.workspaceSlug, context.contractsPath);
    } catch (cause) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        cycle,
        `failed to read contract at ${context.contractsPath}`,
        cause
      );
    }

    const systemPrompt = SkepticPromptBuilder.buildSystemPrompt();
    const userPrompt = SkepticPromptBuilder.buildUserPrompt(contractContent, cycle);
    const rawResponse = await this.llmClient.complete({ systemPrompt, userPrompt });

    const parsedResponse = this.parseLlmResponse(rawResponse, context.workspaceSlug, cycle);
    const hasBlockerFinding = parsedResponse.findings.some((finding) => finding.severity === 'BLOCKER');
    const verdict: SkepticVerdict = hasBlockerFinding ? 'REJECTED' : 'APPROVED';

    const result: AgentResult = {
      role: this.role,
      artifactPath: SKEPTIC_ARTIFACT_FILENAME,
      verdict,
      feedback:
        verdict === 'REJECTED'
          ? { cycle, raisedAt: new Date().toISOString(), findings: parsedResponse.findings }
          : undefined,
    };

    const validation = validateAgentResult(result, context.workspaceSlug);
    if (validation.isErr) {
      throw validation.error;
    }

    this.publishStageComplete({
      role: this.role,
      workspaceSlug: context.workspaceSlug,
      artifactPath: SKEPTIC_ARTIFACT_FILENAME,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  private parseLlmResponse(rawResponse: string, workspaceSlug: string, cycle: number): SkepticLlmResponse {
    let parsed: unknown;
    try {
      parsed = extractJson<unknown>(rawResponse);
    } catch (cause) {
      if (cause instanceof LlmResponseExtractionError) {
        throw new AgentExecutionError(
          this.role,
          workspaceSlug,
          cycle,
          'LLM response is not valid JSON',
          cause
        );
      }
      throw cause;
    }

    if (!this.isSkepticLlmResponse(parsed)) {
      throw new AgentExecutionError(
        this.role,
        workspaceSlug,
        cycle,
        'LLM response does not match the expected Skeptic verdict schema'
      );
    }

    return parsed;
  }

  private isSkepticLlmResponse(value: unknown): value is SkepticLlmResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    if (candidate.verdict !== 'APPROVED' && candidate.verdict !== 'REJECTED') {
      return false;
    }

    if (!Array.isArray(candidate.findings)) {
      return false;
    }

    return candidate.findings.every((finding) => this.isContractFinding(finding));
  }

  private isContractFinding(value: unknown): value is ContractFinding {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.section === 'string' &&
      typeof candidate.issue === 'string' &&
      (candidate.severity === 'BLOCKER' || candidate.severity === 'WARNING')
    );
  }
}
