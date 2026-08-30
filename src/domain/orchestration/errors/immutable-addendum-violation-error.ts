import { DomainError } from '../../common/errors.js';

/** Raised when a write attempt would mutate a previously written `ContractAddendum` instead of creating a new one. */
export class ImmutableAddendumViolationError extends DomainError {
  constructor(message: string) {
    super(`ContractAddendum Immutability Violation: ${message}`);
    this.name = 'ImmutableAddendumViolationError';
  }
}
