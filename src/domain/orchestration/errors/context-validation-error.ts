import { DomainError } from '../../common/errors.js';

/** Distinguishes which AgentContext invariant was violated. */
export type ContextValidationErrorCode =
  | 'RELATIVE_WORKING_DIRECTORY'
  | 'INVALID_ARTIFACT_REF';

/** Raised when an AgentContext is constructed with an invalid working directory or artifact reference. */
export class ContextValidationError extends DomainError {
  constructor(
    message: string,
    public readonly code: ContextValidationErrorCode
  ) {
    super(message);
    this.name = 'ContextValidationError';
  }
}
