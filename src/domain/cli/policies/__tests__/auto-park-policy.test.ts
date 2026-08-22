import { describe, it, expect } from 'vitest';
import { AutoParkPolicy } from '../auto-park-policy.js';

describe('AutoParkPolicy.evaluate', () => {
  it('proceeds directly when no active workspace exists', () => {
    const result = AutoParkPolicy.evaluate(false, null, 'bar');
    expect(result).toEqual({ requiresPrompt: false, canProceedDirectly: true });
  });

  it('proceeds directly when the active workspace equals the target workspace', () => {
    const result = AutoParkPolicy.evaluate(true, 'foo', 'foo');
    expect(result).toEqual({ requiresPrompt: false, canProceedDirectly: true });
  });

  it('requires a prompt when an active workspace differs from the target workspace', () => {
    const result = AutoParkPolicy.evaluate(true, 'foo', 'bar');
    expect(result).toEqual({ requiresPrompt: true, canProceedDirectly: false });
  });
});
