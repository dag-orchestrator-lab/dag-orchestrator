import type { SubprocessCommand } from './subprocess-command.js';

/** Maximum number of Fixer Agent patch attempts before a task is escalated to human review. */
export const MAX_FIXER_RETRIES = 3;

/** Default working directory for verify commands: the process's current working directory. */
export const DEFAULT_VERIFY_CWD = process.cwd();

/** Default timeout, in milliseconds, allotted to a single verify command invocation. */
export const DEFAULT_VERIFY_TIMEOUT_MS = 120_000;

/** Default typecheck command: `npx tsc --noEmit`. */
export const DEFAULT_TYPECHECK_COMMAND: SubprocessCommand = {
  executable: 'npx',
  args: ['tsc', '--noEmit'],
  cwd: DEFAULT_VERIFY_CWD,
  timeoutMs: DEFAULT_VERIFY_TIMEOUT_MS,
} as const;

/** Default test command: `npx vitest run`. */
export const DEFAULT_TEST_COMMAND: SubprocessCommand = {
  executable: 'npx',
  args: ['vitest', 'run'],
  cwd: DEFAULT_VERIFY_CWD,
  timeoutMs: DEFAULT_VERIFY_TIMEOUT_MS,
} as const;

/** Overridable typecheck/test command pairing used to construct the `verify` step. */
export interface VerifyConfiguration {
  readonly typecheck: SubprocessCommand;
  readonly test: SubprocessCommand;
}
