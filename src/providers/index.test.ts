import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getProviderForStage, executeStagePrompt } from './index.js';
import { DomainError } from '../domain/common/errors.js';

describe('providers ACL shim', () => {
  let tmpRootDir: string;
  const originalRoot = process.env.DAG_WORKSPACE_ROOT;
  const originalFetch = global.fetch;

  function writeConfig(stages: Record<string, unknown>): void {
    fs.mkdirSync(path.join(tmpRootDir, '.dag'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRootDir, '.dag', 'config.json'),
      JSON.stringify({ stages })
    );
  }

  beforeEach(() => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-providers-acl-test-'));
    process.env.DAG_WORKSPACE_ROOT = tmpRootDir;
  });

  afterEach(() => {
    fs.rmSync(tmpRootDir, { recursive: true, force: true });
    if (originalRoot === undefined) {
      delete process.env.DAG_WORKSPACE_ROOT;
    } else {
      process.env.DAG_WORKSPACE_ROOT = originalRoot;
    }
    global.fetch = originalFetch;
  });

  it('getProviderForStage returns the legacy-shaped handle with all four fields', () => {
    writeConfig({ recon: { provider: { type: 'ollama', model: 'llama3' } } });

    const provider = getProviderForStage('recon');

    expect(provider.name).toBe('ollama');
    expect(provider.model).toBe('llama3');
    expect(provider.type).toBe('ollama');
    expect(typeof provider.instance.execute).toBe('function');
  });

  it('executeStagePrompt resolves to a string', async () => {
    writeConfig({ recon: { provider: { type: 'ollama', model: 'llama3' } } });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'hello from ollama' }),
    }) as unknown as typeof fetch;

    const result = await executeStagePrompt('recon', 'summarize this repo');

    expect(typeof result).toBe('string');
    expect(result).toBe('hello from ollama');
  });

  it('surfaces a thrown ProviderExecutionError as a plain Error, never a DomainError', () => {
    writeConfig({ recon: {} });

    let caught: unknown;
    try {
      getProviderForStage('recon');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught instanceof DomainError).toBe(false);
  });

  it('surfaces async ProviderExecutionError from executeStagePrompt as a plain Error', async () => {
    writeConfig({ recon: {} });

    await expect(executeStagePrompt('recon', 'hello')).rejects.toSatisfy((error: unknown) => {
      return error instanceof Error && !(error instanceof DomainError);
    });
  });
});
