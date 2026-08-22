import { Result } from '../../common/result.js';
import { ProviderExecutionError } from '../errors/provider-execution-error.js';
import { isProviderType } from '../types/provider-type.js';
import type { LLMExecutionOptions } from '../types/llm-execution-options.js';
import type { StageProviderConfig } from '../types/stage-provider-config.js';

const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;

/**
 * @param prompt The primary prompt content intended for execution.
 * @param options Optional execution tuning to validate alongside the prompt.
 * @returns `Result.ok(undefined)` when input is valid, otherwise a `ProviderExecutionError`.
 */
export function validateExecutionInput(
  prompt: string,
  options?: LLMExecutionOptions
): Result<void, ProviderExecutionError> {
  if (prompt.trim().length === 0) {
    return Result.err(new ProviderExecutionError('Prompt must not be empty or whitespace-only'));
  }

  if (options?.temperature !== undefined) {
    if (options.temperature < MIN_TEMPERATURE || options.temperature > MAX_TEMPERATURE) {
      return Result.err(
        new ProviderExecutionError(
          `temperature must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}`
        )
      );
    }
  }

  if (options?.maxOutputTokens !== undefined && options.maxOutputTokens <= 0) {
    return Result.err(new ProviderExecutionError('maxOutputTokens must be a positive number'));
  }

  if (options?.timeoutMs !== undefined && options.timeoutMs <= 0) {
    return Result.err(new ProviderExecutionError('timeoutMs must be a positive number'));
  }

  return Result.ok(undefined);
}

/**
 * @param stageName Pipeline stage key from `.dag/config.json`.
 * @param config Candidate stage provider config to validate.
 * @returns `Result.ok(config)` when valid, otherwise a `ProviderExecutionError` tagged with `stageName`.
 */
export function validateStageConfig(
  stageName: string,
  config: StageProviderConfig
): Result<StageProviderConfig, ProviderExecutionError> {
  if (!isProviderType(config.type)) {
    return Result.err(
      new ProviderExecutionError(`Unrecognized or missing provider type for stage "${stageName}"`, {
        stageName,
        providerType: config.type,
      })
    );
  }

  if (config.model.trim().length === 0) {
    return Result.err(
      new ProviderExecutionError(`model must not be empty for stage "${stageName}"`, {
        stageName,
        providerType: config.type,
      })
    );
  }

  return Result.ok(config);
}
