import type { SubprocessCommand, SubprocessExecutionResult } from '../models/subprocess-command.js';

/** Port used by the Coder/Fixer agents to run `verify` (typecheck + tests) without depending on `node:child_process` directly. */
export interface SubprocessExecutionPort {
  /**
   * Runs a command to completion or until timeout.
   * @param command - executable, args, cwd, and timeout to run under.
   * @returns the captured result; never throws for a non-zero exit code.
   * @throws SubprocessSpawnError if the executable cannot be launched at all.
   */
  execute(command: SubprocessCommand): Promise<SubprocessExecutionResult>;
}
