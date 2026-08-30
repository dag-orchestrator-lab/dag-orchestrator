import { describe, it, expect } from 'vitest';
import { DomainError } from '../../common/errors.js';
import { InvalidStageTransitionError } from './pipeline-stage-invariant-error.js';

describe('InvalidStageTransitionError', () => {
  it('is a DomainError and an Error', () => {
    const err = new InvalidStageTransitionError('CODER_RUNNING', '05-tasks.md is missing');
    expect(err).toBeInstanceOf(InvalidStageTransitionError);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to InvalidStageTransitionError', () => {
    const err = new InvalidStageTransitionError('CODER_RUNNING', 'boom');
    expect(err.name).toBe('InvalidStageTransitionError');
  });

  it('exposes targetStage as a readable field', () => {
    const err = new InvalidStageTransitionError('CODER_RUNNING', 'boom');
    expect(err.targetStage).toBe('CODER_RUNNING');
  });

  it('includes targetStage and message in the error message', () => {
    const err = new InvalidStageTransitionError('CODER_RUNNING', '05-tasks.md is missing');
    expect(err.message).toContain('CODER_RUNNING');
    expect(err.message).toContain('05-tasks.md is missing');
  });
});
