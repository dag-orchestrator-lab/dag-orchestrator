import { Result } from '../../common/result.js';
import { DomainError } from '../../common/errors.js';
import { FeatureWorkspace } from '../aggregates/feature-workspace.js';
import { RollbackSnapshot } from '../value-objects/rollback-snapshot.js';

/** Repository port for persisting and retrieving `FeatureWorkspace` aggregates, implemented by an infrastructure-layer fs mapper. */
export interface FeatureWorkspaceRepository {
  findBySlug(slug: string): Result<FeatureWorkspace, DomainError>;
  findArchivedBySlug(slug: string): Result<FeatureWorkspace, DomainError>;
  findAll(): Result<FeatureWorkspace[], DomainError>;
  findAllArchived(): Result<FeatureWorkspace[], DomainError>;
  save(workspace: FeatureWorkspace): Result<void, DomainError>;
  moveToArchived(workspace: FeatureWorkspace): Result<void, DomainError>;
  moveToActive(workspace: FeatureWorkspace): Result<void, DomainError>;
  saveSnapshot(slug: string, snapshot: RollbackSnapshot): Result<void, DomainError>;
  cleanArtifacts(slug: string): Result<void, DomainError>;
  getWorkspaceDir(slug: string): string;
  getArtifactPath(slug: string, artifactName: string): string;
}
