import { Result } from '../../domain/common/result.js';
import { ProviderExecutionError } from '../../domain/llm/errors/provider-execution-error.js';
import { validateExecutionInput } from '../../domain/llm/validation/invariants.js';
import type { ProviderFactoryPort } from '../../domain/llm/ports/provider-factory-port.js';
import type { LLMExecutionOptions } from '../../domain/llm/types/llm-execution-options.js';
import type { StageProviderConfig } from '../../domain/llm/types/stage-provider-config.js';

/** Orchestrates provider resolution and prompt execution for a pipeline stage. */
export class ExecuteStagePromptUseCase {
  constructor(private readonly factory: ProviderFactoryPort) {}

  /**
   * @param stageName Pipeline stage key from `.dag/config.json`.
   * @param prompt The primary prompt content sent to the model.
   * @param systemPrompt Optional system/instruction prompt.
   * @param options Optional execution tuning (temperature, timeout, etc).
   * @param customConfig Optional override merged over the stage's resolved config.
   * @returns The model's plain-text response, or a `ProviderExecutionError` on invalid input or adapter failure.
   */
  public async execute(
    stageName: string,
    prompt: string,
    systemPrompt?: string,
    options?: LLMExecutionOptions,
    customConfig?: Partial<StageProviderConfig>
  ): Promise<Result<string, ProviderExecutionError>> {
    const promptString = String(prompt);

    const validationResult = validateExecutionInput(promptString, options);
    if (validationResult.isErr) return Result.err(validationResult.error);

    try {
      const handle = this.factory.getAdapter(stageName, customConfig);
      const response = await handle.instance.execute(promptString, systemPrompt, options);
      return Result.ok(response);
    } catch (error) {
      if (error instanceof ProviderExecutionError) {
        return Result.err(error);
      }
      return Result.err(new ProviderExecutionError(String(error instanceof Error ? error.message : error), { stageName }));
    }
  }
}
