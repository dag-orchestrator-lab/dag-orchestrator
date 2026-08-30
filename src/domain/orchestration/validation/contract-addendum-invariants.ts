import { ImmutableAddendumViolationError } from '../errors/immutable-addendum-violation-error.js';

/** Invariant checks for `ContractAddendum` sequencing and immutability. */
export class ContractAddendumInvariants {
  /**
   * Asserts that `newSequence` is a fresh, monotonically-sequential addendum sequence number.
   * @param priorSequences - the `addendumSequence` values of all previously written addenda for the feature.
   * @param newSequence - the sequence number of the addendum about to be written.
   * @throws ImmutableAddendumViolationError if `newSequence` duplicates an existing sequence, or is not
   * exactly one greater than the highest prior sequence (or `1` when no prior addenda exist).
   */
  public static assertSequenceIncrement(
    priorSequences: readonly number[],
    newSequence: number
  ): void {
    if (priorSequences.includes(newSequence)) {
      throw new ImmutableAddendumViolationError(
        `addendum sequence ${newSequence} already exists; addenda are immutable and cannot be rewritten`
      );
    }

    const expectedSequence =
      priorSequences.length === 0 ? 1 : Math.max(...priorSequences) + 1;
    if (newSequence !== expectedSequence) {
      throw new ImmutableAddendumViolationError(
        `addendum sequence ${newSequence} is non-sequential; expected ${expectedSequence}`
      );
    }
  }
}
