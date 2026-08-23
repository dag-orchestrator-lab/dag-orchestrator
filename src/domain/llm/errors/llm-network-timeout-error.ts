import { ProviderExecutionError, type ProviderExecutionErrorOptions } from './provider-execution-error.js';

/** Raised when an LLM provider adapter's network call or subprocess times out (see 05-tasks.md T-19). */
export class LlmNetworkTimeoutError extends ProviderExecutionError {
  constructor(message: string, options?: ProviderExecutionErrorOptions) {
    super(message, options);
    this.name = 'LlmNetworkTimeoutError';
  }
}
