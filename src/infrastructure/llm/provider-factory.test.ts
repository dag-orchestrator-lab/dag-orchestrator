import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProviderFactory } from './provider-factory.js';
import { GeminiAdapter } from './adapters/gemini-adapter.js';
import { ClaudeCliAdapter } from './adapters/claude-cli-adapter.js';
import { OpenAIAdapter } from './adapters/openai-adapter.js';
import { OllamaAdapter } from './adapters/ollama-adapter.js';

describe('ProviderFactory', () => {
  let tmpRootDir: string;
  const originalRoot = process.env.DAG_WORKSPACE_ROOT;
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  function writeConfig(stages: Record<string, unknown>): void {
    fs.mkdirSync(path.join(tmpRootDir, '.dag'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRootDir, '.dag', 'config.json'),
      JSON.stringify({ stages })
    );
  }

  beforeEach(() => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-provider-factory-test-'));
    process.env.DAG_WORKSPACE_ROOT = tmpRootDir;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    fs.rmSync(tmpRootDir, { recursive: true, force: true });
    if (originalRoot === undefined) {
      delete process.env.DAG_WORKSPACE_ROOT;
    } else {
      process.env.DAG_WORKSPACE_ROOT = originalRoot;
    }
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  });

  it('returns the same adapter instance for identical resolved config across calls', () => {
    writeConfig({ recon: { provider: { type: 'gemini', model: 'gemini-1.5-pro', apiKey: 'k1' } } });

    const factory = new ProviderFactory();
    const first = factory.getAdapter('recon');
    const second = factory.getAdapter('recon');

    expect(second.instance).toBe(first.instance);
  });

  it('returns a distinct instance when the model differs', () => {
    writeConfig({
      recon: { provider: { type: 'gemini', model: 'gemini-1.5-pro', apiKey: 'k1' } },
      other: { provider: { type: 'gemini', model: 'gemini-1.5-flash', apiKey: 'k1' } },
    });

    const factory = new ProviderFactory();
    const first = factory.getAdapter('recon');
    const second = factory.getAdapter('other');

    expect(second.instance).not.toBe(first.instance);
  });

  it('returns a distinct instance when the apiKey differs', () => {
    writeConfig({
      recon: { provider: { type: 'gemini', model: 'gemini-1.5-pro', apiKey: 'k1' } },
      other: { provider: { type: 'gemini', model: 'gemini-1.5-pro', apiKey: 'k2' } },
    });

    const factory = new ProviderFactory();
    const first = factory.getAdapter('recon');
    const second = factory.getAdapter('other');

    expect(second.instance).not.toBe(first.instance);
  });

  it('returns a distinct instance when the provider type differs', () => {
    writeConfig({
      recon: { provider: { type: 'gemini', model: 'shared-model', apiKey: 'k1' } },
      other: { provider: { type: 'openai', model: 'shared-model', apiKey: 'k1' } },
    });

    const factory = new ProviderFactory();
    const first = factory.getAdapter('recon');
    const second = factory.getAdapter('other');

    expect(second.instance).not.toBe(first.instance);
  });

  it('merges customConfig over the stage config and reuses the cache for the resolved result', () => {
    writeConfig({ recon: { provider: { type: 'gemini', model: 'gemini-1.5-pro', apiKey: 'k1' } } });

    const factory = new ProviderFactory();
    const first = factory.getAdapter('recon', { model: 'gemini-1.5-flash' });
    const second = factory.getAdapter('recon', { model: 'gemini-1.5-flash' });
    const third = factory.getAdapter('recon');

    expect(second.instance).toBe(first.instance);
    expect(third.instance).not.toBe(first.instance);
    expect(first.model).toBe('gemini-1.5-flash');
  });

  it('resolves env fallback apiKey before computing the cache key', () => {
    writeConfig({ recon: { provider: { type: 'gemini', model: 'gemini-1.5-pro' } } });
    process.env.GEMINI_API_KEY = 'env-secret';

    const factory = new ProviderFactory();
    const handle = factory.getAdapter('recon');

    expect(handle.name).toBe('gemini');
    expect(handle.type).toBe('gemini');
    expect(typeof handle.instance.execute).toBe('function');
  });

  it('throws a ProviderExecutionError when the stage has no provider config', () => {
    writeConfig({ recon: {} });

    const factory = new ProviderFactory();

    expect(() => factory.getAdapter('recon')).toThrow();
  });

  it('instantiates the matching adapter class for each provider type', () => {
    writeConfig({
      gemini: { provider: { type: 'gemini', model: 'gemini-1.5-pro', apiKey: 'k1' } },
      'claude-cli': { provider: { type: 'claude-cli', model: 'claude', cliPath: 'claude' } },
      openai: { provider: { type: 'openai', model: 'gpt-4o', apiKey: 'k1' } },
      ollama: { provider: { type: 'ollama', model: 'llama3' } },
    });

    const factory = new ProviderFactory();

    expect(factory.getAdapter('gemini').instance).toBeInstanceOf(GeminiAdapter);
    expect(factory.getAdapter('claude-cli').instance).toBeInstanceOf(ClaudeCliAdapter);
    expect(factory.getAdapter('openai').instance).toBeInstanceOf(OpenAIAdapter);
    expect(factory.getAdapter('ollama').instance).toBeInstanceOf(OllamaAdapter);
  });
});
