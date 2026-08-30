import { DomainError } from '../../common/errors.js';

/** Raised when a `SubprocessExecutionPort.execute()` call cannot even launch the target executable. */
export class SubprocessSpawnError extends DomainError {
  readonly executable: string;
  readonly args: readonly string[];
  readonly causeError: Error;

  constructor(executable: string, args: readonly string[], cause: Error) {
    super(`Failed to spawn process execution for '${executable}': ${cause.message}`);
    this.name = 'SubprocessSpawnError';
    this.executable = executable;
    this.args = args;
    this.causeError = cause;
  }
}
