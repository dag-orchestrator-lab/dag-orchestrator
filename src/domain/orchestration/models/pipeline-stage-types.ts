/** The single stage-name enum for the pipeline; no parallel stage-name type is introduced elsewhere. */
export type SwarmAgentStage =
  | 'RECON'
  | 'ARCHITECT'
  | 'SKEPTIC'
  | 'PLANNER'
  | 'CODER_RUNNING'
  | 'FIXER_RUNNING'
  | 'REVIEWER_RUNNING'
  | 'GATE4_PAUSED'
  | 'BLOCKED'
  | 'COMPLETED';

/** Identifies a specific pipeline stage instance for a feature. */
export interface PipelineStageIdentity {
  readonly featureId: string;
  readonly stageName: SwarmAgentStage;
}
