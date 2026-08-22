import { Result } from '../../common/result.js';
import { WorkspaceResultError } from '../../common/errors.js';

export interface GateApprovalProps {
  readonly gateName: string;
  readonly approver: string;
  readonly approvedAt: string;
  readonly metadata?: Record<string, unknown>;
}

/** Immutable record of a pipeline gate approval. */
export class GateApproval {
  readonly gateName: string;
  readonly approver: string;
  readonly approvedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(props: GateApprovalProps) {
    this.gateName = props.gateName;
    this.approver = props.approver;
    this.approvedAt = props.approvedAt;
    this.metadata = Object.freeze({ ...props.metadata });
    Object.freeze(this);
  }

  /**
   * @param props Gate approval fields.
   * @returns A frozen `GateApproval`, or a `ValidationError` if gateName or approver is empty.
   */
  public static create(props: GateApprovalProps): Result<GateApproval, WorkspaceResultError> {
    if (!props.gateName || props.gateName.trim().length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'gateName',
        message: 'Gate name must not be empty',
      });
    }
    if (!props.approver || props.approver.trim().length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'approver',
        message: 'Approver must not be empty',
      });
    }
    if (!props.approvedAt || props.approvedAt.trim().length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'approvedAt',
        message: 'Approved at timestamp must not be empty',
      });
    }
    return Result.ok(new GateApproval(props));
  }
}
