import { MAX_FIXER_RETRIES } from '../models/verify-command.js';
import { TaskAttemptLimitExceededError } from '../errors/task-attempt-limit-error.js';

/** Invariant checks for `TaskExecutionAttempt.attemptNumber` bounds. */
export class TaskAttemptInvariants {
  /**
   * Asserts that `attemptNumber` does not exceed `1 + MAX_FIXER_RETRIES`.
   * @param taskId - identity of the task being attempted, threaded into the error.
   * @param attemptNumber - the attempt number to validate.
   * @throws TaskAttemptLimitExceededError if `attemptNumber` exceeds `1 + MAX_FIXER_RETRIES`.
   */
  public static assertValidAttemptNumber(taskId: string, attemptNumber: number): void {
    const maxAttempts = 1 + MAX_FIXER_RETRIES;
    if (attemptNumber > maxAttempts) {
      throw new TaskAttemptLimitExceededError(
        taskId,
        attemptNumber,
        `attemptNumber exceeds the maximum of ${maxAttempts} (1 + MAX_FIXER_RETRIES)`
      );
    }
  }
}
