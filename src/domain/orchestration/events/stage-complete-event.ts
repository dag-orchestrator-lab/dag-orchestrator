import type { AgentRole } from '../models/agent-role.js';

/** Bus name a Sub-Agent publishes on after producing its artifact — the only event this feature emits. */
export const STAGE_COMPLETE_EVENT_NAME = 'orchestration.stage.complete';

/** Published when a Sub-Agent finishes, carrying the absolute path to the artifact it produced. */
export interface StageCompleteEvent {
  readonly role: AgentRole;
  readonly workspaceSlug: string;
  readonly artifactPath: string;
  readonly timestamp: string;
}
