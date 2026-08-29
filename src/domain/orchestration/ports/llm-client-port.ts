/** A single completion request to an LLM adapter, decoupled from any concrete provider SDK. */
export interface LlmCompletionOptions {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

/** Port a Sub-Agent uses to obtain generated text without depending on a concrete LLM provider. */
export interface LlmClientPort {
  /**
   * Requests a single completion from the underlying LLM provider.
   * @param options - the prompt and generation parameters for this request
   * @returns the generated completion text
   */
  complete(options: LlmCompletionOptions): Promise<string>;
}
