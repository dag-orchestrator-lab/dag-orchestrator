import { describe, it, expect } from 'vitest';
import { DomainError } from '../../common/errors.js';
import { ImmutableAddendumViolationError } from './immutable-addendum-violation-error.js';

describe('ImmutableAddendumViolationError', () => {
  it('is a DomainError and an Error', () => {
    const err = new ImmutableAddendumViolationError('addendum 1 content changed after creation');
    expect(err).toBeInstanceOf(ImmutableAddendumViolationError);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to ImmutableAddendumViolationError', () => {
    const err = new ImmutableAddendumViolationError('boom');
    expect(err.name).toBe('ImmutableAddendumViolationError');
  });

  it('includes the message content in the error message', () => {
    const err = new ImmutableAddendumViolationError('addendum 1 content changed after creation');
    expect(err.message).toContain('addendum 1 content changed after creation');
  });
});
