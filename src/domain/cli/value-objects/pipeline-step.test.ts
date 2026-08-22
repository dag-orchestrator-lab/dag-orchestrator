import { describe, it, expect } from 'vitest';
import { PipelineStep, InvalidStepError } from './pipeline-step.js';

describe('PipelineStep', () => {
  it('fromString succeeds for "step0"', () => {
    const result = PipelineStep.fromString('step0');
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.value).toBe(0);
      expect(result.value.toString()).toBe('step0');
    }
  });

  it('fromString succeeds for "step4"', () => {
    const result = PipelineStep.fromString('step4');
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.value).toBe(4);
    }
  });

  it('fromString fails for "step5"', () => {
    const result = PipelineStep.fromString('step5');
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(InvalidStepError);
    }
  });

  it('fromString fails for malformed input', () => {
    const result = PipelineStep.fromString('bogus');
    expect(result.isErr).toBe(true);
  });

  it('create fails for out-of-range integers', () => {
    expect(PipelineStep.create(-1).isErr).toBe(true);
    expect(PipelineStep.create(5).isErr).toBe(true);
  });

  it('create fails for non-integers', () => {
    expect(PipelineStep.create(2.5).isErr).toBe(true);
  });

  it('create succeeds within range 0-4', () => {
    for (let step = 0; step <= 4; step++) {
      const result = PipelineStep.create(step);
      expect(result.isOk).toBe(true);
    }
  });

  it('equals compares by value', () => {
    const a = PipelineStep.create(2);
    const b = PipelineStep.create(2);
    if (a.isOk && b.isOk) {
      expect(a.value.equals(b.value)).toBe(true);
    }
  });
});
