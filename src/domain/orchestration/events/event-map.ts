import type { StageCompleteEvent } from './stage-complete-event.js';

/** Map of every known event's detail-type string to its payload shape — closed set, extended per future epic. */
export interface OrchestrationEventMap {
  readonly STAGE_COMPLETE: StageCompleteEvent;
}

export type OrchestrationEventName = keyof OrchestrationEventMap;
