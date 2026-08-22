import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Result } from '../../domain/common/result.js';
import { WorkspaceResultError } from '../../domain/common/errors.js';
import { Configuration } from '../config.js';

/** Filename of the CLI config file, relative to `dagDir`. */
const CONFIG_FILE_NAME = 'config.json';

/** Default LLM provider used when `.dag/config.json` omits `llmProvider`. */
const DEFAULT_LLM_PROVIDER = 'gemini';

/** Default Auto-Park prompting behavior used when `.dag/config.json` omits `autoParkPrompt`. */
const DEFAULT_AUTO_PARK_PROMPT = true;

/** Schema for `.dag/config.json`, per `03-data.md` §2.2. */
export const DagCliConfigSchema = z
  .object({
    version: z.string().min(1, 'version must not be empty'),
    llmProvider: z.string().default(DEFAULT_LLM_PROVIDER),
    autoParkPrompt: z.boolean().default(DEFAULT_AUTO_PARK_PROMPT),
  })
  .strict();

export type DagCliConfig = z.infer<typeof DagCliConfigSchema>;

/**
 * Filesystem-backed reader/writer for `.dag/config.json`.
 * Per `03-data.md` §3 boundary table, this is the only component besides
 * `FeatureWorkspaceService` permitted filesystem writes under `.dag/`.
 */
export class DagConfigRepository {
  constructor(private readonly config: Configuration) {}

  private get configPath(): string {
    return path.join(this.config.dagDir, CONFIG_FILE_NAME);
  }

  /**
   * @returns The parsed, validated {@link DagCliConfig}.
   */
  public read(): Result<DagCliConfig, WorkspaceResultError> {
    if (!fs.existsSync(this.configPath)) {
      return Result.err({ kind: 'NotFoundError', identifier: this.configPath });
    }

    try {
      const raw: unknown = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      const parsed = DagCliConfigSchema.safeParse(raw);
      if (!parsed.success) {
        return Result.err({ kind: 'ValidationError', field: 'config', message: parsed.error.message });
      }
      return Result.ok(parsed.data);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceReadError', path: this.configPath, cause });
    }
  }

  /**
   * @param config - Config to validate and persist.
   */
  public write(config: DagCliConfig): Result<void, WorkspaceResultError> {
    const parsed = DagCliConfigSchema.safeParse(config);
    if (!parsed.success) {
      return Result.err({ kind: 'ValidationError', field: 'config', message: parsed.error.message });
    }

    try {
      fs.mkdirSync(this.config.dagDir, { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(parsed.data, null, 2), 'utf-8');
      return Result.ok(undefined);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceWriteError', path: this.configPath, cause });
    }
  }
}
