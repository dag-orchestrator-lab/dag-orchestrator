import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';
import type { LLMExecutionOptions } from '../../../domain/llm/types/llm-execution-options.js';
import type { LLMProviderPort } from '../../../domain/llm/ports/llm-provider-port.js';
import type { StageProviderConfig } from '../../../domain/llm/types/stage-provider-config.js';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiContentPart {
  readonly text?: string;
}

interface GeminiCandidate {
  readonly content?: {
    readonly parts?: readonly GeminiContentPart[];
  };
}

interface GeminiGenerateContentResponse {
  readonly candidates?: readonly GeminiCandidate[];
}

/**
 * Adapts Google's Gemini `generateContent` HTTP API to {@link LLMProviderPort}.
 */
export class GeminiAdapter implements LLMProviderPort {
  constructor(private readonly config: Pick<StageProviderConfig, 'apiKey' | 'model'>) {}

  async execute(
    prompt: string,
    systemPrompt?: string,
    options?: LLMExecutionOptions
  ): Promise<string> {
    const { apiKey, model } = this.config;
    if (!apiKey) {
      throw new ProviderExecutionError('GEMINI_API_KEY is not set.', {
        providerType: 'gemini',
      });
    }

    const url = `${GEMINI_API_BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const requestBody: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };
    if (systemPrompt) {
      requestBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    if (options?.temperature !== undefined || options?.maxOutputTokens !== undefined) {
      requestBody.generationConfig = {
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxOutputTokens !== undefined && { maxOutputTokens: options.maxOutputTokens }),
      };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (cause) {
      console.error('Gemini request failed:', cause);
      throw new ProviderExecutionError(
        `Gemini request failed for model "${model}": ${cause instanceof Error ? cause.message : String(cause)}`,
        { providerType: 'gemini' }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error (${response.status}):`, errorText);
      throw new ProviderExecutionError(
        `Gemini API error (${response.status}): ${errorText}`,
        { providerType: 'gemini' }
      );
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

    if (!data.candidates || data.candidates.length === 0 || !text) {
      throw new ProviderExecutionError(
        `Gemini returned no candidates for model "${model}"`,
        { providerType: 'gemini' }
      );
    }

    return text;
  }
}
