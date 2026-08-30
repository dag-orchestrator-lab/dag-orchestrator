import { describe, expect, it } from 'vitest';
import { TaskAttemptLimitExceededError } from '../errors/task-attempt-limit-error.js';
import { MAX_FIXER_RETRIES } from '../models/verify-command.js';
import { TaskAttemptInvariants } from './task-attempt-invariants.js';

describe('TaskAttemptInvariants.assertValidAttemptNumber', () => {
  it('does not throw at attemptNumber 1', () => {
    expect(() => TaskAttemptInvariants.assertValidAttemptNumber('T-1', 1)).not.toThrow();
  });

  it('does not throw at the boundary of 1 + MAX_FIXER_RETRIES', () => {
    expect(() =>
      TaskAttemptInvariants.assertValidAttemptNumber('T-1', 1 + MAX_FIXER_RETRIES)
    ).not.toThrow();
  });

  it('throws TaskAttemptLimitExceededError one above the boundary', () => {
    expect(() =>
      TaskAttemptInvariants.assertValidAttemptNumber('T-1', 2 + MAX_FIXER_RETRIES)
    ).toThrow(TaskAttemptLimitExceededError);
  });

  it('carries the taskId and attemptNumber on the thrown error', () => {
    try {
      TaskAttemptInvariants.assertValidAttemptNumber('T-9', 2 + MAX_FIXER_RETRIES);
      expect.fail('expected assertValidAttemptNumber to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(TaskAttemptLimitExceededError);
      const typedError = error as TaskAttemptLimitExceededError;
      expect(typedError.taskId).toBe('T-9');
      expect(typedError.attemptNumber).toBe(2 + MAX_FIXER_RETRIES);
    }
  });
});
