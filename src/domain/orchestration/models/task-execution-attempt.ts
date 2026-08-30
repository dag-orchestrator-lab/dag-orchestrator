import type { SubprocessExecutionResult } from './subprocess-command.js';

/** Identity of a single Coder/Fixer execution attempt for a task in `05-tasks.md`. */
export interface TaskExecutionAttemptIdentity {
  readonly taskId: string;
  readonly attemptNumber: number;
}

export type TaskAttemptStatus = 'RUNNING' | 'VERIFIED' | 'FAILED' | 'EXHAUSTED';

/** Maximum number of trailing characters kept when summarizing a failed verify run's combined output. */
const STACK_TRACE_SUMMARY_MAX_CHARS = 4000;

/** Immutable record of one Coder/Fixer execution attempt; the sole representation used by every consumer of task execution state. */
export class TaskExecutionAttempt {
  readonly taskId: string;
  readonly attemptNumber: number;
  readonly status: TaskAttemptStatus;
  readonly verifyResult?: SubprocessExecutionResult;
  readonly stackTraceSummary?: string;

  private constructor(props: {
    taskId: string;
    attemptNumber: number;
    status: TaskAttemptStatus;
    verifyResult?: SubprocessExecutionResult;
    stackTraceSummary?: string;
  }) {
    this.taskId = props.taskId;
    this.attemptNumber = props.attemptNumber;
    this.status = props.status;
    this.verifyResult = props.verifyResult;
    this.stackTraceSummary = props.stackTraceSummary;
  }

  /**
   * Creates the first attempt (attemptNumber 1) for a task, in `RUNNING` status.
   * @param taskId - identity of the task in `05-tasks.md` being attempted.
   * @returns a new `TaskExecutionAttempt` in `RUNNING` status.
   */
  public static createInitial(taskId: string): TaskExecutionAttempt {
    return new TaskExecutionAttempt({
      taskId,
      attemptNumber: 1,
      status: 'RUNNING',
    });
  }

  /**
   * Creates the next attempt following a Fixer patch, incrementing `attemptNumber`.
   * @param priorAttempt - the attempt this one follows.
   * @param stackTraceSummary - summary carried forward describing why the prior attempt failed.
   * @returns a new `TaskExecutionAttempt` in `RUNNING` status.
   */
  public static createNext(
    priorAttempt: TaskExecutionAttempt,
    stackTraceSummary: string
  ): TaskExecutionAttempt {
    return new TaskExecutionAttempt({
      taskId: priorAttempt.taskId,
      attemptNumber: priorAttempt.attemptNumber + 1,
      status: 'RUNNING',
      stackTraceSummary,
    });
  }

  /**
   * Records the outcome of running `verify` for this attempt.
   * @param result - the captured subprocess execution result from `verify`.
   * @returns a new `TaskExecutionAttempt` in `VERIFIED` or `FAILED` status, with `stackTraceSummary` populated on failure.
   */
  public recordResult(result: SubprocessExecutionResult): TaskExecutionAttempt {
    const isSuccess = result.exitCode === 0 && !result.didTimeout;
    return new TaskExecutionAttempt({
      taskId: this.taskId,
      attemptNumber: this.attemptNumber,
      status: isSuccess ? 'VERIFIED' : 'FAILED',
      verifyResult: result,
      stackTraceSummary: isSuccess ? undefined : this.extractStackTrace(result),
    });
  }

  /**
   * Marks this attempt as exhausted after `MAX_FIXER_RETRIES` has been reached.
   * @returns a new `TaskExecutionAttempt` in `EXHAUSTED` status.
   */
  public markExhausted(): TaskExecutionAttempt {
    return new TaskExecutionAttempt({
      taskId: this.taskId,
      attemptNumber: this.attemptNumber,
      status: 'EXHAUSTED',
      verifyResult: this.verifyResult,
      stackTraceSummary: this.stackTraceSummary,
    });
  }

  /** Combines stdout and stderr into a single trailing summary, since a failure can surface in either stream. */
  private extractStackTrace(result: SubprocessExecutionResult): string {
    const combined = `${result.stdout}\n${result.stderr}`.trim();
    return combined.length > STACK_TRACE_SUMMARY_MAX_CHARS
      ? combined.slice(-STACK_TRACE_SUMMARY_MAX_CHARS)
      : combined;
  }
}
