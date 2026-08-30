import { DomainError } from '../../common/errors.js';

/** Raised when a `PipelineStage` transition would violate a stage-ordering invariant. */
export class InvalidStageTransitionError extends DomainError {
  readonly targetStage: string;

  constructor(targetStage: string, message: string) {
    super(`Invalid stage transition to '${targetStage}': ${message}`);
    this.name = 'InvalidStageTransitionError';
    this.targetStage = targetStage;
  }
}
