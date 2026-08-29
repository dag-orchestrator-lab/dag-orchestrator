import { STAGE_COMPLETE_EVENT_NAME, type StageCompleteEvent } from './stage-complete-event.js';

/** Map of every known event's bus name to its payload shape — closed set, extended per future epic. */
export interface OrchestrationEventMap {
  readonly [STAGE_COMPLETE_EVENT_NAME]: StageCompleteEvent;
}

export type OrchestrationEventName = keyof OrchestrationEventMap;
