export type AutoParkDecision = 'PARK_AND_PROCEED' | 'CANCEL';

/** Represents the user decision when an active workspace collision occurs during `plan` or `new`. */
export class AutoParkAction {
  private constructor(public readonly decision: AutoParkDecision) {
    Object.freeze(this);
  }

  public static parkAndProceed(): AutoParkAction {
    return new AutoParkAction('PARK_AND_PROCEED');
  }

  public static cancel(): AutoParkAction {
    return new AutoParkAction('CANCEL');
  }

  public shouldPark(): boolean {
    return this.decision === 'PARK_AND_PROCEED';
  }
}
