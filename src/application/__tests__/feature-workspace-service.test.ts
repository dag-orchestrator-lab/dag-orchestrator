import { describe, expect, it, beforeEach } from 'vitest';
import { FeatureWorkspaceService } from '../feature-workspace-service.js';
import { Result } from '../../domain/common/result.js';
import { DomainError } from '../../domain/common/errors.js';
import { FeatureWorkspace } from '../../domain/feature-workspace/aggregates/feature-workspace.js';
import { FeatureWorkspaceRepository } from '../../domain/feature-workspace/ports/feature-workspace-repository.js';
import { RollbackSnapshot } from '../../domain/feature-workspace/value-objects/rollback-snapshot.js';

class InMemoryFeatureWorkspaceRepository implements FeatureWorkspaceRepository {
  private readonly active = new Map<string, FeatureWorkspace>();
  private readonly archived = new Map<string, FeatureWorkspace>();

  findBySlug(slug: string): Result<FeatureWorkspace, DomainError> {
    const workspace = this.active.get(slug);
    if (!workspace) return Result.err({ kind: 'NotFoundError', identifier: slug });
    return Result.ok(workspace);
  }

  findArchivedBySlug(slug: string): Result<FeatureWorkspace, DomainError> {
    const workspace = this.archived.get(slug);
    if (!workspace) return Result.err({ kind: 'NotFoundError', identifier: `archived:${slug}` });
    return Result.ok(workspace);
  }

  findAll(): Result<FeatureWorkspace[], DomainError> {
    return Result.ok([...this.active.values()]);
  }

  findAllArchived(): Result<FeatureWorkspace[], DomainError> {
    return Result.ok([...this.archived.values()]);
  }

  save(workspace: FeatureWorkspace): Result<void, DomainError> {
    this.active.set(workspace.slug.value, workspace);
    return Result.ok(undefined);
  }

  moveToArchived(workspace: FeatureWorkspace): Result<void, DomainError> {
    this.active.delete(workspace.slug.value);
    this.archived.set(workspace.slug.value, workspace);
    return Result.ok(undefined);
  }

  moveToActive(workspace: FeatureWorkspace): Result<void, DomainError> {
    this.archived.delete(workspace.slug.value);
    this.active.set(workspace.slug.value, workspace);
    return Result.ok(undefined);
  }

  saveSnapshot(_slug: string, _snapshot: RollbackSnapshot): Result<void, DomainError> {
    return Result.ok(undefined);
  }

  cleanArtifacts(_slug: string): Result<void, DomainError> {
    return Result.ok(undefined);
  }

  getWorkspaceDir(slug: string): string {
    return `/tmp/dag/features/${slug}`;
  }

  getArtifactPath(slug: string, artifactName: string): string {
    return `/tmp/dag/features/${slug}/artifacts/${artifactName}`;
  }
}

describe('FeatureWorkspaceService', () => {
  let repo: InMemoryFeatureWorkspaceRepository;
  let service: FeatureWorkspaceService;

  beforeEach(() => {
    repo = new InMemoryFeatureWorkspaceRepository();
    service = new FeatureWorkspaceService(repo);
  });

  it('round-trips saveFeatureContextMeta -> getFeatureContextMeta for a brand new slug', () => {
    const meta = { jiraTicket: 'ABC-123', title: 'New feature' };

    const saveResult = service.saveFeatureContextMeta('new-feature', meta);
    expect(saveResult.isOk).toBe(true);

    const getResult = service.getFeatureContextMeta('new-feature');
    expect(getResult.isOk).toBe(true);
    if (getResult.isOk) {
      expect(getResult.value).toEqual(meta);
    }
  });

  it('round-trips saveFeatureContextMeta -> getFeatureContextMeta for an existing slug', () => {
    const initialMeta = { jiraTicket: 'ABC-123' };
    service.saveFeatureContextMeta('existing-feature', initialMeta);

    const updatedMeta = { jiraTicket: 'ABC-999', title: 'Updated' };
    const saveResult = service.saveFeatureContextMeta('existing-feature', updatedMeta);
    expect(saveResult.isOk).toBe(true);

    const getResult = service.getFeatureContextMeta('existing-feature');
    expect(getResult.isOk).toBe(true);
    if (getResult.isOk) {
      expect(getResult.value).toEqual(updatedMeta);
    }
  });

  it('returns a NotFoundError when reading context meta for an unknown slug', () => {
    const getResult = service.getFeatureContextMeta('does-not-exist');
    expect(getResult.isErr).toBe(true);
    if (getResult.isErr) {
      expect(getResult.error.kind).toBe('NotFoundError');
    }
  });
});
