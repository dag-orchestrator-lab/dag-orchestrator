import { describe, expect, it } from 'vitest';
import { ProviderExecutionError } from '../errors/provider-execution-error.js';
import { validateExecutionInput, validateStageConfig } from './invariants.js';

describe('validateExecutionInput', () => {
  it('accepts a valid prompt with no options', () => {
    const result = validateExecutionInput('Summarize this repo');

    expect(result.isOk).toBe(true);
  });

  it('accepts a valid prompt with in-range options', () => {
    const result = validateExecutionInput('Summarize this repo', {
      temperature: 1,
      maxOutputTokens: 512,
      timeoutMs: 30000,
    });

    expect(result.isOk).toBe(true);
  });

  it('rejects an empty prompt', () => {
    const result = validateExecutionInput('');

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(ProviderExecutionError);
    }
  });

  it('rejects a whitespace-only prompt', () => {
    const result = validateExecutionInput('   \n\t  ');

    expect(result.isErr).toBe(true);
  });

  it('rejects temperature below 0', () => {
    const result = validateExecutionInput('hello', { temperature: -0.1 });

    expect(result.isErr).toBe(true);
  });

  it('rejects temperature above 2', () => {
    const result = validateExecutionInput('hello', { temperature: 2.1 });

    expect(result.isErr).toBe(true);
  });

  it('accepts boundary temperature values 0 and 2', () => {
    expect(validateExecutionInput('hello', { temperature: 0 }).isOk).toBe(true);
    expect(validateExecutionInput('hello', { temperature: 2 }).isOk).toBe(true);
  });

  it('rejects non-positive maxOutputTokens', () => {
    expect(validateExecutionInput('hello', { maxOutputTokens: 0 }).isErr).toBe(true);
    expect(validateExecutionInput('hello', { maxOutputTokens: -5 }).isErr).toBe(true);
  });

  it('rejects non-positive timeoutMs', () => {
    expect(validateExecutionInput('hello', { timeoutMs: 0 }).isErr).toBe(true);
    expect(validateExecutionInput('hello', { timeoutMs: -1 }).isErr).toBe(true);
  });
});

describe('validateStageConfig', () => {
  it('accepts a valid stage config', () => {
    const result = validateStageConfig('recon', {
      type: 'gemini',
      model: 'gemini-1.5-pro',
    });

    expect(result.isOk).toBe(true);
  });

  it('rejects a missing type', () => {
    const result = validateStageConfig('recon', {
      model: 'gemini-1.5-pro',
    } as never);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(ProviderExecutionError);
    }
  });

  it('rejects an unrecognized type', () => {
    const result = validateStageConfig('recon', {
      type: 'bedrock',
      model: 'some-model',
    } as never);

    expect(result.isErr).toBe(true);
  });

  it('rejects an empty model', () => {
    const result = validateStageConfig('recon', {
      type: 'gemini',
      model: '',
    });

    expect(result.isErr).toBe(true);
  });

  it('rejects a whitespace-only model', () => {
    const result = validateStageConfig('recon', {
      type: 'gemini',
      model: '   ',
    });

    expect(result.isErr).toBe(true);
  });

  it('includes stageName on the returned error', () => {
    const result = validateStageConfig('recon', {
      type: 'gemini',
      model: '',
    });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.stageName).toBe('recon');
    }
  });
});
