import type { ProviderType } from './provider-type.js';

export interface StageProviderConfig {
  readonly type: ProviderType;
  readonly model: string;
  readonly apiKey?: string;
  readonly endpoint?: string;
  readonly cliPath?: string;
}
