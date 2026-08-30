import { STAGE_COMPLETE_EVENT_NAME, type StageCompleteEvent } from './stage-complete-event.js';
import {
  CODER_TASK_STARTED_EVENT_NAME,
  CODER_TASK_VERIFIED_EVENT_NAME,
  type CoderTaskStartedEvent,
  type CoderTaskVerifiedEvent,
} from './coder-events.js';
import {
  FIXER_PATCH_APPLIED_EVENT_NAME,
  FIXER_RETRIES_EXHAUSTED_EVENT_NAME,
  type FixerPatchAppliedEvent,
  type FixerRetriesExhaustedEvent,
} from './fixer-events.js';
import {
  REVIEW_COMPLETED_EVENT_NAME,
  CONTRACT_ADDENDUM_CREATED_EVENT_NAME,
  type ReviewCompletedEvent,
  type ContractAddendumCreatedEvent,
} from './reviewer-events.js';
import { GATE4_PAUSED_EVENT_NAME, type Gate4PausedEvent } from './pipeline-events.js';

/** Identifies which Planner Agent artifact a STAGE_COMPLETE event announces. */
export type PlannerStageName = '03-domain' | '03-app-infra' | '03-data' | '04-layer-findings' | '05-tasks';

/**
 * Backward-compatible extension of {@link StageCompleteEvent} for the Planner Agent (Epic 3):
 * `stageName` is optional so existing Epic 2 publishers, which never set it, remain valid.
 */
export type PlannerStageCompleteEvent = StageCompleteEvent & { readonly stageName?: PlannerStageName };

/** Name of the in-process event bus all orchestration events are published on. */
export const ORCHESTRATION_EVENT_BUS_NAME = 'orchestration-events';

/** Map of every known event's bus name to its payload shape — closed set, extended per future epic. */
export interface OrchestrationEventMap {
  readonly [STAGE_COMPLETE_EVENT_NAME]: PlannerStageCompleteEvent;
  readonly [CODER_TASK_STARTED_EVENT_NAME]: CoderTaskStartedEvent;
  readonly [CODER_TASK_VERIFIED_EVENT_NAME]: CoderTaskVerifiedEvent;
  readonly [FIXER_PATCH_APPLIED_EVENT_NAME]: FixerPatchAppliedEvent;
  readonly [FIXER_RETRIES_EXHAUSTED_EVENT_NAME]: FixerRetriesExhaustedEvent;
  readonly [REVIEW_COMPLETED_EVENT_NAME]: ReviewCompletedEvent;
  readonly [CONTRACT_ADDENDUM_CREATED_EVENT_NAME]: ContractAddendumCreatedEvent;
  readonly [GATE4_PAUSED_EVENT_NAME]: Gate4PausedEvent;
}

export type OrchestrationEventName = keyof OrchestrationEventMap;
