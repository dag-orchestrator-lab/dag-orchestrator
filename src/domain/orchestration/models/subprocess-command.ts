/** A shell command to execute, with arguments passed as an array to avoid shell-string interpolation. */
export interface SubprocessCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
}

/** The captured result of running a {@link SubprocessCommand} to completion or until timeout. */
export interface SubprocessExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly didTimeout: boolean;
}
