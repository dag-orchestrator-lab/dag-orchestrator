import type { LLMProviderPort } from '../ports/llm-provider-port.js';
import type { ProviderType } from './provider-type.js';

export interface ResolvedProviderHandle {
  readonly name: string;
  readonly model: string;
  readonly type: ProviderType;
  readonly instance: LLMProviderPort;
}
