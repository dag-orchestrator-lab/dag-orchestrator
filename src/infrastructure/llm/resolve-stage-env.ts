import type { StageProviderConfig } from '../../domain/llm/types/stage-provider-config.js';

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const DEFAULT_CLAUDE_CLI_PATH = 'claude';

/**
 * Fills in credential/endpoint fields missing from a stage's provider config
 * from process environment variables, so downstream validation/construction
 * never sees an absent value that is actually available via the environment.
 * @param config Candidate stage provider config, possibly missing credentials.
 * @returns A new config with `apiKey`, `endpoint`, and `cliPath` resolved from env where applicable.
 */
export function resolveStageEnv(
  config: Partial<StageProviderConfig>
): Partial<StageProviderConfig> {
  const apiKey =
    config.apiKey ??
    (config.type === 'gemini'
      ? process.env.GEMINI_API_KEY
      : config.type === 'openai'
        ? process.env.OPENAI_API_KEY
        : undefined);

  const endpoint =
    config.type === 'ollama'
      ? (config.endpoint ?? process.env.OLLAMA_ENDPOINT ?? DEFAULT_OLLAMA_ENDPOINT)
      : config.endpoint;

  const cliPath =
    config.type === 'claude-cli'
      ? (config.cliPath ?? process.env.CLAUDE_CLI_PATH ?? DEFAULT_CLAUDE_CLI_PATH)
      : config.cliPath;

  return { ...config, apiKey, endpoint, cliPath };
}
