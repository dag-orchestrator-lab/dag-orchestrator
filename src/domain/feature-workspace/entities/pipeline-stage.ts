import { Result } from '../../common/result.js';
import { DomainError } from '../../common/errors.js';
import { GateApproval } from '../value-objects/gate-approval.js';

export interface PipelineStageProps {
  readonly name: string;
  readonly requiredGates: ReadonlyArray<string>;
}

/** A named stage within a feature's pipeline, gated by zero or more required approvals. */
export class PipelineStage {
  readonly name: string;
  readonly requiredGates: ReadonlyArray<string>;

  private constructor(props: PipelineStageProps) {
    this.name = props.name;
    this.requiredGates = Object.freeze([...props.requiredGates]);
    Object.freeze(this);
  }

  /**
   * @param props Stage fields.
   * @returns A frozen `PipelineStage`, or a `ValidationError` if name is empty.
   */
  public static create(props: PipelineStageProps): Result<PipelineStage, DomainError> {
    if (!props.name || props.name.trim().length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'name',
        message: 'Stage name must not be empty',
      });
    }
    return Result.ok(new PipelineStage(props));
  }

  /**
   * @param approvals Approvals recorded so far, from any stage.
   * @returns `true` iff every entry in `requiredGates` has a matching `GateApproval.gateName`.
   */
  public isComplete(approvals: ReadonlyArray<GateApproval>): boolean {
    const approvedGateNames = new Set(approvals.map((approval) => approval.gateName));
    return this.requiredGates.every((gateName) => approvedGateNames.has(gateName));
  }
}
