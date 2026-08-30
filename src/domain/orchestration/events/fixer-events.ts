/** Bus name published when the Fixer Agent applies a patch for a failed verify attempt. */
export const FIXER_PATCH_APPLIED_EVENT_NAME = 'fixer.patch.applied';

/** Bus name published when the Fixer Agent has exhausted `MAX_FIXER_RETRIES` for a task. */
export const FIXER_RETRIES_EXHAUSTED_EVENT_NAME = 'fixer.retries.exhausted';

/** Published when the Fixer Agent produces a patch in response to a failed `verify`. */
export interface FixerPatchAppliedEvent {
  readonly featureId: string;
  readonly taskId: string;
  readonly attemptNumber: number;
  readonly stackTraceSummary: string;
}

/** Published when the Fixer Agent's retries for a task are exhausted and the stage must be blocked. */
export interface FixerRetriesExhaustedEvent {
  readonly featureId: string;
  readonly taskId: string;
  readonly maxRetries: number;
}
