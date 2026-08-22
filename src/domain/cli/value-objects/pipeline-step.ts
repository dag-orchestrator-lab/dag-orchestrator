import { Result } from '../../common/result.js';

export type StepNumber = 0 | 1 | 2 | 3 | 4;

const STEP_COMMAND_PATTERN = /^step([0-4])$/;

// TODO(T-2): supersede with the shared CliDomainError-based InvalidStepError in src/domain/cli/errors.ts.
/** Raised when a step number or step command string falls outside the valid `0-4` pipeline range. */
export class InvalidStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStepError';
  }
}

/** Value object representing a valid step within the feature execution pipeline (`step0`-`step4`). */
export class PipelineStep {
  private constructor(public readonly value: StepNumber) {
    Object.freeze(this);
  }

  public static create(step: number): Result<PipelineStep, InvalidStepError> {
    if (Number.isInteger(step) && step >= 0 && step <= 4) {
      return Result.ok(new PipelineStep(step as StepNumber));
    }
    return Result.err(
      new InvalidStepError(`Invalid pipeline step: ${step}. Expected integer between 0 and 4.`)
    );
  }

  public static fromString(input: string): Result<PipelineStep, InvalidStepError> {
    const match = input.match(STEP_COMMAND_PATTERN);
    if (!match) {
      return Result.err(
        new InvalidStepError(`Invalid step command format: "${input}". Expected "step0" through "step4".`)
      );
    }
    return PipelineStep.create(parseInt(match[1], 10));
  }

  public toString(): string {
    return `step${this.value}`;
  }

  public equals(other: PipelineStep): boolean {
    return this.value === other.value;
  }
}
