import { spawn } from 'node:child_process';
import type {
  SubprocessCommand,
  SubprocessExecutionResult,
} from '../../../domain/orchestration/models/subprocess-command.js';
import type { SubprocessExecutionPort } from '../../../domain/orchestration/ports/subprocess-execution-port.js';
import { SubprocessSpawnError } from '../../../domain/orchestration/errors/subprocess-spawn-error.js';

/** Node `child_process.spawn`-backed implementation of `SubprocessExecutionPort`, used to run `verify` (typecheck + tests). */
export class NodeSubprocessAdapter implements SubprocessExecutionPort {
  /**
   * Runs a command to completion or until `timeoutMs` elapses.
   * @param command - executable, args, cwd, and timeout to run under.
   * @returns the captured result; never throws for a non-zero exit code.
   * @throws {SubprocessSpawnError} if the executable cannot be launched at all.
   */
  async execute(command: SubprocessCommand): Promise<SubprocessExecutionResult> {
    return await new Promise<SubprocessExecutionResult>((resolve, reject) => {
      const child = spawn(command.executable, [...command.args], {
        cwd: command.cwd,
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      let didTimeout = false;

      const timer = setTimeout(() => {
        didTimeout = true;
        child.kill('SIGTERM');
      }, command.timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new SubprocessSpawnError(command.executable, command.args, error));
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          exitCode: exitCode ?? 0,
          stdout,
          stderr,
          didTimeout,
        });
      });
    });
  }
}
