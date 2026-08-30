import { describe, expect, it } from 'vitest';
import { NodeSubprocessAdapter } from './node-subprocess-adapter.js';
import { SubprocessSpawnError } from '../../../domain/orchestration/errors/subprocess-spawn-error.js';

describe('NodeSubprocessAdapter', () => {
  it('resolves with captured stdout, stderr, and exit code on normal completion', async () => {
    const adapter = new NodeSubprocessAdapter();

    const result = await adapter.execute({
      executable: process.execPath,
      args: ['-e', "process.stdout.write('out'); process.stderr.write('err'); process.exit(0);"],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
    expect(result.didTimeout).toBe(false);
  });

  it('captures a non-zero exit code without throwing', async () => {
    const adapter = new NodeSubprocessAdapter();

    const result = await adapter.execute({
      executable: process.execPath,
      args: ['-e', 'process.exit(7);'],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.exitCode).toBe(7);
    expect(result.didTimeout).toBe(false);
  });

  it('sends SIGTERM and resolves with didTimeout true when timeoutMs elapses', async () => {
    const adapter = new NodeSubprocessAdapter();

    const result = await adapter.execute({
      executable: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5000);'],
      cwd: process.cwd(),
      timeoutMs: 100,
    });

    expect(result.didTimeout).toBe(true);
  });

  it('rejects with SubprocessSpawnError when the executable cannot be launched', async () => {
    const adapter = new NodeSubprocessAdapter();

    await expect(
      adapter.execute({
        executable: '/nonexistent/binary/does-not-exist',
        args: [],
        cwd: process.cwd(),
        timeoutMs: 5000,
      })
    ).rejects.toBeInstanceOf(SubprocessSpawnError);
  });
});
