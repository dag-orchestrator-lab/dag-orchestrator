import { describe, it, expect } from 'vitest';
import { DomainError } from '../../common/errors.js';
import { ProviderExecutionError } from './provider-execution-error.js';

describe('ProviderExecutionError', () => {
  it('is a DomainError', () => {
    const err = new ProviderExecutionError('boom');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to ProviderExecutionError', () => {
    const err = new ProviderExecutionError('boom');
    expect(err.name).toBe('ProviderExecutionError');
  });

  it('carries optional stageName and providerType fields', () => {
    const err = new ProviderExecutionError('boom', { stageName: 'recon', providerType: 'gemini' });
    expect(err.stageName).toBe('recon');
    expect(err.providerType).toBe('gemini');
  });

  it('defaults stageName and providerType to undefined', () => {
    const err = new ProviderExecutionError('boom');
    expect(err.stageName).toBeUndefined();
    expect(err.providerType).toBeUndefined();
  });

  it('preserves the message', () => {
    const err = new ProviderExecutionError('missing api key');
    expect(err.message).toBe('missing api key');
  });
});
