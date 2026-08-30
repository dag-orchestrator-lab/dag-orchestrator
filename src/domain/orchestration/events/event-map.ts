import { STAGE_COMPLETE_EVENT_NAME, type StageCompleteEvent } from './stage-complete-event.js';

/** Identifies which Planner Agent artifact a STAGE_COMPLETE event announces. */
export type PlannerStageName = '03-domain' | '03-app-infra' | '03-data' | '04-layer-findings' | '05-tasks';

/**
 * Backward-compatible extension of {@link StageCompleteEvent} for the Planner Agent (Epic 3):
 * `stageName` is optional so existing Epic 2 publishers, which never set it, remain valid.
 */
export type PlannerStageCompleteEvent = StageCompleteEvent & { readonly stageName?: PlannerStageName };

/** Map of every known event's bus name to its payload shape — closed set, extended per future epic. */
export interface OrchestrationEventMap {
  readonly [STAGE_COMPLETE_EVENT_NAME]: PlannerStageCompleteEvent;
}

export type OrchestrationEventName = keyof OrchestrationEventMap;
