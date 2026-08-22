import { spawn } from 'node:child_process';
import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';
import type { LLMExecutionOptions } from '../../../domain/llm/types/llm-execution-options.js';
import type { LLMProviderPort } from '../../../domain/llm/ports/llm-provider-port.js';
import type { StageProviderConfig } from '../../../domain/llm/types/stage-provider-config.js';

const DEFAULT_CLAUDE_CLI_PATH = 'claude';
const DEFAULT_CLAUDE_CLI_TIMEOUT_MS = 120_000;
const CLAUDE_CLI_BASE_ARGS = ['--dangerously-skip-permissions'];

/**
 * Adapts the local `claude` CLI (invoked as a subprocess) to {@link LLMProviderPort}.
 *
 * The prompt is written to the child's stdin rather than passed as an argv element:
 * `execFileAsync(cliPath, args, { input: prompt })` silently ignores `options.input` on
 * Node's async `execFile`, hanging the subprocess until `ETIMEDOUT`.
 */
export class ClaudeCliAdapter implements LLMProviderPort {
  constructor(private readonly config: Pick<StageProviderConfig, 'cliPath' | 'model'>) {}

  async execute(
    prompt: string,
    systemPrompt?: string,
    options?: LLMExecutionOptions
  ): Promise<string> {
    const cliPath = this.config.cliPath ?? DEFAULT_CLAUDE_CLI_PATH;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_CLAUDE_CLI_TIMEOUT_MS;
    const args = [...CLAUDE_CLI_BASE_ARGS];
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }
    args.push('-p');

    return new Promise<string>((resolve, reject) => {
      const child = spawn(cliPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        settled = true;
        child.kill();
        reject(
          new ProviderExecutionError(`Claude CLI timed out after ${timeoutMs}ms`, {
            providerType: 'claude-cli',
          })
        );
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);

        if (code !== 0 && !stdout) {
          reject(
            new ProviderExecutionError(`Claude CLI failed (exit ${code}): ${stderr}`, {
              providerType: 'claude-cli',
            })
          );
          return;
        }

        resolve(stdout.trim());
      });

      child.on('error', (err) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(
          new ProviderExecutionError(
            `Failed to invoke claude CLI: ${err.message}. Is claude installed globally and in PATH?`,
            { providerType: 'claude-cli' }
          )
        );
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
