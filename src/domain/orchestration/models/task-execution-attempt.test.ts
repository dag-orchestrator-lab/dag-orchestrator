import { describe, expect, it } from 'vitest';
import type { SubprocessExecutionResult } from './subprocess-command.js';
import { TaskExecutionAttempt } from './task-execution-attempt.js';

const successResult: SubprocessExecutionResult = {
  exitCode: 0,
  stdout: 'all tests passed',
  stderr: '',
  didTimeout: false,
};

const failureResult: SubprocessExecutionResult = {
  exitCode: 1,
  stdout: 'running suite...\nsome stdout context',
  stderr: 'TypeError: boom',
  didTimeout: false,
};

describe('TaskExecutionAttempt', () => {
  it('createInitial starts at attempt 1 in RUNNING status', () => {
    const attempt = TaskExecutionAttempt.createInitial('T-3');

    expect(attempt.taskId).toBe('T-3');
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.status).toBe('RUNNING');
    expect(attempt.verifyResult).toBeUndefined();
    expect(attempt.stackTraceSummary).toBeUndefined();
  });

  it('createNext increments attemptNumber and carries forward the stack trace summary', () => {
    const initial = TaskExecutionAttempt.createInitial('T-3');
    const next = TaskExecutionAttempt.createNext(initial, 'prior failure summary');

    expect(next.attemptNumber).toBe(2);
    expect(next.status).toBe('RUNNING');
    expect(next.stackTraceSummary).toBe('prior failure summary');
  });

  it('recordResult marks VERIFIED on a successful, non-timed-out result', () => {
    const attempt = TaskExecutionAttempt.createInitial('T-3').recordResult(successResult);

    expect(attempt.status).toBe('VERIFIED');
    expect(attempt.verifyResult).toBe(successResult);
    expect(attempt.stackTraceSummary).toBeUndefined();
  });

  it('recordResult marks FAILED and populates stackTraceSummary from combined stdout+stderr, not stderr alone', () => {
    const attempt = TaskExecutionAttempt.createInitial('T-3').recordResult(failureResult);

    expect(attempt.status).toBe('FAILED');
    expect(attempt.stackTraceSummary).toContain('some stdout context');
    expect(attempt.stackTraceSummary).toContain('TypeError: boom');
    expect(attempt.stackTraceSummary).not.toBe(failureResult.stderr);
  });

  it('recordResult marks FAILED when the result timed out even with exitCode 0', () => {
    const timedOut: SubprocessExecutionResult = {
      exitCode: 0,
      stdout: 'stuck',
      stderr: '',
      didTimeout: true,
    };

    const attempt = TaskExecutionAttempt.createInitial('T-3').recordResult(timedOut);

    expect(attempt.status).toBe('FAILED');
  });

  it('extractStackTrace truncates combined output to the last 4000 characters', () => {
    const longStdout = 'a'.repeat(3000);
    const longStderr = 'b'.repeat(3000);
    const longResult: SubprocessExecutionResult = {
      exitCode: 1,
      stdout: longStdout,
      stderr: longStderr,
      didTimeout: false,
    };

    const attempt = TaskExecutionAttempt.createInitial('T-3').recordResult(longResult);

    expect(attempt.stackTraceSummary).toHaveLength(4000);
    expect(attempt.stackTraceSummary?.endsWith('b'.repeat(3000))).toBe(true);
  });

  it('markExhausted transitions status to EXHAUSTED while preserving prior data', () => {
    const failed = TaskExecutionAttempt.createInitial('T-3').recordResult(failureResult);
    const exhausted = failed.markExhausted();

    expect(exhausted.status).toBe('EXHAUSTED');
    expect(exhausted.attemptNumber).toBe(failed.attemptNumber);
    expect(exhausted.verifyResult).toBe(failed.verifyResult);
    expect(exhausted.stackTraceSummary).toBe(failed.stackTraceSummary);
  });

  it('is immutable: each transition returns a new instance without mutating the original', () => {
    const initial = TaskExecutionAttempt.createInitial('T-3');
    const recorded = initial.recordResult(failureResult);

    expect(initial.status).toBe('RUNNING');
    expect(recorded).not.toBe(initial);
  });
});
