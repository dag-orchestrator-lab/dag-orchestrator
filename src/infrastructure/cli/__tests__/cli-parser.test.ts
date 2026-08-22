import { describe, expect, it } from 'vitest';
import { CliParser } from '../cli-parser.js';

describe('CliParser.parse', () => {
  it('parses a known command with a positional argument', () => {
    const result = CliParser.parse(['node', 'dag', 'plan', 'my-feature']);
    expect(result).toEqual({
      type: 'plan',
      args: ['my-feature'],
      flags: {},
      rawCommand: 'plan',
    });
  });

  it('returns type unknown for an unrecognized command', () => {
    const result = CliParser.parse(['node', 'dag', 'bogus']);
    expect(result.type).toBe('unknown');
    expect(result.rawCommand).toBe('bogus');
  });

  it('returns type unknown with empty rawCommand when no args are given', () => {
    const result = CliParser.parse(['node', 'dag']);
    expect(result).toEqual({ type: 'unknown', args: [], flags: {}, rawCommand: '' });
  });

  it.each(['init', 'doctor', 'features', 'new', 'archive', 'rollback', 'config', 'step0', 'step1', 'step2', 'step3', 'step4'])(
    'recognizes command %s',
    (command) => {
      const result = CliParser.parse(['node', 'dag', command]);
      expect(result.type).toBe(command);
    }
  );

  it('lowercases the command name', () => {
    const result = CliParser.parse(['node', 'dag', 'PLAN', 'foo']);
    expect(result.type).toBe('plan');
  });

  it('parses a long flag with a value', () => {
    const result = CliParser.parse(['node', 'dag', 'config', '--set', 'value']);
    expect(result.flags).toEqual({ set: 'value' });
    expect(result.args).toEqual([]);
  });

  it('parses a long flag with no value as boolean true', () => {
    const result = CliParser.parse(['node', 'dag', 'config', '--verbose']);
    expect(result.flags).toEqual({ verbose: true });
  });

  it('treats a flag value followed by another flag as boolean true', () => {
    const result = CliParser.parse(['node', 'dag', 'config', '--verbose', '--set', 'value']);
    expect(result.flags).toEqual({ verbose: true, set: 'value' });
  });

  it('parses a short flag as boolean true', () => {
    const result = CliParser.parse(['node', 'dag', 'config', '-f']);
    expect(result.flags).toEqual({ f: true });
  });

  it('collects positional args separately from flags', () => {
    const result = CliParser.parse(['node', 'dag', 'new', 'my-feature', '--force']);
    expect(result.args).toEqual(['my-feature']);
    expect(result.flags).toEqual({ force: true });
  });
});
