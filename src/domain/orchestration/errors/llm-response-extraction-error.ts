import { DomainError } from '../../common/errors.js';

/** Distinguishes why an LLM response could not be extracted into the expected shape. */
export type LlmResponseExtractionErrorCode = 'NO_JSON_FOUND' | 'MALFORMED_JSON' | 'TAG_NOT_FOUND';

/** Raised when a raw LLM completion does not contain the JSON payload or XML block callers expect. */
export class LlmResponseExtractionError extends DomainError {
  constructor(
    message: string,
    public readonly code: LlmResponseExtractionErrorCode
  ) {
    super(message);
    this.name = 'LlmResponseExtractionError';
  }
}
