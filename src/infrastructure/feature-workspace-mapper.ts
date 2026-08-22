import { Result } from '../domain/common/result.js';
import { WorkspaceResultError } from '../domain/common/errors.js';
import { FeatureWorkspace, FeatureWorkspaceProps } from '../domain/feature-workspace/aggregates/feature-workspace.js';
import { FeatureSlug } from '../domain/feature-workspace/value-objects/feature-slug.js';
import { WorkspaceStatus } from '../domain/feature-workspace/value-objects/workspace-status.js';
import { GateApproval } from '../domain/feature-workspace/value-objects/gate-approval.js';
import { PipelineStage } from '../domain/feature-workspace/entities/pipeline-stage.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readError(directory: string, message: string): WorkspaceResultError {
  return { kind: 'PersistenceReadError', path: directory, cause: new Error(message) };
}

/** Translates between raw on-disk JSON and the `FeatureWorkspace` aggregate; the only place allowed to shape `.dag/` payloads. */
export class FeatureWorkspaceMapper {
  /**
   * @param slug Feature slug derived from the workspace directory name.
   * @param directory Absolute path to the workspace directory, used only for error context.
   * @param rawJson Parsed JSON payload read from the workspace's meta file.
   * @param isArchived Whether this workspace was read from the archived location.
   * @returns The reconstituted aggregate, or a `PersistenceReadError` if `rawJson` is malformed.
   */
  public static toDomain(
    slug: string,
    directory: string,
    rawJson: unknown,
    isArchived: boolean,
  ): Result<FeatureWorkspace, WorkspaceResultError> {
    if (!isPlainObject(rawJson)) {
      return Result.err(readError(directory, 'Workspace payload is not a valid object'));
    }

    const slugResult = FeatureSlug.create(slug);
    if (slugResult.isErr) {
      return Result.err(readError(directory, `Invalid workspace slug: ${slug}`));
    }

    const contextMetaRaw = rawJson.contextMeta;
    if (contextMetaRaw !== undefined && !isPlainObject(contextMetaRaw)) {
      return Result.err(readError(directory, 'Workspace contextMeta must be an object'));
    }
    const contextMeta = isPlainObject(contextMetaRaw) ? contextMetaRaw : {};

    const approvalsResult = FeatureWorkspaceMapper.readApprovals(rawJson.approvals, directory);
    if (approvalsResult.isErr) {
      return Result.err(approvalsResult.error);
    }

    const stagesResult = FeatureWorkspaceMapper.readStages(rawJson.stages, directory);
    if (stagesResult.isErr) {
      return Result.err(stagesResult.error);
    }

    const artifactsResult = FeatureWorkspaceMapper.readArtifacts(rawJson.artifacts, directory);
    if (artifactsResult.isErr) {
      return Result.err(artifactsResult.error);
    }

    const props: FeatureWorkspaceProps = {
      slug: slugResult.value,
      status: isArchived ? WorkspaceStatus.ARCHIVED : WorkspaceStatus.ACTIVE,
      contextMeta,
      approvals: approvalsResult.value,
      stages: stagesResult.value,
      artifacts: artifactsResult.value,
    };

    return Result.ok(FeatureWorkspace.reconstitute(props));
  }

  /**
   * @param workspace Aggregate to serialize.
   * @returns The plain-object persistence shape for writing to disk.
   */
  public static toPersistence(workspace: FeatureWorkspace): Record<string, unknown> {
    return workspace.toPersistenceFormat();
  }

  private static readApprovals(
    raw: unknown,
    directory: string,
  ): Result<GateApproval[], WorkspaceResultError> {
    if (raw === undefined) {
      return Result.ok([]);
    }
    if (!Array.isArray(raw)) {
      return Result.err(readError(directory, 'Workspace approvals must be an array'));
    }

    const approvals: GateApproval[] = [];
    for (const entry of raw) {
      if (!isPlainObject(entry)) {
        return Result.err(readError(directory, 'Workspace approval entry is not a valid object'));
      }
      const { gateName, approver, approvedAt, metadata } = entry;
      if (typeof gateName !== 'string' || typeof approver !== 'string' || typeof approvedAt !== 'string') {
        return Result.err(readError(directory, 'Workspace approval entry has invalid fields'));
      }
      if (metadata !== undefined && !isPlainObject(metadata)) {
        return Result.err(readError(directory, 'Workspace approval metadata must be an object'));
      }
      const approvalResult = GateApproval.create({ gateName, approver, approvedAt, metadata });
      if (approvalResult.isErr) {
        return Result.err(readError(directory, 'Workspace approval entry failed validation'));
      }
      approvals.push(approvalResult.value);
    }
    return Result.ok(approvals);
  }

  private static readStages(raw: unknown, directory: string): Result<PipelineStage[], WorkspaceResultError> {
    if (raw === undefined) {
      return Result.ok([]);
    }
    if (!Array.isArray(raw)) {
      return Result.err(readError(directory, 'Workspace stages must be an array'));
    }

    const stages: PipelineStage[] = [];
    for (const entry of raw) {
      if (!isPlainObject(entry)) {
        return Result.err(readError(directory, 'Workspace stage entry is not a valid object'));
      }
      const { name, requiredGates: requiredGatesRaw } = entry;
      if (typeof name !== 'string') {
        return Result.err(readError(directory, 'Workspace stage entry has invalid name'));
      }
      if (requiredGatesRaw !== undefined && !Array.isArray(requiredGatesRaw)) {
        return Result.err(readError(directory, 'Workspace stage requiredGates must be an array'));
      }
      const requiredGates: string[] = [];
      if (Array.isArray(requiredGatesRaw)) {
        for (const gate of requiredGatesRaw) {
          if (typeof gate !== 'string') {
            return Result.err(readError(directory, 'Workspace stage requiredGates entry must be a string'));
          }
          requiredGates.push(gate);
        }
      }
      const stageResult = PipelineStage.create({ name, requiredGates });
      if (stageResult.isErr) {
        return Result.err(readError(directory, 'Workspace stage entry failed validation'));
      }
      stages.push(stageResult.value);
    }
    return Result.ok(stages);
  }

  private static readArtifacts(raw: unknown, directory: string): Result<string[], WorkspaceResultError> {
    if (raw === undefined) {
      return Result.ok([]);
    }
    if (!Array.isArray(raw)) {
      return Result.err(readError(directory, 'Workspace artifacts must be an array'));
    }

    const artifacts: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        return Result.err(readError(directory, 'Workspace artifacts entry must be a string'));
      }
      artifacts.push(entry);
    }
    return Result.ok(artifacts);
  }
}
