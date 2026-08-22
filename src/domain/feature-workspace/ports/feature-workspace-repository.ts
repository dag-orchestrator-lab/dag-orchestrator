import { Result } from '../../common/result.js';
import { WorkspaceResultError } from '../../common/errors.js';
import { FeatureWorkspace } from '../aggregates/feature-workspace.js';
import { RollbackSnapshot } from '../value-objects/rollback-snapshot.js';

/** Repository port for persisting and retrieving `FeatureWorkspace` aggregates, implemented by an infrastructure-layer fs mapper. */
export interface FeatureWorkspaceRepository {
  findBySlug(slug: string): Result<FeatureWorkspace, WorkspaceResultError>;
  findArchivedBySlug(slug: string): Result<FeatureWorkspace, WorkspaceResultError>;
  findAll(): Result<FeatureWorkspace[], WorkspaceResultError>;
  findAllArchived(): Result<FeatureWorkspace[], WorkspaceResultError>;
  save(workspace: FeatureWorkspace): Result<void, WorkspaceResultError>;
  moveToArchived(workspace: FeatureWorkspace): Result<void, WorkspaceResultError>;
  moveToActive(workspace: FeatureWorkspace): Result<void, WorkspaceResultError>;
  saveSnapshot(slug: string, snapshot: RollbackSnapshot): Result<void, WorkspaceResultError>;
  cleanArtifacts(slug: string): Result<void, WorkspaceResultError>;
  getWorkspaceDir(slug: string): string;
  getArtifactPath(slug: string, artifactName: string): string;
}
