import type { PipelineStageId } from './pipeline-stage-id.js';

/** A reference to an artifact file produced by a pipeline stage. */
export interface ArtifactReference {
  readonly stageId: PipelineStageId;
  readonly absolutePath: string;
}
