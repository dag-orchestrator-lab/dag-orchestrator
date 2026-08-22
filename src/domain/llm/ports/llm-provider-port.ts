import type { LLMExecutionOptions } from '../types/llm-execution-options.js';

export interface LLMProviderPort {
  /**
   * Executes a prompt against the underlying LLM transport.
   * @param prompt - The primary prompt content sent to the model.
   * @param systemPrompt - Optional system/instruction prompt.
   * @param options - Optional execution tuning (temperature, timeout, etc).
   * @returns The model's plain-text response.
   * @throws {ProviderExecutionError} On transport failure, timeout, rate limit, or invalid response.
   */
  execute(
    prompt: string,
    systemPrompt?: string,
    options?: LLMExecutionOptions
  ): Promise<string>;
}
