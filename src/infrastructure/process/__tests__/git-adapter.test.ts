import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { NodeGitAdapter } from '../git-adapter.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

describe('NodeGitAdapter.isWorkingTreeClean', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it('returns true when git status --porcelain stdout is empty', async () => {
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
      const callback = args[args.length - 1] as ExecFileCallback;
      callback(null, '', '');
      return {} as ReturnType<typeof execFile>;
    }) as unknown as typeof execFile);

    const adapter = new NodeGitAdapter();
    const result = await adapter.isWorkingTreeClean('/repo');

    expect(result).toBe(true);
    expect(execFile).toHaveBeenCalledWith('git', ['status', '--porcelain'], { cwd: '/repo' }, expect.any(Function));
  });

  it('returns false when git status --porcelain stdout is non-empty', async () => {
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
      const callback = args[args.length - 1] as ExecFileCallback;
      callback(null, ' M src/file.ts\n', '');
      return {} as ReturnType<typeof execFile>;
    }) as unknown as typeof execFile);

    const adapter = new NodeGitAdapter();
    const result = await adapter.isWorkingTreeClean('/repo');

    expect(result).toBe(false);
  });

  it('returns false when execFile rejects (not a repo, git missing)', async () => {
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
      const callback = args[args.length - 1] as ExecFileCallback;
      callback(new Error('not a git repository'), '', '');
      return {} as ReturnType<typeof execFile>;
    }) as unknown as typeof execFile);

    const adapter = new NodeGitAdapter();
    const result = await adapter.isWorkingTreeClean('/repo');

    expect(result).toBe(false);
  });
});
