import { DomainError } from '../../common/errors.js';

/** Distinguishes which StageCompleteEvent invariant was violated. */
export type EventValidationErrorCode = 'EMPTY_PATH' | 'RELATIVE_PATH';

/** Raised when an IpcBus publish attempt carries an invalid artifact path. */
export class EventValidationError extends DomainError {
  constructor(
    message: string,
    public readonly code: EventValidationErrorCode
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}
