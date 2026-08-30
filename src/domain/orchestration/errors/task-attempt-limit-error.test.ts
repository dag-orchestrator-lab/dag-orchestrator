import { describe, it, expect } from 'vitest';
import { DomainError } from '../../common/errors.js';
import { TaskAttemptLimitExceededError } from './task-attempt-limit-error.js';

describe('TaskAttemptLimitExceededError', () => {
  it('is a DomainError and an Error', () => {
    const err = new TaskAttemptLimitExceededError('T-7', 5, 'MAX_FIXER_RETRIES exceeded');
    expect(err).toBeInstanceOf(TaskAttemptLimitExceededError);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to TaskAttemptLimitExceededError', () => {
    const err = new TaskAttemptLimitExceededError('T-7', 5, 'boom');
    expect(err.name).toBe('TaskAttemptLimitExceededError');
  });

  it('exposes taskId and attemptNumber as readable fields', () => {
    const err = new TaskAttemptLimitExceededError('T-7', 5, 'boom');
    expect(err.taskId).toBe('T-7');
    expect(err.attemptNumber).toBe(5);
  });

  it('includes taskId, attemptNumber, and message in the error message', () => {
    const err = new TaskAttemptLimitExceededError('T-7', 5, 'MAX_FIXER_RETRIES exceeded');
    expect(err.message).toContain('T-7');
    expect(err.message).toContain('5');
    expect(err.message).toContain('MAX_FIXER_RETRIES exceeded');
  });
});
