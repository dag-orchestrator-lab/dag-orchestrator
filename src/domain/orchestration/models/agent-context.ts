import { Result } from '../../common/result.js';
import { PipelineStage } from '../../feature-workspace/entities/pipeline-stage.js';
import { ContextValidationError } from '../errors/context-validation-error.js';
import { isAbsolutePath } from '../validation/invariants.js';
import type { ArtifactReference } from './artifact-reference.js';
import type { FilePresenceCheckerPort } from '../ports/file-presence-checker-port.js';

export interface AgentContextProps {
  readonly pipelineState: PipelineStage;
  readonly workingDirectory: string;
  readonly artifactRefs: readonly ArtifactReference[];
}

/** The input handed to a Sub-Agent's execute(): pipeline state, working directory, and artifact references. */
export class AgentContext {
  readonly pipelineState: PipelineStage;
  readonly workingDirectory: string;
  readonly artifactRefs: readonly ArtifactReference[];

  private constructor(props: AgentContextProps) {
    this.pipelineState = props.pipelineState;
    this.workingDirectory = props.workingDirectory;
    this.artifactRefs = Object.freeze([...props.artifactRefs]);
    Object.freeze(this);
  }

  /**
   * @param props Context fields.
   * @param filePresenceChecker Port used to verify artifact files exist at construction time.
   * @returns A frozen `AgentContext`, or a `ContextValidationError` if the working directory is relative
   * or an artifact reference is relative/missing (Invariants 1 and 2).
   */
  public static create(
    props: AgentContextProps,
    filePresenceChecker: FilePresenceCheckerPort
  ): Result<AgentContext, ContextValidationError> {
    if (!isAbsolutePath(props.workingDirectory)) {
      return Result.err(
        new ContextValidationError(
          `AgentContext.workingDirectory must be an absolute path, got '${props.workingDirectory}'`,
          'RELATIVE_WORKING_DIRECTORY'
        )
      );
    }

    for (const ref of props.artifactRefs) {
      if (!isAbsolutePath(ref.absolutePath) || !filePresenceChecker.existsSync(ref.absolutePath)) {
        return Result.err(
          new ContextValidationError(
            `AgentContext.artifactRefs entry for stage '${ref.stageId}' must be an absolute path to an existing file, got '${ref.absolutePath}'`,
            'INVALID_ARTIFACT_REF'
          )
        );
      }
    }

    return Result.ok(new AgentContext(props));
  }
}
