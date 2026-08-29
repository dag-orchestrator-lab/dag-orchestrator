import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentExecutionError } from '../../../domain/orchestration/errors/agent-execution-error.js';
import { WorkspaceFileSystemAdapter } from '../workspace-file-system-adapter.js';

describe('WorkspaceFileSystemAdapter', () => {
  let baseWorkspacesDir: string;
  let adapter: WorkspaceFileSystemAdapter;

  beforeEach(async () => {
    baseWorkspacesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-fs-adapter-'));
    adapter = new WorkspaceFileSystemAdapter(baseWorkspacesDir);
  });

  afterEach(async () => {
    await fs.rm(baseWorkspacesDir, { recursive: true, force: true });
  });

  it('round-trips writeFile/readFile/fileExists for an artifact', async () => {
    const workspaceSlug = 'epic-2-agents';
    expect(await adapter.fileExists(workspaceSlug, '01-recon.md')).toBe(false);

    await adapter.writeFile(workspaceSlug, '01-recon.md', '# Recon');

    expect(await adapter.fileExists(workspaceSlug, '01-recon.md')).toBe(true);
    expect(await adapter.readFile(workspaceSlug, '01-recon.md')).toBe('# Recon');
  });

  it('round-trips writeFeedbackRecord/readFeedbackRecord for a cycle', async () => {
    const workspaceSlug = 'epic-2-agents';
    const content = JSON.stringify({ cycle: 1, raisedAt: '2026-01-01T00:00:00.000Z', findings: [] });

    await adapter.writeFeedbackRecord(workspaceSlug, 1, content);

    expect(await adapter.readFeedbackRecord(workspaceSlug, 1)).toBe(content);
  });

  it('throws AgentExecutionError when writing the same cycle twice', async () => {
    const workspaceSlug = 'epic-2-agents';
    const content = JSON.stringify({ cycle: 1, raisedAt: '2026-01-01T00:00:00.000Z', findings: [] });

    await adapter.writeFeedbackRecord(workspaceSlug, 1, content);

    await expect(adapter.writeFeedbackRecord(workspaceSlug, 1, content)).rejects.toThrow(AgentExecutionError);
    await expect(adapter.writeFeedbackRecord(workspaceSlug, 1, content)).rejects.toMatchObject({
      role: 'skeptic',
      workspaceSlug,
      cycle: 1,
    });
  });

  it('allows writing distinct cycles independently', async () => {
    const workspaceSlug = 'epic-2-agents';

    await adapter.writeFeedbackRecord(workspaceSlug, 1, 'cycle-1');
    await adapter.writeFeedbackRecord(workspaceSlug, 2, 'cycle-2');

    expect(await adapter.readFeedbackRecord(workspaceSlug, 1)).toBe('cycle-1');
    expect(await adapter.readFeedbackRecord(workspaceSlug, 2)).toBe('cycle-2');
  });
});
