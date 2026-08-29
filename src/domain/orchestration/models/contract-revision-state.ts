import { Result } from '../../common/result.js';
import { AgentExecutionError } from '../errors/agent-execution-error.js';
import { validateAgentResult, validateFeedbackSequence } from '../validation/contract-invariants.js';
import type { AgentResult } from './agent-result.js';
import type { ContractFeedbackRecord } from './contract-feedback-record.js';

/** Lifecycle status of a feature workspace's contract revision loop. */
export type RevisionStatus = 'IN_PROGRESS' | 'APPROVED';

/**
 * Aggregate root tracking a feature workspace's Skeptic-Architect revision cycle:
 * the current cycle number, whether the contract has been approved, and the
 * append-only history of feedback records that drove each revision.
 */
export class ContractRevisionState {
  private constructor(
    public readonly workspaceSlug: string,
    private _currentCycle: number,
    private _status: RevisionStatus,
    private readonly _feedbackHistory: ContractFeedbackRecord[]
  ) {}

  /** Starts a fresh revision state for a workspace with no prior cycles. */
  public static create(workspaceSlug: string): ContractRevisionState {
    return new ContractRevisionState(workspaceSlug, 0, 'IN_PROGRESS', []);
  }

  /**
   * Rehydrates a revision state from durable storage, validating that the
   * persisted feedback history is a gapless, 1-based sequence.
   */
  public static reconstruct(
    workspaceSlug: string,
    currentCycle: number,
    status: RevisionStatus,
    feedbackHistory: readonly ContractFeedbackRecord[]
  ): Result<ContractRevisionState, AgentExecutionError> {
    const sequenceValidation = validateFeedbackSequence(feedbackHistory, workspaceSlug);
    if (sequenceValidation.isErr) {
      return Result.err(sequenceValidation.error);
    }

    return Result.ok(new ContractRevisionState(workspaceSlug, currentCycle, status, [...feedbackHistory]));
  }

  public get currentCycle(): number {
    return this._currentCycle;
  }

  public get status(): RevisionStatus {
    return this._status;
  }

  public get feedbackHistory(): readonly ContractFeedbackRecord[] {
    return [...this._feedbackHistory];
  }

  /**
   * Applies a Skeptic `AgentResult` to the revision state: an `APPROVED` verdict
   * freezes the state, while a `REJECTED` verdict advances the cycle and appends
   * its feedback record, provided the record's cycle is exactly `currentCycle + 1`.
   * @throws never; failures are returned as `Result.err`.
   */
  public applySkepticResult(result: AgentResult): Result<void, AgentExecutionError> {
    if (this._status === 'APPROVED') {
      return Result.err(
        new AgentExecutionError(
          'skeptic',
          this.workspaceSlug,
          this._currentCycle,
          'Cannot apply a Skeptic result: this contract is already APPROVED.'
        )
      );
    }

    const resultValidation = validateAgentResult(result, this.workspaceSlug);
    if (resultValidation.isErr) {
      return Result.err(resultValidation.error);
    }

    if (result.verdict === 'APPROVED') {
      this._status = 'APPROVED';
      return Result.ok(undefined);
    }

    const feedback = result.feedback as ContractFeedbackRecord;
    const expectedCycle = this._currentCycle + 1;

    if (feedback.cycle !== expectedCycle) {
      return Result.err(
        new AgentExecutionError(
          'skeptic',
          this.workspaceSlug,
          feedback.cycle,
          `Feedback cycle mismatch: expected cycle ${expectedCycle}, got ${feedback.cycle}.`
        )
      );
    }

    this._currentCycle = expectedCycle;
    this._feedbackHistory.push(feedback);
    return Result.ok(undefined);
  }
}
