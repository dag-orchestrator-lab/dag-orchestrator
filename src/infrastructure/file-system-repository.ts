import fs from 'node:fs';
import path from 'node:path';
import { Result } from '../domain/common/result.js';
import { DomainError } from '../domain/common/errors.js';
import { FeatureWorkspaceRepository } from '../domain/feature-workspace/ports/feature-workspace-repository.js';
import { FeatureWorkspace } from '../domain/feature-workspace/aggregates/feature-workspace.js';
import { RollbackSnapshot } from '../domain/feature-workspace/value-objects/rollback-snapshot.js';
import { FeatureWorkspaceMapper } from './feature-workspace-mapper.js';
import { Configuration } from './config.js';

const META_FILE_NAME = 'meta.json';

const SNAPSHOTS_DIR_NAME = 'snapshots';

/** Filesystem-backed `FeatureWorkspaceRepository`; the only infrastructure component allowed to touch `.dag/` directly. */
export class FileSystemFeatureWorkspaceRepository implements FeatureWorkspaceRepository {
  constructor(private readonly config: Configuration) {}

  public getWorkspaceDir(slug: string): string {
    return path.join(this.config.featuresDir, slug);
  }

  public getArtifactPath(slug: string, artifactName: string): string {
    return path.join(this.getWorkspaceDir(slug), artifactName);
  }

  public findBySlug(slug: string): Result<FeatureWorkspace, DomainError> {
    return this.readWorkspace(slug, this.getWorkspaceDir(slug), false);
  }

  public findArchivedBySlug(slug: string): Result<FeatureWorkspace, DomainError> {
    return this.readWorkspace(slug, path.join(this.config.archivedDir, slug), true);
  }

  public findAll(): Result<FeatureWorkspace[], DomainError> {
    return this.readWorkspacesFromDir(this.config.featuresDir, false);
  }

  public findAllArchived(): Result<FeatureWorkspace[], DomainError> {
    return this.readWorkspacesFromDir(this.config.archivedDir, true);
  }

  public save(workspace: FeatureWorkspace): Result<void, DomainError> {
    const dir = workspace.status.isArchived()
      ? path.join(this.config.archivedDir, workspace.slug.value)
      : this.getWorkspaceDir(workspace.slug.value);

    const metaPath = path.join(dir, META_FILE_NAME);
    const tmpPath = path.join(dir, `${META_FILE_NAME}.${process.pid}.${Date.now()}.tmp`);

    try {
      fs.mkdirSync(dir, { recursive: true });
      const rawData = JSON.stringify(FeatureWorkspaceMapper.toPersistence(workspace), null, 2);
      fs.writeFileSync(tmpPath, rawData, 'utf-8');
      fs.renameSync(tmpPath, metaPath);
      return Result.ok(undefined);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceWriteError', path: metaPath, cause });
    }
  }

  public moveToArchived(workspace: FeatureWorkspace): Result<void, DomainError> {
    const sourceDir = this.getWorkspaceDir(workspace.slug.value);
    const targetDir = path.join(this.config.archivedDir, workspace.slug.value);

    try {
      fs.mkdirSync(this.config.archivedDir, { recursive: true });
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.renameSync(sourceDir, targetDir);
      return this.save(workspace);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceWriteError', path: targetDir, cause });
    }
  }

  public moveToActive(workspace: FeatureWorkspace): Result<void, DomainError> {
    const sourceDir = path.join(this.config.archivedDir, workspace.slug.value);
    const targetDir = this.getWorkspaceDir(workspace.slug.value);

    try {
      fs.mkdirSync(this.config.featuresDir, { recursive: true });
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.renameSync(sourceDir, targetDir);
      return this.save(workspace);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceWriteError', path: targetDir, cause });
    }
  }

  public saveSnapshot(slug: string, snapshot: RollbackSnapshot): Result<void, DomainError> {
    const snapshotDir = path.join(this.getWorkspaceDir(slug), SNAPSHOTS_DIR_NAME);
    const snapshotPath = path.join(snapshotDir, `${snapshot.snapshotId}.json`);

    try {
      fs.mkdirSync(snapshotDir, { recursive: true });
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot.toLegacyFormat(), null, 2), 'utf-8');
      return Result.ok(undefined);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceWriteError', path: snapshotPath, cause });
    }
  }

  public cleanArtifacts(slug: string): Result<void, DomainError> {
    const dir = this.getWorkspaceDir(slug);
    try {
      const files = ['00-requirements.md', '01-recon.md', '02-contracts.md', '03-domain.md', '03-app-infra.md', '03-data.md', '04-findings.md', '04-layer-findings.md', '05-tasks.md'];
      for (const f of files) {
        const p = path.join(dir, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      return Result.ok(undefined);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceWriteError', path: dir, cause });
    }
  }

  private readWorkspace(slug: string, dir: string, isArchived: boolean): Result<FeatureWorkspace, DomainError> {
    const metaPath = path.join(dir, META_FILE_NAME);

    if (!fs.existsSync(metaPath)) {
      return Result.err({ kind: 'NotFoundError', identifier: isArchived ? `archived:${slug}` : slug });
    }

    try {
      const rawContent = fs.readFileSync(metaPath, 'utf-8');
      const json = JSON.parse(rawContent);
      return FeatureWorkspaceMapper.toDomain(slug, dir, json, isArchived);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceReadError', path: metaPath, cause });
    }
  }

  private readWorkspacesFromDir(baseDir: string, isArchived: boolean): Result<FeatureWorkspace[], DomainError> {
    if (!fs.existsSync(baseDir)) {
      return Result.ok([]);
    }

    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      const workspaces: FeatureWorkspace[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const slug = entry.name;
        const fetchResult = isArchived ? this.findArchivedBySlug(slug) : this.findBySlug(slug);
        if (fetchResult.isErr) {
          return fetchResult;
        }
        workspaces.push(fetchResult.value);
      }

      return Result.ok(workspaces);
    } catch (cause) {
      return Result.err({ kind: 'PersistenceReadError', path: baseDir, cause });
    }
  }
}
