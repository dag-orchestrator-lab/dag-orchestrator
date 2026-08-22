import { Result } from '../domain/common/result.js';
import { WorkspaceResultError } from '../domain/common/errors.js';
import { FeatureWorkspace } from '../domain/feature-workspace/aggregates/feature-workspace.js';
import { FeatureSlug } from '../domain/feature-workspace/value-objects/feature-slug.js';
import { WorkspaceStatus } from '../domain/feature-workspace/value-objects/workspace-status.js';
import { GateApproval } from '../domain/feature-workspace/value-objects/gate-approval.js';
import { FeatureWorkspaceRepository } from '../domain/feature-workspace/ports/feature-workspace-repository.js';
import { PipelineEvaluator } from '../domain/feature-workspace/services/pipeline-evaluator.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Orchestrates `FeatureWorkspace` aggregates and the repository port to fulfill the legacy state-management use cases. */
export class FeatureWorkspaceService {
  constructor(private readonly repo: FeatureWorkspaceRepository) {}

  public getFeatureContextMeta(slug: string): Result<unknown, WorkspaceResultError> {
    const findResult = this.repo.findBySlug(slug);
    if (findResult.isErr) return findResult;
    return Result.ok(findResult.value.contextMeta);
  }

  public saveFeatureContextMeta(slug: string, meta: unknown): Result<void, WorkspaceResultError> {
    if (!isPlainObject(meta)) {
      return Result.err({
        kind: 'ValidationError',
        field: 'contextMeta',
        message: 'Context metadata must be a valid non-array object',
      });
    }

    const findResult = this.repo.findBySlug(slug);
    let workspace: FeatureWorkspace;

    if (findResult.isOk) {
      workspace = findResult.value;
      const saveResult = workspace.saveContextMeta(meta);
      if (saveResult.isErr) return saveResult;
    } else if (findResult.error.kind === 'NotFoundError') {
      const slugResult = FeatureSlug.create(slug);
      if (slugResult.isErr) return slugResult;
      workspace = new FeatureWorkspace({
        slug: slugResult.value,
        status: WorkspaceStatus.ACTIVE,
        contextMeta: meta,
        approvals: [],
        stages: [],
        artifacts: [],
      });
    } else {
      return findResult;
    }

    return this.repo.save(workspace);
  }

  public getFeatureWorkspaceDir(slug: string): Result<string, WorkspaceResultError> {
    return Result.ok(this.repo.getWorkspaceDir(slug));
  }

  public resolveArtifactPath(slug: string, artifactName: string): Result<string, WorkspaceResultError> {
    return Result.ok(this.repo.getArtifactPath(slug, artifactName));
  }

  public listAllFeatures(): Result<unknown[], WorkspaceResultError> {
    const result = this.repo.findAll();
    if (result.isErr) return result;
    return Result.ok(result.value.map((workspace) => workspace.toLegacyFormat()));
  }

  public listArchivedFeatures(): Result<unknown[], WorkspaceResultError> {
    const result = this.repo.findAllArchived();
    if (result.isErr) return result;
    return Result.ok(result.value.map((workspace) => workspace.toLegacyFormat()));
  }

  public recordGateApproval(slug: string, gate: string, approval: unknown): Result<void, WorkspaceResultError> {
    if (!isPlainObject(approval)) {
      return Result.err({
        kind: 'ValidationError',
        field: 'approval',
        message: 'Gate approval payload must be a valid object',
      });
    }

    const { approver, approvedAt, metadata } = approval;
    if (typeof approver !== 'string' || typeof approvedAt !== 'string') {
      return Result.err({
        kind: 'ValidationError',
        field: 'approval',
        message: 'Gate approval requires approver and approvedAt strings',
      });
    }
    if (metadata !== undefined && !isPlainObject(metadata)) {
      return Result.err({
        kind: 'ValidationError',
        field: 'approval',
        message: 'Gate approval metadata must be an object',
      });
    }

    const findResult = this.repo.findBySlug(slug);
    if (findResult.isErr) return findResult;

    const approvalResult = GateApproval.create({ gateName: gate, approver, approvedAt, metadata });
    if (approvalResult.isErr) return approvalResult;

    const workspace = findResult.value;
    const recordResult = workspace.recordGateApproval(approvalResult.value);
    if (recordResult.isErr) return recordResult;

    return this.repo.save(workspace);
  }

  public getPipelineStatus(slug: string): Result<unknown, WorkspaceResultError> {
    const findResult = this.repo.findBySlug(slug);
    if (findResult.isErr) return findResult;
    return Result.ok(PipelineEvaluator.evaluateStatus(findResult.value));
  }

  public createRollbackSnapshot(slug: string): Result<unknown, WorkspaceResultError> {
    const findResult = this.repo.findBySlug(slug);
    if (findResult.isErr) return findResult;

    const workspace = findResult.value;
    const snapshotResult = workspace.createRollbackSnapshot();
    if (snapshotResult.isErr) return snapshotResult;

    const saveResult = this.repo.saveSnapshot(slug, snapshotResult.value);
    if (saveResult.isErr) return saveResult;

    return Result.ok(snapshotResult.value.toLegacyFormat());
  }

  public cleanArtifacts(slug: string): Result<void, WorkspaceResultError> {
    return this.repo.cleanArtifacts(slug);
  }

  public archiveFeatureWorkspace(slug: string): Result<void, WorkspaceResultError> {
    const findResult = this.repo.findBySlug(slug);
    if (findResult.isErr) return findResult;

    const workspace = findResult.value;
    const archiveResult = workspace.archive();
    if (archiveResult.isErr) return archiveResult;

    return this.repo.moveToArchived(workspace);
  }

  public unarchiveFeatureWorkspace(slug: string): Result<void, WorkspaceResultError> {
    const findResult = this.repo.findArchivedBySlug(slug);
    if (findResult.isErr) return findResult;

    const workspace = findResult.value;
    const unarchiveResult = workspace.unarchive();
    if (unarchiveResult.isErr) return unarchiveResult;

    return this.repo.moveToActive(workspace);
  }

  public activateFeatureWorkspace(slug: string): Result<void, WorkspaceResultError> {
    const findResult = this.repo.findBySlug(slug);
    if (findResult.isErr) return findResult;

    const workspace = findResult.value;
    const activateResult = workspace.activate();
    if (activateResult.isErr) return activateResult;

    return this.repo.save(workspace);
  }
}
