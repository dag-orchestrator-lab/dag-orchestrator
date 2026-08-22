import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ClaudeCliAdapter } from './claude-cli-adapter.js';
import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const ECHO_STDIN_CLI = path.join(FIXTURES_DIR, 'echo-stdin-cli.cjs');
const FAIL_CLI = path.join(FIXTURES_DIR, 'fail-cli.cjs');

describe('ClaudeCliAdapter', () => {
  it('delivers the prompt via stdin, never as an argv element, and resolves with it', async () => {
    const adapter = new ClaudeCliAdapter({ cliPath: ECHO_STDIN_CLI, model: 'claude-cli-model' });

    const prompt = 'hello from stdin';
    const result = await adapter.execute(prompt);

    const echoed = JSON.parse(result) as { argv: string[]; stdin: string };
    expect(echoed.stdin).toBe(prompt);
    expect(echoed.argv.join(' ')).not.toContain(prompt);
  }, 5000);

  it('appends the system prompt as a CLI argument, separate from stdin', async () => {
    const adapter = new ClaudeCliAdapter({ cliPath: ECHO_STDIN_CLI, model: 'claude-cli-model' });

    const result = await adapter.execute('the prompt body', 'the system prompt');

    const echoed = JSON.parse(result) as { argv: string[]; stdin: string };
    expect(echoed.stdin).toBe('the prompt body');
    expect(echoed.argv).toContain('the system prompt');
  }, 5000);

  it('rejects with ProviderExecutionError when the CLI exits non-zero with no stdout', async () => {
    const adapter = new ClaudeCliAdapter({ cliPath: FAIL_CLI, model: 'claude-cli-model' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  }, 5000);

  it('rejects with ProviderExecutionError when the executable cannot be spawned', async () => {
    const adapter = new ClaudeCliAdapter({
      cliPath: path.join(FIXTURES_DIR, 'does-not-exist.cjs'),
      model: 'claude-cli-model',
    });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  }, 5000);
});
