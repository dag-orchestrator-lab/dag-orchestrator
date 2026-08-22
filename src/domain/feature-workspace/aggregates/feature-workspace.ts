import { Result } from '../../common/result.js';
import { DomainError } from '../../common/errors.js';
import { FeatureSlug } from '../value-objects/feature-slug.js';
import { GateApproval } from '../value-objects/gate-approval.js';
import { RollbackSnapshot } from '../value-objects/rollback-snapshot.js';
import { WorkspaceStatus } from '../value-objects/workspace-status.js';
import { PipelineStage } from '../entities/pipeline-stage.js';

export interface FeatureWorkspaceProps {
  readonly slug: FeatureSlug;
  readonly status: WorkspaceStatus;
  readonly contextMeta: Record<string, unknown>;
  readonly approvals: ReadonlyArray<GateApproval>;
  readonly stages: ReadonlyArray<PipelineStage>;
  readonly artifacts: ReadonlyArray<string>;
}

/** Aggregate root managing feature state transitions, context metadata, approvals, and artifacts. */
export class FeatureWorkspace {
  private readonly _slug: FeatureSlug;
  private _status: WorkspaceStatus;
  private _contextMeta: Record<string, unknown>;
  private _approvals: GateApproval[];
  private readonly _stages: PipelineStage[];
  private _artifacts: string[];

  constructor(props: FeatureWorkspaceProps) {
    this._slug = props.slug;
    this._status = props.status;
    this._contextMeta = { ...props.contextMeta };
    this._approvals = [...props.approvals];
    this._stages = [...props.stages];
    this._artifacts = [...props.artifacts];
  }

  /**
   * @param props Previously persisted aggregate state.
   * @returns A `FeatureWorkspace` reconstructed from persistence, for use by infrastructure mappers.
   */
  public static reconstitute(props: FeatureWorkspaceProps): FeatureWorkspace {
    return new FeatureWorkspace(props);
  }

  // Identifiers & Read-only Projections
  public get slug(): FeatureSlug {
    return this._slug;
  }

  public get status(): WorkspaceStatus {
    return this._status;
  }

  public get contextMeta(): Readonly<Record<string, unknown>> {
    return Object.freeze({ ...this._contextMeta });
  }

  public get approvals(): ReadonlyArray<GateApproval> {
    return Object.freeze([...this._approvals]);
  }

  public get stages(): ReadonlyArray<PipelineStage> {
    return Object.freeze([...this._stages]);
  }

  public get artifacts(): ReadonlyArray<string> {
    return Object.freeze([...this._artifacts]);
  }

  // --- Aggregate Invariants & State Mutations ---

  /**
   * Mutates context metadata. Guarantees atomic, valid state replace.
   */
  public saveContextMeta(meta: Record<string, unknown>): Result<void, DomainError> {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return Result.err({
        kind: 'ValidationError',
        field: 'contextMeta',
        message: 'Context metadata must be a valid non-array object',
      });
    }
    this._contextMeta = { ...meta };
    return Result.ok(undefined);
  }

  /**
   * Records a gate approval. Appends or replaces approval for the specified gate.
   */
  public recordGateApproval(approval: GateApproval): Result<void, DomainError> {
    const existingIndex = this._approvals.findIndex((a) => a.gateName === approval.gateName);
    if (existingIndex >= 0) {
      this._approvals[existingIndex] = approval;
    } else {
      this._approvals.push(approval);
    }
    return Result.ok(undefined);
  }

  /**
   * Archives active workspace.
   * Invariant: Mutual exclusivity - workspace cannot be active and archived simultaneously.
   */
  public archive(): Result<void, DomainError> {
    if (this._status.isArchived()) {
      return Result.ok(undefined);
    }
    this._status = WorkspaceStatus.ARCHIVED;
    return Result.ok(undefined);
  }

  /**
   * Unarchives an archived workspace.
   */
  public unarchive(): Result<void, DomainError> {
    if (this._status.isActive()) {
      return Result.ok(undefined);
    }
    this._status = WorkspaceStatus.ACTIVE;
    return Result.ok(undefined);
  }

  /**
   * Explicitly activates a feature workspace.
   */
  public activate(): Result<void, DomainError> {
    this._status = WorkspaceStatus.ACTIVE;
    return Result.ok(undefined);
  }

  /**
   * Cleans artifacts tracking list in domain model.
   */
  public cleanArtifacts(): Result<string[], DomainError> {
    const removed = [...this._artifacts];
    this._artifacts = [];
    return Result.ok(removed);
  }

  /**
   * Generates a RollbackSnapshot from current aggregate state.
   */
  public createRollbackSnapshot(): Result<RollbackSnapshot, DomainError> {
    const snapshotId = `snapshot-${Date.now()}`;
    return RollbackSnapshot.create({
      snapshotId,
      slug: this._slug.value,
      createdAt: new Date().toISOString(),
      metadataContent: this._contextMeta,
      artifactManifest: this._artifacts,
    });
  }

  /**
   * Serializes full aggregate state for round-trip persistence by infrastructure mappers.
   * @returns A record containing slug, status, contextMeta, approvals, stages, and artifacts.
   */
  public toPersistenceFormat(): Record<string, unknown> {
    return {
      slug: this._slug.value,
      status: this._status.value,
      contextMeta: { ...this._contextMeta },
      approvals: this._approvals.map((approval) => ({
        gateName: approval.gateName,
        approver: approval.approver,
        approvedAt: approval.approvedAt,
        metadata: { ...approval.metadata },
      })),
      stages: this._stages.map((stage) => ({
        name: stage.name,
        requiredGates: [...stage.requiredGates],
      })),
      artifacts: [...this._artifacts],
    };
  }

  /**
   * Serializes the aggregate into the flattened legacy plain-object shape expected by pre-migration call sites.
   * @returns A record with `slug`, `status`, and `contextMeta` fields spread at the top level.
   */
  public toLegacyFormat(): Record<string, unknown> {
    return {
      ...this._contextMeta,
      slug: this._slug.value,
      status: this._status.value,
    };
  }
}
