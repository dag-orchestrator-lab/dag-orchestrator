import { InvalidStageTransitionError } from '../errors/pipeline-stage-invariant-error.js';
import type { GateApproval } from '../../feature-workspace/value-objects/gate-approval.js';

const CODER_RUNNING_STAGE = 'CODER_RUNNING';
const COMPLETED_STAGE = 'COMPLETED';

/** Gate name used to identify Gate 4's `GateApproval`, matched the same way earlier gates are. */
export const GATE_4_NAME = 'gate-4';

/** Invariant checks for `PipelineStage` transitions. */
export class PipelineStageInvariants {
  /**
   * Asserts a stage may transition to `CODER_RUNNING`.
   * @param plannerCompleted - whether the `PLANNER` stage has completed.
   * @param tasksFileExists - whether `05-tasks.md` exists in the feature workspace.
   * @throws InvalidStageTransitionError if the Planner has not completed or `05-tasks.md` is missing.
   */
  public static assertCanTransitionToCoder(
    plannerCompleted: boolean,
    tasksFileExists: boolean
  ): void {
    if (!plannerCompleted || !tasksFileExists) {
      throw new InvalidStageTransitionError(
        CODER_RUNNING_STAGE,
        `plannerCompleted=${plannerCompleted}, tasksFileExists=${tasksFileExists}`
      );
    }
  }

  /**
   * Asserts a pipeline may advance past Gate 4.
   * @param gate4Approval - the `GateApproval` recorded for `gateName = 'gate-4'`, if any; a `GateApproval`
   * has no built-in `PENDING` state, so its absence is treated as the pending/unapproved case.
   * @throws InvalidStageTransitionError if no matching `GateApproval` for Gate 4 has been recorded.
   */
  public static assertCanAdvancePastGate4(gate4Approval: GateApproval | undefined): void {
    if (gate4Approval === undefined || gate4Approval.gateName !== GATE_4_NAME) {
      throw new InvalidStageTransitionError(
        COMPLETED_STAGE,
        `GateApproval for '${GATE_4_NAME}' is absent or pending`
      );
    }
  }
}
