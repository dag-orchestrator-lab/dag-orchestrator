import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';
import type { LLMExecutionOptions } from '../../../domain/llm/types/llm-execution-options.js';
import type { LLMProviderPort } from '../../../domain/llm/ports/llm-provider-port.js';
import type { StageProviderConfig } from '../../../domain/llm/types/stage-provider-config.js';

const OLLAMA_DEFAULT_ENDPOINT = 'http://localhost:11434';
const OLLAMA_GENERATE_PATH = '/api/generate';

interface OllamaGenerateResponse {
  readonly response?: string;
}

/**
 * Adapts the Ollama HTTP `/api/generate` endpoint to {@link LLMProviderPort}.
 */
export class OllamaAdapter implements LLMProviderPort {
  constructor(
    private readonly config: Pick<StageProviderConfig, 'model' | 'endpoint'>
  ) {}

  async execute(
    prompt: string,
    systemPrompt?: string,
    options?: LLMExecutionOptions
  ): Promise<string> {
    const { model, endpoint } = this.config;
    const url = `${endpoint || OLLAMA_DEFAULT_ENDPOINT}${OLLAMA_GENERATE_PATH}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: options?.temperature,
          },
        }),
      });
    } catch (cause) {
      console.error('Ollama request failed:', cause);
      throw new ProviderExecutionError(
        `Ollama request failed for model "${model}": ${cause instanceof Error ? cause.message : String(cause)}`,
        { providerType: 'ollama' }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Ollama API error (${response.status}):`, errorText);
      throw new ProviderExecutionError(
        `Ollama API error (${response.status}): ${errorText}`,
        { providerType: 'ollama' }
      );
    }

    let data: OllamaGenerateResponse;
    try {
      data = (await response.json()) as OllamaGenerateResponse;
    } catch (cause) {
      console.error('Ollama returned a malformed response:', cause);
      throw new ProviderExecutionError(
        `Ollama returned a malformed response for model "${model}"`,
        { providerType: 'ollama' }
      );
    }

    const text = data.response ?? '';

    if (!text) {
      throw new ProviderExecutionError(
        `Ollama returned no content for model "${model}"`,
        { providerType: 'ollama' }
      );
    }

    return text;
  }
}
