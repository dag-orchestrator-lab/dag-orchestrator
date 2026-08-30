import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_COMMAND,
  DEFAULT_TYPECHECK_COMMAND,
  MAX_FIXER_RETRIES,
  type VerifyConfiguration,
} from '../models/verify-command.js';

describe('verify-command constants', () => {
  it('caps fixer retries at 3', () => {
    expect(MAX_FIXER_RETRIES).toBe(3);
  });

  it('defines a fully-typed typecheck command', () => {
    expect(DEFAULT_TYPECHECK_COMMAND.executable).toBe('npx');
    expect(DEFAULT_TYPECHECK_COMMAND.args).toEqual(['tsc', '--noEmit']);
    expect(typeof DEFAULT_TYPECHECK_COMMAND.cwd).toBe('string');
    expect(DEFAULT_TYPECHECK_COMMAND.timeoutMs).toBeGreaterThan(0);
  });

  it('defines a fully-typed test command', () => {
    expect(DEFAULT_TEST_COMMAND.executable).toBe('npx');
    expect(DEFAULT_TEST_COMMAND.args).toEqual(['vitest', 'run']);
    expect(typeof DEFAULT_TEST_COMMAND.cwd).toBe('string');
    expect(DEFAULT_TEST_COMMAND.timeoutMs).toBeGreaterThan(0);
  });

  it('allows overriding both commands via VerifyConfiguration', () => {
    const config: VerifyConfiguration = {
      typecheck: DEFAULT_TYPECHECK_COMMAND,
      test: DEFAULT_TEST_COMMAND,
    };

    expect(config.typecheck).toBe(DEFAULT_TYPECHECK_COMMAND);
    expect(config.test).toBe(DEFAULT_TEST_COMMAND);
  });
});
