import { describe, expect, it } from 'vitest';
import { ImmutableAddendumViolationError } from '../errors/immutable-addendum-violation-error.js';
import { ContractAddendumInvariants } from './contract-addendum-invariants.js';

describe('ContractAddendumInvariants.assertSequenceIncrement', () => {
  it('does not throw for sequence 1 when no prior addenda exist', () => {
    expect(() => ContractAddendumInvariants.assertSequenceIncrement([], 1)).not.toThrow();
  });

  it('does not throw for the next sequential sequence', () => {
    expect(() =>
      ContractAddendumInvariants.assertSequenceIncrement([1, 2], 3)
    ).not.toThrow();
  });

  it('throws ImmutableAddendumViolationError on a duplicate sequence', () => {
    expect(() => ContractAddendumInvariants.assertSequenceIncrement([1, 2], 2)).toThrow(
      ImmutableAddendumViolationError
    );
  });

  it('throws ImmutableAddendumViolationError on a skipped (non-sequential) sequence', () => {
    expect(() => ContractAddendumInvariants.assertSequenceIncrement([1, 2], 4)).toThrow(
      ImmutableAddendumViolationError
    );
  });

  it('throws ImmutableAddendumViolationError when starting above 1 with no prior addenda', () => {
    expect(() => ContractAddendumInvariants.assertSequenceIncrement([], 2)).toThrow(
      ImmutableAddendumViolationError
    );
  });
});
