import { describe, it, expect } from 'vitest';
import { DomainError } from '../../common/errors.js';
import { ProviderExecutionError } from './provider-execution-error.js';
import { LlmNetworkTimeoutError } from './llm-network-timeout-error.js';

describe('LlmNetworkTimeoutError', () => {
  it('is a ProviderExecutionError and a DomainError', () => {
    const err = new LlmNetworkTimeoutError('timed out after 120000ms');
    expect(err).toBeInstanceOf(ProviderExecutionError);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('sets name to LlmNetworkTimeoutError', () => {
    const err = new LlmNetworkTimeoutError('timed out');
    expect(err.name).toBe('LlmNetworkTimeoutError');
  });

  it('carries optional stageName and providerType fields', () => {
    const err = new LlmNetworkTimeoutError('timed out', { stageName: 'recon', providerType: 'claude-cli' });
    expect(err.stageName).toBe('recon');
    expect(err.providerType).toBe('claude-cli');
  });

  it('preserves the message', () => {
    const err = new LlmNetworkTimeoutError('Claude CLI timed out after 120000ms');
    expect(err.message).toBe('Claude CLI timed out after 120000ms');
  });
});
