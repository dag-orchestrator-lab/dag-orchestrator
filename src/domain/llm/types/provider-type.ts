export type ProviderType = 'gemini' | 'claude-cli' | 'openai' | 'ollama';

export const SUPPORTED_PROVIDER_TYPES: readonly ProviderType[] = [
  'gemini',
  'claude-cli',
  'openai',
  'ollama',
] as const;

/**
 * @param value Candidate value to narrow.
 * @returns Whether `value` is one of the supported provider types.
 */
export function isProviderType(value: unknown): value is ProviderType {
  return (
    typeof value === 'string' &&
    (SUPPORTED_PROVIDER_TYPES as readonly string[]).includes(value)
  );
}
