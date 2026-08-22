import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** Directory name of the `.dag` workspace root, relative to `rootDir`. */
const DAG_DIR_NAME = '.dag';

/** Directory name for active feature workspaces, relative to `dagDir`. */
const FEATURES_DIR_NAME = 'features';

/** Directory name for archived feature workspaces, relative to `dagDir` — must match `src/state.js`'s literal exactly. */
const ARCHIVED_DIR_NAME = 'archive';

export interface Configuration {
  readonly rootDir: string;
  readonly dagDir: string;
  readonly featuresDir: string;
  readonly archivedDir: string;
}

/**
 * @returns The resolved workspace configuration, rooted at `DAG_WORKSPACE_ROOT` if set, else `process.cwd()`.
 */
export function resolveConfiguration(): Configuration {
  const rootDir = process.env.DAG_WORKSPACE_ROOT ?? process.cwd();
  const dagDir = path.join(rootDir, DAG_DIR_NAME);
  const featuresDir = path.join(dagDir, FEATURES_DIR_NAME);
  const archivedDir = path.join(dagDir, ARCHIVED_DIR_NAME);
  return { rootDir, dagDir, featuresDir, archivedDir };
}

/** Maps deprecated `.dag/config.json` provider names to their current `ProviderType` equivalents. */
const LEGACY_PROVIDER_TYPE_ALIASES: Readonly<Record<string, string>> = {
  claude: 'claude-cli',
  google: 'gemini',
};

/** The four LLM providers `ProviderFactory` knows how to build an adapter for. */
export const ProviderTypeSchema = z.preprocess(
  (value) => (typeof value === 'string' && value in LEGACY_PROVIDER_TYPE_ALIASES
    ? LEGACY_PROVIDER_TYPE_ALIASES[value]
    : value),
  z.enum(['gemini', 'claude-cli', 'openai', 'ollama'])
);

export type ProviderType = z.infer<typeof ProviderTypeSchema>;

/**
 * Per-stage LLM provider configuration, as resolved from `.dag/config.json`.
 * Strict: unknown/malformed fields fail fast at `loadConfig()` time rather
 * than being silently stripped and deferred to adapter-time `ProviderExecutionError`.
 */
export const StageProviderConfigSchema = z
  .object({
    type: ProviderTypeSchema,
    model: z.string().min(1, 'Model identifier must not be empty'),
    apiKey: z.string().optional(),
    endpoint: z.string().url('Endpoint must be a valid URL').optional(),
    cliPath: z.string().optional(),
  })
  .strict();

export type StageProviderConfig = z.infer<typeof StageProviderConfigSchema>;

/**
 * Additive (expand-phase) schema for `.dag/config.json`.
 * Uses `.passthrough()` and all-optional fields so every pre-existing
 * fixture keeps parsing unmodified while `stages[].provider` is introduced;
 * `stages[].provider` itself is validated by the strict {@link StageProviderConfigSchema}.
 */
export const ConfigSchema = z
  .object({
    stages: z
      .record(
        z.string(),
        z.object({
          provider: StageProviderConfigSchema.optional(),
        })
      )
      .optional(),
  })
  .passthrough();

export type Config = z.infer<typeof ConfigSchema>;

/** Filename of the workspace config file, relative to `dagDir`. */
const CONFIG_FILE_NAME = 'config.json';

/**
 * Reads and validates `.dag/config.json`, normalizing legacy provider type
 * aliases (`'claude'`, `'google'`) before schema validation runs.
 * @param rootDir - Workspace root to resolve `.dag/config.json` under; defaults to `resolveConfiguration().rootDir`.
 * @returns The parsed, validated {@link Config}; `{}` if the file does not exist.
 * @throws {z.ZodError} If the file exists but fails `ConfigSchema` validation.
 */
export function loadConfig(rootDir?: string): Config {
  const resolvedRootDir = rootDir ?? resolveConfiguration().rootDir;
  const configPath = path.join(resolvedRootDir, DAG_DIR_NAME, CONFIG_FILE_NAME);
  if (!fs.existsSync(configPath)) {
    return ConfigSchema.parse({});
  }
  const raw: unknown = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return ConfigSchema.parse(raw);
}
