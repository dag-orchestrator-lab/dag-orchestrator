import { describe, it, expect, vi } from 'vitest';
import { ExecuteStagePromptUseCase } from './execute-stage-prompt-use-case.js';
import { ProviderExecutionError } from '../../domain/llm/errors/provider-execution-error.js';
import type { ProviderFactoryPort } from '../../domain/llm/ports/provider-factory-port.js';
import type { ResolvedProviderHandle } from '../../domain/llm/types/resolved-provider-handle.js';

function createHandle(execute: (...args: unknown[]) => Promise<string>): ResolvedProviderHandle {
  return {
    name: 'gemini',
    model: 'gemini-1.5-pro',
    type: 'gemini',
    instance: { execute },
  };
}

describe('ExecuteStagePromptUseCase', () => {
  it('returns err(ProviderExecutionError) for a whitespace-only prompt without invoking the adapter', async () => {
    const executeSpy = vi.fn();
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => createHandle(executeSpy)),
    };
    const useCase = new ExecuteStagePromptUseCase(factory);

    const result = await useCase.execute('recon', '   ');

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(ProviderExecutionError);
    }
    expect(factory.getAdapter).not.toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('returns err(ProviderExecutionError) for a negative temperature without invoking the adapter', async () => {
    const executeSpy = vi.fn();
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => createHandle(executeSpy)),
    };
    const useCase = new ExecuteStagePromptUseCase(factory);

    const result = await useCase.execute('recon', 'Summarize this repo', undefined, {
      temperature: -1,
    });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(ProviderExecutionError);
    }
    expect(factory.getAdapter).not.toHaveBeenCalled();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('coerces a non-string prompt to string before validation and execution', async () => {
    const executeSpy = vi.fn().mockResolvedValue('ok');
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => createHandle(executeSpy)),
    };
    const useCase = new ExecuteStagePromptUseCase(factory);

    const result = await useCase.execute('recon', 42 as unknown as string);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe('ok');
    }
    expect(executeSpy).toHaveBeenCalledWith('42', undefined, undefined);
  });

  it('resolves the adapter and returns its execution result on valid input', async () => {
    const executeSpy = vi.fn().mockResolvedValue('response text');
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => createHandle(executeSpy)),
    };
    const useCase = new ExecuteStagePromptUseCase(factory);

    const result = await useCase.execute('recon', 'Summarize this repo', 'You are a recon agent.', {
      temperature: 0.5,
    });

    expect(factory.getAdapter).toHaveBeenCalledWith('recon', undefined);
    expect(executeSpy).toHaveBeenCalledWith('Summarize this repo', 'You are a recon agent.', {
      temperature: 0.5,
    });
    expect(result).toEqual({ isOk: true, isErr: false, value: 'response text' });
  });

  it('propagates a ProviderExecutionError thrown while resolving the adapter', async () => {
    const factory: ProviderFactoryPort = {
      getAdapter: vi.fn(() => {
        throw new ProviderExecutionError('Unrecognized provider type', { stageName: 'recon' });
      }),
    };
    const useCase = new ExecuteStagePromptUseCase(factory);

    const result = await useCase.execute('recon', 'Summarize this repo');

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(ProviderExecutionError);
      expect(result.error.message).toBe('Unrecognized provider type');
    }
  });
});
