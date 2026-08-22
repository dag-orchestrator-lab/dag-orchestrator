import { Result } from '../../domain/common/result.js';
import { ProviderExecutionError } from '../../domain/llm/errors/provider-execution-error.js';
import type { ProviderFactoryPort } from '../../domain/llm/ports/provider-factory-port.js';
import type { ResolvedProviderHandle } from '../../domain/llm/types/resolved-provider-handle.js';
import type { StageProviderConfig } from '../../domain/llm/types/stage-provider-config.js';

/** Resolves the legacy-shaped provider handle for a pipeline stage. */
export class GetProviderForStageUseCase {
  constructor(private readonly factory: ProviderFactoryPort) {}

  /**
   * @param stageName Pipeline stage key from `.dag/config.json`.
   * @param customConfig Optional override merged over the stage's resolved config.
   * @returns The resolved provider handle, or a `ProviderExecutionError` if resolution fails.
   */
  public execute(
    stageName: string,
    customConfig?: Partial<StageProviderConfig>
  ): Result<ResolvedProviderHandle, ProviderExecutionError> {
    try {
      const handle = this.factory.getAdapter(stageName, customConfig);
      return Result.ok(handle);
    } catch (error) {
      if (error instanceof ProviderExecutionError) {
        return Result.err(error);
      }
      return Result.err(new ProviderExecutionError(String(error instanceof Error ? error.message : error), { stageName }));
    }
  }
}
