import { DomainError } from '../common/errors.js';
import { PipelineStep } from './value-objects/pipeline-step.js';

/** Base class for all CLI-layer domain errors (see 03-domain.md §6). */
export abstract class CliDomainError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Raised when a pipeline step is invoked against a dirty Git working tree. */
export class DirtyWorkingTreeError extends CliDomainError {
  constructor(
    message: string,
    public readonly gitStatusOutput: string
  ) {
    super(message);
  }
}

/** Raised when Auto-Park detects an existing active workspace blocking a new one. */
export class WorkspaceCollisionError extends CliDomainError {
  constructor(
    public readonly activeWorkspaceName: string,
    public readonly targetWorkspaceName: string
  ) {
    super(
      `Cannot create workspace "${targetWorkspaceName}": workspace "${activeWorkspaceName}" is currently active.`
    );
  }
}

/** Raised when a pipeline step number or command string falls outside the valid `0-4` range. */
export class InvalidStepError extends CliDomainError {
  constructor(message: string) {
    super(message);
  }
}

/** Raised when the CLI receives a command it does not recognize. */
export class UnknownCommandError extends CliDomainError {
  constructor(public readonly rawCommand: string) {
    super(`Unrecognized command: "${rawCommand}". Run "dag --help" for usage.`);
  }
}

/** Raised when a Pipeline Advancer step fails during execution. */
export class StepExecutionFailedError extends CliDomainError {
  constructor(
    public readonly step: PipelineStep,
    public readonly cause: Error
  ) {
    super(`Pipeline step ${step.toString()} failed: ${cause.message}`);
  }
}
