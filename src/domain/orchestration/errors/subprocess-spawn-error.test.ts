import { describe, it, expect } from 'vitest';
import { DomainError } from '../../common/errors.js';
import { SubprocessSpawnError } from './subprocess-spawn-error.js';

describe('SubprocessSpawnError', () => {
  it('is a DomainError and an Error', () => {
    const err = new SubprocessSpawnError('npx', ['tsc', '--noEmit'], new Error('ENOENT'));
    expect(err).toBeInstanceOf(SubprocessSpawnError);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to SubprocessSpawnError', () => {
    const err = new SubprocessSpawnError('npx', [], new Error('boom'));
    expect(err.name).toBe('SubprocessSpawnError');
  });

  it('exposes executable, args, and causeError as readable fields', () => {
    const cause = new Error('ENOENT');
    const err = new SubprocessSpawnError('npx', ['vitest', 'run'], cause);
    expect(err.executable).toBe('npx');
    expect(err.args).toEqual(['vitest', 'run']);
    expect(err.causeError).toBe(cause);
  });

  it('includes the executable and cause message in the error message', () => {
    const err = new SubprocessSpawnError('npx', ['tsc'], new Error('ENOENT'));
    expect(err.message).toContain('npx');
    expect(err.message).toContain('ENOENT');
  });
});
