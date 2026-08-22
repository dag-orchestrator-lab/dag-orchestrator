import { Result } from '../../common/result.js';
import { DomainError } from '../../common/errors.js';

export interface RollbackSnapshotProps {
  readonly snapshotId: string;
  readonly slug: string;
  readonly createdAt: string;
  readonly metadataContent: Record<string, unknown>;
  readonly artifactManifest: ReadonlyArray<string>;
}

/** Immutable representation of a workspace's historical state prior to mutation or rollback. */
export class RollbackSnapshot {
  readonly snapshotId: string;
  readonly slug: string;
  readonly createdAt: string;
  readonly metadataContent: Readonly<Record<string, unknown>>;
  readonly artifactManifest: ReadonlyArray<string>;

  private constructor(props: RollbackSnapshotProps) {
    this.snapshotId = props.snapshotId;
    this.slug = props.slug;
    this.createdAt = props.createdAt;
    this.metadataContent = Object.freeze({ ...props.metadataContent });
    this.artifactManifest = Object.freeze([...props.artifactManifest]);
    Object.freeze(this);
  }

  /**
   * @param props Snapshot fields.
   * @returns A frozen `RollbackSnapshot`, or a `ValidationError` if snapshotId or slug is missing.
   */
  public static create(props: RollbackSnapshotProps): Result<RollbackSnapshot, DomainError> {
    if (!props.snapshotId || props.snapshotId.trim().length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'snapshotId',
        message: 'Snapshot ID is required',
      });
    }
    if (!props.slug || props.slug.trim().length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'slug',
        message: 'Slug is required',
      });
    }
    if (!props.createdAt || props.createdAt.trim().length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'createdAt',
        message: 'Created at timestamp is required',
      });
    }
    return Result.ok(new RollbackSnapshot(props));
  }

  /**
   * Serializes the snapshot into the legacy plain-object shape expected by pre-migration call sites.
   * @returns A record containing snapshotId, slug, createdAt, metadataContent, and artifactManifest.
   */
  public toLegacyFormat(): Record<string, unknown> {
    return {
      snapshotId: this.snapshotId,
      slug: this.slug,
      createdAt: this.createdAt,
      metadataContent: this.metadataContent,
      artifactManifest: this.artifactManifest,
    };
  }
}
