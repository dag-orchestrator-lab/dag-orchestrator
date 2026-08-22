import type { ResolvedProviderHandle } from '../types/resolved-provider-handle.js';
import type { StageProviderConfig } from '../types/stage-provider-config.js';

export interface ProviderFactoryPort {
  /**
   * Resolves and returns a cached (or newly created) provider handle for a stage.
   * @param stageName - Pipeline stage key from `.dag/config.json`.
   * @param customConfig - Optional override merged over the stage's resolved config.
   * @returns The resolved legacy-shaped provider handle for the stage.
   * @throws {ProviderExecutionError} If the stage config is missing/invalid or the provider type is unsupported.
   */
  getAdapter(
    stageName: string,
    customConfig?: Partial<StageProviderConfig>
  ): ResolvedProviderHandle;
}
