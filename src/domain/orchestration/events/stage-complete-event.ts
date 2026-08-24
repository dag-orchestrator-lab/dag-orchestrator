import type { PipelineStageId } from '../models/pipeline-stage-id.js';

/** Published when a Sub-Agent finishes, carrying the absolute path to the artifact it produced. */
export interface StageCompleteEvent {
  readonly detailType: 'STAGE_COMPLETE';
  readonly source: PipelineStageId;
  readonly artifactAbsolutePath: string;
  readonly occurredAt: string;
}
