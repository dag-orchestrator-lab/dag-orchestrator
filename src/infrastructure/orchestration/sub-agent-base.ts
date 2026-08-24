import type { AgentContext } from '../../domain/orchestration/models/agent-context.js';
import type { AgentResult } from '../../domain/orchestration/models/agent-result.js';
import type { AgentPort } from '../../domain/orchestration/ports/agent-port.js';
import { AgentExecutionError } from '../../domain/orchestration/errors/agent-execution-error.js';
import type { ExecuteStagePromptUseCase } from '../../application/llm/execute-stage-prompt-use-case.js';
import type { DagConfigRepository } from '../config/dag-config-repository.js';

/**
 * Shared foundation for concrete Sub-Agents (Recon, Skeptic, Coder — not built in this epic).
 * A subclass must never throw an unexpected error out of `execute()`; instead it should catch it
 * and convert it via `formatErrorTrace`, e.g.:
 *
 * ```typescript
 * protected formatErrorTrace(cause: unknown): AgentExecutionError {
 *   const error = cause instanceof Error ? cause : new Error(String(cause));
 *   // Positional args only — { stageId, message, causeDetails } object literals do not match
 *   // the constructor and silently produce a broken error (see Conflict 4 / Skeptic BLOCKER #3).
 *   return new AgentExecutionError('recon', error.message, {
 *     name: error.name,
 *     message: error.message,
 *     stack: error.stack,
 *   });
 * }
 * ```
 */
export abstract class SubAgentBase implements AgentPort {
  constructor(
    protected readonly executeStagePrompt: ExecuteStagePromptUseCase,
    protected readonly dagConfigRepository: DagConfigRepository
  ) {}

  abstract execute(context: AgentContext): Promise<AgentResult>;

  /** Reads `.dagrules` for the given working directory before a concrete agent runs its stage logic. */
  protected abstract loadRules(workingDirectory: string): Promise<string>;

  /** Formats an unexpected failure into the AgentExecutionError shape shared by every Sub-Agent. */
  protected abstract formatErrorTrace(cause: unknown): AgentExecutionError;
}
