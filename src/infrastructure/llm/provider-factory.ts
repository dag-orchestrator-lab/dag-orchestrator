import { loadConfig } from '../config.js';
import { ProviderExecutionError } from '../../domain/llm/errors/provider-execution-error.js';
import { isProviderType } from '../../domain/llm/types/provider-type.js';
import { validateStageConfig } from '../../domain/llm/validation/invariants.js';
import { resolveStageEnv } from './resolve-stage-env.js';
import { GeminiAdapter } from './adapters/gemini-adapter.js';
import { ClaudeCliAdapter } from './adapters/claude-cli-adapter.js';
import { OpenAIAdapter } from './adapters/openai-adapter.js';
import { OllamaAdapter } from './adapters/ollama-adapter.js';
import type { LLMProviderPort } from '../../domain/llm/ports/llm-provider-port.js';
import type { ProviderFactoryPort } from '../../domain/llm/ports/provider-factory-port.js';
import type { ResolvedProviderHandle } from '../../domain/llm/types/resolved-provider-handle.js';
import type { StageProviderConfig } from '../../domain/llm/types/stage-provider-config.js';

const CACHE_KEY_SEPARATOR = '::';
const CACHE_KEY_EMPTY_FIELD = '';

/**
 * Narrows a resolved (post env-fallback) partial config into a full
 * {@link StageProviderConfig}, throwing early when `type` is missing or
 * unrecognized so callers never construct a cache key from `undefined`.
 * @param stageName Pipeline stage key from `.dag/config.json`.
 * @param config Merged and env-resolved candidate config.
 * @throws {ProviderExecutionError} If `type` is missing or unrecognized.
 */
function toStageProviderConfig(
  stageName: string,
  config: Partial<StageProviderConfig>
): StageProviderConfig {
  const { type } = config;
  if (!isProviderType(type)) {
    throw new ProviderExecutionError(
      `Unrecognized or missing provider type for stage "${stageName}"`,
      { stageName, providerType: type }
    );
  }

  return {
    type,
    model: config.model ?? '',
    apiKey: config.apiKey,
    endpoint: config.endpoint,
    cliPath: config.cliPath,
  };
}

/**
 * @param config The fully resolved (post env-fallback) stage provider config.
 * @returns A cache key that changes whenever any credential/endpoint-relevant field differs.
 */
function computeCacheKey(config: StageProviderConfig): string {
  return [
    config.type,
    config.model,
    config.apiKey ?? CACHE_KEY_EMPTY_FIELD,
    config.endpoint ?? CACHE_KEY_EMPTY_FIELD,
    config.cliPath ?? CACHE_KEY_EMPTY_FIELD,
  ].join(CACHE_KEY_SEPARATOR);
}

/**
 * @param config The fully resolved (post env-fallback, post-validation) stage provider config.
 * @returns A newly constructed adapter instance matching `config.type`.
 * @throws {ProviderExecutionError} If `config.type` is not a recognized provider type; unreachable
 *   in practice because {@link toStageProviderConfig} already narrows via {@link isProviderType}.
 */
function createAdapter(config: StageProviderConfig): LLMProviderPort {
  switch (config.type) {
    case 'gemini':
      return new GeminiAdapter(config);
    case 'claude-cli':
      return new ClaudeCliAdapter(config);
    case 'openai':
      return new OpenAIAdapter(config);
    case 'ollama':
      return new OllamaAdapter(config);
    default: {
      const exhaustiveCheck: never = config.type;
      throw new ProviderExecutionError(
        `Unrecognized provider type "${String(exhaustiveCheck)}"`,
        { providerType: exhaustiveCheck }
      );
    }
  }
}

export class ProviderFactory implements ProviderFactoryPort {
  private readonly adapterCache = new Map<string, LLMProviderPort>();

  getAdapter(
    stageName: string,
    customConfig?: Partial<StageProviderConfig>
  ): ResolvedProviderHandle {
    const dagConfig = loadConfig();
    const stageConfig = dagConfig.stages?.[stageName]?.provider;

    const mergedConfig: Partial<StageProviderConfig> = {
      ...stageConfig,
      ...customConfig,
    };

    const resolvedConfig = resolveStageEnv(mergedConfig);
    const candidateConfig = toStageProviderConfig(stageName, resolvedConfig);

    const validation = validateStageConfig(stageName, candidateConfig);
    if (validation.isErr) {
      throw validation.error;
    }
    const validatedConfig = validation.value;

    const cacheKey = computeCacheKey(validatedConfig);
    const cachedInstance = this.adapterCache.get(cacheKey);
    const instance = cachedInstance ?? createAdapter(validatedConfig);
    if (!cachedInstance) {
      this.adapterCache.set(cacheKey, instance);
    }

    return {
      name: validatedConfig.type,
      model: validatedConfig.model,
      type: validatedConfig.type,
      instance,
    };
  }
}
