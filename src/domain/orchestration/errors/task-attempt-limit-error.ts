import { DomainError } from '../../common/errors.js';

/** Raised when a `TaskExecutionAttempt.attemptNumber` would exceed `1 + MAX_FIXER_RETRIES`. */
export class TaskAttemptLimitExceededError extends DomainError {
  readonly taskId: string;
  readonly attemptNumber: number;

  constructor(taskId: string, attemptNumber: number, message: string) {
    super(`Task execution attempt limit exceeded for task '${taskId}' at attempt ${attemptNumber}: ${message}`);
    this.name = 'TaskAttemptLimitExceededError';
    this.taskId = taskId;
    this.attemptNumber = attemptNumber;
  }
}
