import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';
import type { LLMExecutionOptions } from '../../../domain/llm/types/llm-execution-options.js';
import type { LLMProviderPort } from '../../../domain/llm/ports/llm-provider-port.js';
import type { StageProviderConfig } from '../../../domain/llm/types/stage-provider-config.js';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_TEMPERATURE = 0.2;

interface OpenAIChatMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

interface OpenAIChatCompletionChoice {
  readonly message?: {
    readonly content?: string;
  };
}

interface OpenAIChatCompletionResponse {
  readonly choices?: readonly OpenAIChatCompletionChoice[];
}

/**
 * Adapts the OpenAI-compatible `/chat/completions` HTTP API to {@link LLMProviderPort}.
 */
export class OpenAIAdapter implements LLMProviderPort {
  constructor(
    private readonly config: Pick<StageProviderConfig, 'apiKey' | 'model' | 'endpoint'>
  ) {}

  async execute(
    prompt: string,
    systemPrompt?: string,
    options?: LLMExecutionOptions
  ): Promise<string> {
    const { apiKey, model, endpoint } = this.config;
    if (!apiKey) {
      throw new ProviderExecutionError('OpenAI API key is not set.', {
        providerType: 'openai',
      });
    }

    const url = endpoint || OPENAI_CHAT_COMPLETIONS_URL;

    const messages: OpenAIChatMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
        }),
      });
    } catch (cause) {
      console.error('OpenAI request failed:', cause);
      throw new ProviderExecutionError(
        `OpenAI request failed for model "${model}": ${cause instanceof Error ? cause.message : String(cause)}`,
        { providerType: 'openai' }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API error (${response.status}):`, errorText);
      throw new ProviderExecutionError(
        `OpenAI API error (${response.status}): ${errorText}`,
        { providerType: 'openai' }
      );
    }

    const data = (await response.json()) as OpenAIChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content ?? '';

    if (!text) {
      throw new ProviderExecutionError(
        `OpenAI returned no content for model "${model}"`,
        { providerType: 'openai' }
      );
    }

    return text;
  }
}
