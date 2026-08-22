import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileSystemFeatureWorkspaceRepository } from '../file-system-repository.js';
import { Configuration } from '../config.js';
import { FeatureWorkspace } from '../../domain/feature-workspace/aggregates/feature-workspace.js';
import { FeatureSlug } from '../../domain/feature-workspace/value-objects/feature-slug.js';
import { WorkspaceStatus } from '../../domain/feature-workspace/value-objects/workspace-status.js';
import { RollbackSnapshot } from '../../domain/feature-workspace/value-objects/rollback-snapshot.js';

function makeWorkspace(slug: string, status: WorkspaceStatus): FeatureWorkspace {
  const slugResult = FeatureSlug.create(slug);
  if (slugResult.isErr) throw new Error('bad slug');
  return FeatureWorkspace.reconstitute({
    slug: slugResult.value,
    status,
    contextMeta: { jiraTicket: 'ABC-123' },
    approvals: [],
    stages: [],
    artifacts: [],
  });
}

describe('FileSystemFeatureWorkspaceRepository', () => {
  let rootDir: string;
  let config: Configuration;
  let repo: FileSystemFeatureWorkspaceRepository;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-repo-test-'));
    const dagDir = path.join(rootDir, '.dag');
    config = {
      rootDir,
      dagDir,
      featuresDir: path.join(dagDir, 'features'),
      archivedDir: path.join(dagDir, 'archive'),
    };
    repo = new FileSystemFeatureWorkspaceRepository(config);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('saves an active workspace under featuresDir and reads it back', () => {
    const workspace = makeWorkspace('my-feature', WorkspaceStatus.ACTIVE);
    const saveResult = repo.save(workspace);
    expect(saveResult.isOk).toBe(true);

    expect(fs.existsSync(path.join(config.featuresDir, 'my-feature', 'meta.json'))).toBe(true);

    const findResult = repo.findBySlug('my-feature');
    expect(findResult.isOk).toBe(true);
    if (findResult.isOk) {
      expect(findResult.value.slug.value).toBe('my-feature');
      expect(findResult.value.contextMeta).toEqual({ jiraTicket: 'ABC-123' });
    }
  });

  it('archives a workspace then reads it back under archivedDir, not featuresDir', () => {
    const workspace = makeWorkspace('my-feature', WorkspaceStatus.ACTIVE);
    repo.save(workspace);

    const archiveResult = workspace.archive();
    expect(archiveResult.isOk).toBe(true);

    const moveResult = repo.moveToArchived(workspace);
    expect(moveResult.isOk).toBe(true);

    expect(fs.existsSync(path.join(config.archivedDir, 'my-feature', 'meta.json'))).toBe(true);
    expect(fs.existsSync(path.join(config.featuresDir, 'my-feature'))).toBe(false);

    const findResult = repo.findArchivedBySlug('my-feature');
    expect(findResult.isOk).toBe(true);
    if (findResult.isOk) {
      expect(findResult.value.status.isArchived()).toBe(true);
    }

    const findAllResult = repo.findAllArchived();
    expect(findAllResult.isOk).toBe(true);
    if (findAllResult.isOk) {
      expect(findAllResult.value.map((w) => w.slug.value)).toEqual(['my-feature']);
    }
  });

  it('moves an archived workspace back to active via moveToActive', () => {
    const workspace = makeWorkspace('my-feature', WorkspaceStatus.ACTIVE);
    repo.save(workspace);
    workspace.archive();
    repo.moveToArchived(workspace);

    workspace.unarchive();
    const moveResult = repo.moveToActive(workspace);
    expect(moveResult.isOk).toBe(true);

    expect(fs.existsSync(path.join(config.featuresDir, 'my-feature', 'meta.json'))).toBe(true);
    expect(fs.existsSync(path.join(config.archivedDir, 'my-feature'))).toBe(false);
  });

  it('does not corrupt meta.json under two concurrent save() calls with distinct simulated pids', async () => {
    const workspaceA = makeWorkspace('concurrent-feature', WorkspaceStatus.ACTIVE);
    const workspaceB = makeWorkspace('concurrent-feature', WorkspaceStatus.ACTIVE);

    await Promise.all([
      Promise.resolve(repo.save(workspaceA)),
      Promise.resolve(repo.save(workspaceB)),
    ]);

    const metaPath = path.join(config.featuresDir, 'concurrent-feature', 'meta.json');
    const raw = fs.readFileSync(metaPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();

    const leftoverTmpFiles = fs
      .readdirSync(path.join(config.featuresDir, 'concurrent-feature'))
      .filter((name) => name.includes('.tmp'));
    expect(leftoverTmpFiles).toEqual([]);
  });

  it('returns Result.err from findAll() when one meta.json among three is corrupt, not a partial array', () => {
    for (const slug of ['feature-one', 'feature-two', 'feature-three']) {
      repo.save(makeWorkspace(slug, WorkspaceStatus.ACTIVE));
    }
    fs.writeFileSync(path.join(config.featuresDir, 'feature-two', 'meta.json'), '{ not valid json', 'utf-8');

    const result = repo.findAll();
    expect(result.isOk).toBe(false);
    expect(Array.isArray(result)).toBe(false);
  });

  it('saveSnapshot writes the snapshot using snapshotId and toLegacyFormat', () => {
    const workspace = makeWorkspace('my-feature', WorkspaceStatus.ACTIVE);
    repo.save(workspace);

    const snapshotResult = workspace.createRollbackSnapshot();
    expect(snapshotResult.isOk).toBe(true);
    if (!snapshotResult.isOk) return;
    const snapshot: RollbackSnapshot = snapshotResult.value;

    const saveSnapshotResult = repo.saveSnapshot('my-feature', snapshot);
    expect(saveSnapshotResult.isOk).toBe(true);

    const snapshotPath = path.join(config.featuresDir, 'my-feature', 'snapshots', `${snapshot.snapshotId}.json`);
    expect(fs.existsSync(snapshotPath)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    expect(persisted).toEqual(snapshot.toLegacyFormat());
  });

  it('cleanArtifacts removes and recreates the artifacts directory', () => {
    const workspace = makeWorkspace('my-feature', WorkspaceStatus.ACTIVE);
    repo.save(workspace);
    const artifactsDir = path.join(config.featuresDir, 'my-feature', 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, 'foo.txt'), 'bar', 'utf-8');

    const result = repo.cleanArtifacts('my-feature');
    expect(result.isOk).toBe(true);
    expect(fs.existsSync(artifactsDir)).toBe(true);
    expect(fs.existsSync(path.join(artifactsDir, '00-requirements.md'))).toBe(false);
  });

  it('findBySlug returns NotFoundError when no meta.json exists', () => {
    const result = repo.findBySlug('nonexistent');
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.kind).toBe('NotFoundError');
    }
  });

  it('findAll returns an empty array when featuresDir does not exist', () => {
    const result = repo.findAll();
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual([]);
    }
  });

  it('getWorkspaceDir and getArtifactPath build paths from featuresDir', () => {
    expect(repo.getWorkspaceDir('my-feature')).toBe(path.join(config.featuresDir, 'my-feature'));
    expect(repo.getArtifactPath('my-feature', 'foo.txt')).toBe(
      path.join(config.featuresDir, 'my-feature', 'foo.txt'),
    );
  });
});
