import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type StateModule = typeof import('../state.js');

const META_FILE_NAME = 'meta.json';

/**
 * The shim (src/state.js) must forward to compiled application-service code and never
 * leak the internal Result<T, E> wrapper across its boundary.
 */
function assertNotResultShaped(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const looksLikeResult =
      ('isOk' in record && 'isErr' in record) ||
      ('isOk' in record && 'value' in record) ||
      ('isErr' in record && 'error' in record);
    expect(looksLikeResult).toBe(false);
  }
}

describe('state.js shim parity and failure semantics', () => {
  let tempRoot: string;
  let originalWorkspaceRoot: string | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-state-parity-'));
    originalWorkspaceRoot = process.env.DAG_WORKSPACE_ROOT;
    process.env.DAG_WORKSPACE_ROOT = tempRoot;
  });

  afterEach(() => {
    if (originalWorkspaceRoot === undefined) {
      delete process.env.DAG_WORKSPACE_ROOT;
    } else {
      process.env.DAG_WORKSPACE_ROOT = originalWorkspaceRoot;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  async function loadState(): Promise<StateModule> {
    vi.resetModules();
    return import('../state.js');
  }

  function featuresDir(): string {
    return path.join(tempRoot, '.dag', 'features');
  }

  function archivedDir(): string {
    return path.join(tempRoot, '.dag', 'archive');
  }

  function writeWorkspace(slug: string, data: unknown, baseDir: string = featuresDir()): string {
    const wsDir = path.join(baseDir, slug);
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(
      path.join(wsDir, META_FILE_NAME),
      typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    );
    return wsDir;
  }

  it('slugify: matches the pre-migration lowercase/dash/truncate algorithm', async () => {
    const state = await loadState();
    expect(state.slugify('My Feature!!')).toBe('my-feature');
    expect(state.slugify('  Leading And Trailing  ')).toBe('leading-and-trailing');
    expect(state.slugify('a'.repeat(80))).toBe('a'.repeat(50));
    expect(state.slugify('---already-slug---')).toBe('already-slug');
  });

  it('getFeatureContextMeta: returns the persisted contextMeta object for an existing workspace', async () => {
    writeWorkspace('feat-a', { contextMeta: { title: 'Hello', status: 'DRAFT' } });
    const state = await loadState();

    const meta = state.getFeatureContextMeta('feat-a');
    assertNotResultShaped(meta);
    expect(meta).toEqual({ title: 'Hello', status: 'DRAFT' });
  });

  it('getFeatureContextMeta: returns null (not throw) for a slug with no workspace on disk', async () => {
    const state = await loadState();
    const meta = state.getFeatureContextMeta('does-not-exist');
    assertNotResultShaped(meta);
    expect(meta).toBeNull();
  });

  it('getFeatureContextMeta: corrupt meta.json throws a catchable error, not a Result, not a crash', async () => {
    writeWorkspace('feat-corrupt', '{ this is not valid json');
    const state = await loadState();

    let caught: unknown;
    try {
      state.getFeatureContextMeta('feat-corrupt');
      throw new Error('expected getFeatureContextMeta to throw');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const thrown = caught as Error;
    expect(typeof thrown.message).toBe('string');
    expect(thrown.message.length).toBeGreaterThan(0);
    assertNotResultShaped(thrown);
    expect('isOk' in (thrown as unknown as Record<string, unknown>)).toBe(false);
    expect('isErr' in (thrown as unknown as Record<string, unknown>)).toBe(false);
  });

  it('saveFeatureContextMeta: persists meta retrievable via getFeatureContextMeta on the same slug', async () => {
    const state = await loadState();
    state.saveFeatureContextMeta('feat-b', { title: 'New Feature' });

    const meta = state.getFeatureContextMeta('feat-b');
    assertNotResultShaped(meta);
    expect(meta).toEqual({ title: 'New Feature' });
    expect(fs.existsSync(path.join(featuresDir(), 'feat-b', META_FILE_NAME))).toBe(true);
  });

  it('getFeatureWorkspaceDir: resolves to featuresDir/<slug> regardless of on-disk existence', async () => {
    const state = await loadState();
    expect(state.getFeatureWorkspaceDir('feat-c')).toBe(path.join(featuresDir(), 'feat-c'));
  });

  it('resolveArtifactPath: resolves to <workspaceDir>/<artifactName>', async () => {
    const state = await loadState();
    expect(state.resolveArtifactPath('feat-d', '00-requirements.md')).toBe(
      path.join(featuresDir(), 'feat-d', '00-requirements.md'),
    );
  });

  it('listAllFeatures: lists every active workspace in the legacy flattened shape', async () => {
    writeWorkspace('feat-e', { contextMeta: { title: 'E' } });
    writeWorkspace('feat-f', { contextMeta: { title: 'F' } });
    const state = await loadState();

    const features = state.listAllFeatures();
    assertNotResultShaped(features);
    expect(Array.isArray(features)).toBe(true);
    expect(features).toHaveLength(2);
    expect(features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'feat-e', title: 'E', status: 'ACTIVE' }),
        expect.objectContaining({ slug: 'feat-f', title: 'F', status: 'ACTIVE' }),
      ]),
    );
  });

  it('listArchivedFeatures: lists every archived workspace in the legacy flattened shape', async () => {
    writeWorkspace('feat-g', { contextMeta: { title: 'G' } }, archivedDir());
    const state = await loadState();

    const features = state.listArchivedFeatures();
    assertNotResultShaped(features);
    expect(features).toEqual([{ slug: 'feat-g', title: 'G', status: 'ARCHIVED' }]);
  });

  it('recordGateApproval: persists an approval entry for the named gate on the workspace', async () => {
    writeWorkspace('feat-h', { contextMeta: {} });
    const state = await loadState();

    state.recordGateApproval('feat-h', 'gate1', { approver: 'alice', approvedAt: '2026-01-01T00:00:00.000Z' });

    const raw = JSON.parse(fs.readFileSync(path.join(featuresDir(), 'feat-h', META_FILE_NAME), 'utf8'));
    expect(raw.approvals).toEqual([
      { gateName: 'gate1', approver: 'alice', approvedAt: '2026-01-01T00:00:00.000Z', metadata: {} },
    ]);
  });

  it('getPipelineStatus: reports gate1Approved true only once .dag-gates.json records that gate', async () => {
    // getPipelineStatus reads process.cwd() directly rather than DAG_WORKSPACE_ROOT, unlike the rest of the shim.
    const originalCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const wsDir = path.join(featuresDir(), 'feat-i');
      fs.mkdirSync(wsDir, { recursive: true });
      const state = await loadState();

      const beforeApproval = state.getPipelineStatus('feat-i') as { gate1Approved: boolean };
      assertNotResultShaped(beforeApproval);
      expect(beforeApproval.gate1Approved).toBe(false);

      fs.writeFileSync(
        path.join(wsDir, '.dag-gates.json'),
        JSON.stringify({ gate1: { approved: true, timestamp: '2026-01-01T00:00:00.000Z' } }),
      );

      const state2 = await loadState();
      const afterApproval = state2.getPipelineStatus('feat-i') as { gate1Approved: boolean };
      expect(afterApproval.gate1Approved).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('createRollbackSnapshot: returns and persists a snapshot reflecting current workspace state', async () => {
    writeWorkspace('feat-j', { contextMeta: { title: 'J' } });
    const state = await loadState();

    const snapshot = state.createRollbackSnapshot('feat-j') as { snapshotId: string; slug: string; metadataContent: unknown };
    assertNotResultShaped(snapshot);
    expect(snapshot.slug).toBe('feat-j');
    expect(snapshot.metadataContent).toEqual({ title: 'J' });

    const snapshotPath = path.join(featuresDir(), 'feat-j', 'snapshots', `${snapshot.snapshotId}.json`);
    expect(fs.existsSync(snapshotPath)).toBe(true);
  });

  it('cleanArtifacts: removes known artifact files from the workspace directory', async () => {
    const wsDir = writeWorkspace('feat-k', { contextMeta: {} });
    fs.writeFileSync(path.join(wsDir, '00-requirements.md'), '# Requirements');
    const state = await loadState();

    state.cleanArtifacts('feat-k');

    expect(fs.existsSync(path.join(wsDir, '00-requirements.md'))).toBe(false);
  });

  it('archiveFeatureWorkspace: moves the workspace from featuresDir to archivedDir', async () => {
    writeWorkspace('feat-l', { contextMeta: { title: 'L' } });
    const state = await loadState();

    state.archiveFeatureWorkspace('feat-l');

    expect(fs.existsSync(path.join(featuresDir(), 'feat-l'))).toBe(false);
    expect(fs.existsSync(path.join(archivedDir(), 'feat-l', META_FILE_NAME))).toBe(true);
    const raw = JSON.parse(fs.readFileSync(path.join(archivedDir(), 'feat-l', META_FILE_NAME), 'utf8'));
    expect(raw.status).toBe('ARCHIVED');
  });

  it('unarchiveFeatureWorkspace: moves the workspace from archivedDir back to featuresDir', async () => {
    writeWorkspace('feat-m', { contextMeta: { title: 'M' } }, archivedDir());
    const state = await loadState();

    state.unarchiveFeatureWorkspace('feat-m');

    expect(fs.existsSync(path.join(archivedDir(), 'feat-m'))).toBe(false);
    expect(fs.existsSync(path.join(featuresDir(), 'feat-m', META_FILE_NAME))).toBe(true);
    const raw = JSON.parse(fs.readFileSync(path.join(featuresDir(), 'feat-m', META_FILE_NAME), 'utf8'));
    expect(raw.status).toBe('ACTIVE');
  });

  it('activateFeatureWorkspace: transitions an existing workspace to ACTIVE without changing its metadata', async () => {
    writeWorkspace('feat-n', { contextMeta: { title: 'N' } });
    const state = await loadState();

    state.activateFeatureWorkspace('feat-n');

    const raw = JSON.parse(fs.readFileSync(path.join(featuresDir(), 'feat-n', META_FILE_NAME), 'utf8'));
    expect(raw.status).toBe('ACTIVE');
    expect(raw.contextMeta).toEqual({ title: 'N' });
  });

  it('archiveFeatureWorkspace -> unarchiveFeatureWorkspace round-trip preserves the same metadata (aggregate invariant)', async () => {
    writeWorkspace('feat-o', { contextMeta: { title: 'O', jiraTicket: 'ABC-1' } });
    const state = await loadState();

    state.archiveFeatureWorkspace('feat-o');
    state.unarchiveFeatureWorkspace('feat-o');

    const meta = state.getFeatureContextMeta('feat-o');
    assertNotResultShaped(meta);
    expect(meta).toEqual({ title: 'O', jiraTicket: 'ABC-1' });
  });
});
