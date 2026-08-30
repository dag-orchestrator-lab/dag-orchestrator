/** Bus name published when the pipeline advancer pauses at Gate 4 pending human sign-off. */
export const GATE4_PAUSED_EVENT_NAME = 'pipeline.gate4.paused';

/** Published when the pipeline advancer halts at Gate 4 until a `GateApproval` is recorded. */
export interface Gate4PausedEvent {
  readonly featureId: string;
}
