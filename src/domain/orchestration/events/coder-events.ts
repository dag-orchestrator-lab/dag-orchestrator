import type { SubprocessExecutionResult } from '../models/subprocess-command.js';

/** Bus name published when the Coder Agent begins a task attempt. */
export const CODER_TASK_STARTED_EVENT_NAME = 'coder.task.started';

/** Bus name published when the Coder Agent's `verify` command completes for a task attempt. */
export const CODER_TASK_VERIFIED_EVENT_NAME = 'coder.task.verified';

/** Published when the Coder Agent begins implementing one task from `05-tasks.md`. */
export interface CoderTaskStartedEvent {
  readonly featureId: string;
  readonly taskId: string;
  readonly attemptNumber: number;
}

/** Published when the Coder Agent has run `verify` for a task attempt. */
export interface CoderTaskVerifiedEvent {
  readonly featureId: string;
  readonly taskId: string;
  readonly verifyResult: SubprocessExecutionResult;
}
