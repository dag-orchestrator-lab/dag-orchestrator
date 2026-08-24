import { DomainError } from '../../common/errors.js';
import type { PipelineStageId } from '../models/pipeline-stage-id.js';

export interface ErrorCauseDetails {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/** Raised when a Sub-Agent's execute() encounters an unexpected failure, returned inside AgentResult rather than thrown. */
export class AgentExecutionError extends DomainError {
  readonly stageId: PipelineStageId;
  readonly causeDetails?: ErrorCauseDetails;

  constructor(
    stageId: PipelineStageId,
    message: string,
    causeDetails?: ErrorCauseDetails
  ) {
    super(`Sub-Agent execution failed for stage '${stageId}': ${message}`);
    this.name = 'AgentExecutionError';
    this.stageId = stageId;
    this.causeDetails = causeDetails;
  }
}
