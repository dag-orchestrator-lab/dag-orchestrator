import { describe, it, expect, vi } from 'vitest';
import { GetProviderForStageUseCase } from './get-provider-for-stage-use-case.js';
import { ProviderExecutionError } from '../../domain/llm/errors/provider-execution-error.js';
import type { ProviderFactoryPort } from '../../domain/llm/ports/provider-factory-port.js';
import type { ResolvedProviderHandle } from '../../domain/llm/types/resolved-provider-handle.js';

function createHandle(): ResolvedProviderHandle {
  return {
    name: 'gemini',
    model: 'gemini-1.5-pro',
    type: 'gemini',
    instance: { execute: vi.fn() },
  };
}

describe('GetProviderForStageUseCase', () => {
  it('returns ok(ResolvedProviderHandle) when the factory resolves an adapter', () => {
    const handle = createHandle();
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => handle),
    };
    const useCase = new GetProviderForStageUseCase(factory);

    const result = useCase.execute('recon');

    expect(factory.getAdapter).toHaveBeenCalledWith('recon', undefined);
    expect(result).toEqual({ isOk: true, isErr: false, value: handle });
  });

  it('passes customConfig through to the factory', () => {
    const handle = createHandle();
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => handle),
    };
    const useCase = new GetProviderForStageUseCase(factory);

    useCase.execute('recon', { model: 'gemini-2.0-flash' });

    expect(factory.getAdapter).toHaveBeenCalledWith('recon', { model: 'gemini-2.0-flash' });
  });

  it('returns err(ProviderExecutionError) when the factory throws a ProviderExecutionError', () => {
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => {
        throw new ProviderExecutionError('Unrecognized provider type', { stageName: 'recon' });
      }),
    };
    const useCase = new GetProviderForStageUseCase(factory);

    const result = useCase.execute('recon');

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(ProviderExecutionError);
      expect(result.error.message).toBe('Unrecognized provider type');
    }
  });

  it('wraps a non-ProviderExecutionError thrown by the factory', () => {
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    const useCase = new GetProviderForStageUseCase(factory);

    const result = useCase.execute('recon');

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(ProviderExecutionError);
      expect(result.error.message).toBe('boom');
    }
  });
});
