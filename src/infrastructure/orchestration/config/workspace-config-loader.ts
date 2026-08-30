import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { SubprocessCommand } from '../../../domain/orchestration/models/subprocess-command.js';
import {
  DEFAULT_TEST_COMMAND,
  DEFAULT_TYPECHECK_COMMAND,
  type VerifyConfiguration,
} from '../../../domain/orchestration/models/verify-command.js';

/** Path of the per-repository config file, relative to the feature workspace root. */
const DAG_CONFIG_RELATIVE_PATH = '.dag/config.json';

function resolveSubprocessCommand(candidate: unknown, fallback: SubprocessCommand): SubprocessCommand {
  if (typeof candidate !== 'object' || candidate === null) {
    return fallback;
  }
  const raw = candidate as Record<string, unknown>;
  const executable = typeof raw.executable === 'string' ? raw.executable : fallback.executable;
  const args =
    Array.isArray(raw.args) && raw.args.every((arg): arg is string => typeof arg === 'string')
      ? raw.args
      : fallback.args;
  const cwd = typeof raw.cwd === 'string' ? raw.cwd : fallback.cwd;
  const timeoutMs = typeof raw.timeoutMs === 'number' ? raw.timeoutMs : fallback.timeoutMs;
  return { executable, args, cwd, timeoutMs };
}

/** Reads the per-repository `verify` configuration, resolving to safe defaults on any failure. */
export class WorkspaceConfigLoader {
  constructor(private readonly workspaceFileSystem: WorkspaceFileSystemPort) {}

  /**
   * Loads the `VerifyConfiguration` for a feature workspace from `.dag/config.json`.
   * @param workspaceRoot - the feature workspace identifier to resolve `.dag/config.json` under.
   * @returns the resolved `VerifyConfiguration`; falls back to `DEFAULT_TYPECHECK_COMMAND`/`DEFAULT_TEST_COMMAND` (per missing field) on a missing file, unreadable file, or parse failure — never throws.
   */
  async loadVerifyCommands(workspaceRoot: string): Promise<VerifyConfiguration> {
    try {
      const exists = await this.workspaceFileSystem.fileExists(workspaceRoot, DAG_CONFIG_RELATIVE_PATH);
      if (!exists) {
        return { typecheck: DEFAULT_TYPECHECK_COMMAND, test: DEFAULT_TEST_COMMAND };
      }

      const raw = await this.workspaceFileSystem.readFile(workspaceRoot, DAG_CONFIG_RELATIVE_PATH);
      const parsed: unknown = JSON.parse(raw);
      const verify =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>).verify
          : undefined;
      const verifySection = typeof verify === 'object' && verify !== null ? (verify as Record<string, unknown>) : {};

      return {
        typecheck: resolveSubprocessCommand(verifySection.typecheck, DEFAULT_TYPECHECK_COMMAND),
        test: resolveSubprocessCommand(verifySection.test, DEFAULT_TEST_COMMAND),
      };
    } catch {
      return { typecheck: DEFAULT_TYPECHECK_COMMAND, test: DEFAULT_TEST_COMMAND };
    }
  }
}
