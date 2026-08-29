import { Result } from '../../common/result.js';
import { AgentExecutionError } from '../errors/agent-execution-error.js';
import type { AgentContext } from '../models/agent-context.js';
import type { AgentResult } from '../models/agent-result.js';
import type { AgentRole } from '../models/agent-role.js';
import type { ContractFeedbackRecord } from '../models/contract-feedback-record.js';

/**
 * Enforces the contract's `AgentResult` invariant: non-Skeptic roles never carry a
 * verdict or feedback, a Skeptic `APPROVED` carries no feedback, and a Skeptic
 * `REJECTED` carries feedback with at least one finding.
 * @param result Result returned by a Sub-Agent's execute().
 * @param workspaceSlug Workspace the agent ran against, threaded into any raised error.
 * @returns `Result.ok(undefined)` when valid, or an `AgentExecutionError` otherwise.
 */
export function validateAgentResult(
  result: AgentResult,
  workspaceSlug: string
): Result<void, AgentExecutionError> {
  const cycle = result.feedback?.cycle;

  if (result.role !== 'skeptic') {
    if (result.verdict !== undefined || result.feedback !== undefined) {
      return Result.err(
        new AgentExecutionError(
          result.role,
          workspaceSlug,
          cycle,
          `Non-skeptic role '${result.role}' must not return verdict or feedback.`
        )
      );
    }
    return Result.ok(undefined);
  }

  if (result.verdict === undefined) {
    return Result.err(
      new AgentExecutionError(
        result.role,
        workspaceSlug,
        cycle,
        "Skeptic AgentResult must carry an explicit verdict ('APPROVED' | 'REJECTED')."
      )
    );
  }

  if (result.verdict === 'APPROVED') {
    if (result.feedback !== undefined) {
      return Result.err(
        new AgentExecutionError(
          result.role,
          workspaceSlug,
          cycle,
          "Skeptic AgentResult with verdict 'APPROVED' must not carry feedback."
        )
      );
    }
    return Result.ok(undefined);
  }

  // result.verdict === 'REJECTED'
  if (result.feedback === undefined || result.feedback.findings.length === 0) {
    return Result.err(
      new AgentExecutionError(
        result.role,
        workspaceSlug,
        cycle,
        "Skeptic AgentResult with verdict 'REJECTED' must carry feedback with at least one finding."
      )
    );
  }

  return Result.ok(undefined);
}

/**
 * Enforces gapless, 1-based sequential numbering of durable feedback records, catching
 * both missing cycles and reused cycle numbers.
 * @param history Feedback records in cycle order.
 * @param workspaceSlug Workspace the feedback belongs to, threaded into any raised error.
 * @returns `Result.ok(undefined)` when valid, or an `AgentExecutionError` otherwise.
 */
export function validateFeedbackSequence(
  history: readonly ContractFeedbackRecord[],
  workspaceSlug: string
): Result<void, AgentExecutionError> {
  for (let index = 0; index < history.length; index += 1) {
    const expectedCycle = index + 1;
    const record = history[index];
    if (record.cycle !== expectedCycle) {
      return Result.err(
        new AgentExecutionError(
          'skeptic',
          workspaceSlug,
          record.cycle,
          `Invalid feedback record sequence: index ${index} has cycle ${record.cycle}, expected ${expectedCycle}.`
        )
      );
    }
  }
  return Result.ok(undefined);
}

/**
 * Enforces that an `AgentContext` carries the minimum fields every Sub-Agent needs to run.
 * @param context Context about to be handed to a Sub-Agent's execute().
 * @param role Role of the agent this context is being validated for, threaded into any raised error.
 * @returns `Result.ok(undefined)` when valid, or an `AgentExecutionError` otherwise.
 */
export function validateAgentContext(
  context: AgentContext,
  role: AgentRole
): Result<void, AgentExecutionError> {
  if (context.workspaceSlug.trim().length === 0) {
    return Result.err(
      new AgentExecutionError(
        role,
        context.workspaceSlug,
        undefined,
        'AgentContext requires a non-empty workspaceSlug.'
      )
    );
  }

  if (context.requirementsPath.trim().length === 0) {
    return Result.err(
      new AgentExecutionError(
        role,
        context.workspaceSlug,
        undefined,
        'AgentContext requires a non-empty requirementsPath.'
      )
    );
  }

  return Result.ok(undefined);
}
