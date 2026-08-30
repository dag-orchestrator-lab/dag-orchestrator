import { describe, expect, it } from 'vitest';
import { failure, success } from './result.js';

describe('success', () => {
  it('produces an Ok result carrying the value', () => {
    const result = success<number, string>(42);

    expect(result.isOk).toBe(true);
    expect(result.isErr).toBe(false);
    if (result.isOk) {
      expect(result.value).toBe(42);
    }
  });
});

describe('failure', () => {
  it('produces an Err result carrying the error', () => {
    const result = failure<string, number>('boom');

    expect(result.isOk).toBe(false);
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe('boom');
    }
  });
});
