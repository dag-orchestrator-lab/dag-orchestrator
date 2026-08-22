import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveConfiguration,
  ProviderTypeSchema,
  StageProviderConfigSchema,
  ConfigSchema,
  loadConfig,
} from './config.js';

describe('resolveConfiguration', () => {
  const originalRoot = process.env.DAG_WORKSPACE_ROOT;

  afterEach(() => {
    if (originalRoot === undefined) {
      delete process.env.DAG_WORKSPACE_ROOT;
    } else {
      process.env.DAG_WORKSPACE_ROOT = originalRoot;
    }
  });

  it('derives paths from process.cwd() when DAG_WORKSPACE_ROOT is unset', () => {
    delete process.env.DAG_WORKSPACE_ROOT;
    const config = resolveConfiguration();
    expect(config.rootDir).toBe(process.cwd());
    expect(config.dagDir).toBe(path.join(process.cwd(), '.dag'));
    expect(config.featuresDir).toBe(path.join(process.cwd(), '.dag', 'features'));
    expect(config.archivedDir).toBe(path.join(process.cwd(), '.dag', 'archive'));
  });

  it('derives paths from DAG_WORKSPACE_ROOT when set', () => {
    process.env.DAG_WORKSPACE_ROOT = '/tmp/some-root';
    const config = resolveConfiguration();
    expect(config.rootDir).toBe('/tmp/some-root');
    expect(config.dagDir).toBe(path.join('/tmp/some-root', '.dag'));
    expect(config.featuresDir).toBe(path.join('/tmp/some-root', '.dag', 'features'));
    expect(config.archivedDir).toBe(path.join('/tmp/some-root', '.dag', 'archive'));
  });
});

describe('ProviderTypeSchema', () => {
  it('accepts all four supported provider types', () => {
    for (const type of ['gemini', 'claude-cli', 'openai', 'ollama']) {
      expect(ProviderTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it('rejects an unsupported provider type', () => {
    expect(ProviderTypeSchema.safeParse('bedrock').success).toBe(false);
  });
});

describe('StageProviderConfigSchema', () => {
  it('accepts a minimal valid stage provider config', () => {
    const result = StageProviderConfigSchema.safeParse({ type: 'gemini', model: 'gemini-1.5-pro' });
    expect(result.success).toBe(true);
  });

  it('accepts optional fields when present', () => {
    const result = StageProviderConfigSchema.safeParse({
      type: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      endpoint: 'https://api.openai.com/v1',
      cliPath: '/usr/local/bin/claude',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing model', () => {
    const result = StageProviderConfigSchema.safeParse({ type: 'gemini', model: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid endpoint URL', () => {
    const result = StageProviderConfigSchema.safeParse({
      type: 'ollama',
      model: 'qwen2.5-coder',
      endpoint: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields instead of silently stripping them', () => {
    const result = StageProviderConfigSchema.safeParse({
      type: 'gemini',
      model: 'gemini-1.5-pro',
      temperture: 0.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('ProviderTypeSchema legacy provider name normalization', () => {
  it('maps "claude" to "claude-cli"', () => {
    const result = ProviderTypeSchema.safeParse('claude');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('claude-cli');
    }
  });

  it('maps "google" to "gemini"', () => {
    const result = ProviderTypeSchema.safeParse('google');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('gemini');
    }
  });
});

describe('loadConfig', () => {
  let tmpRootDir: string;

  afterEach(() => {
    fs.rmSync(tmpRootDir, { recursive: true, force: true });
  });

  it('resolves a legacy "claude" provider type to "claude-cli"', () => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-config-test-'));
    fs.mkdirSync(path.join(tmpRootDir, '.dag'));
    fs.writeFileSync(
      path.join(tmpRootDir, '.dag', 'config.json'),
      JSON.stringify({
        stages: {
          contracts: { provider: { type: 'claude', model: 'claude-sonnet-5' } },
        },
      })
    );

    const config = loadConfig(tmpRootDir);
    expect(config.stages?.contracts?.provider?.type).toBe('claude-cli');
  });

  it('returns an empty parsed config when no config file exists', () => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-config-test-'));
    const config = loadConfig(tmpRootDir);
    expect(config).toEqual({});
  });

  it('throws at load time for a malformed stages[].provider fixture', () => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-config-test-'));
    fs.mkdirSync(path.join(tmpRootDir, '.dag'));
    fs.writeFileSync(
      path.join(tmpRootDir, '.dag', 'config.json'),
      JSON.stringify({
        stages: {
          recon: { provider: { type: 'gemini', model: 'gemini-1.5-pro', temperture: 0.5 } },
        },
      })
    );

    expect(() => loadConfig(tmpRootDir)).toThrow();
  });
});

describe('ConfigSchema (additive expand-phase)', () => {
  it('parses the pre-existing .dag/config.json fixture shape unmodified', () => {
    const fixture = {
      SPECS_DIR: '.dag/features',
      DEFAULT_HARNESS: 'standalone',
      DEFAULT_PROVIDER_PRESET: 'hybrid',
      STACKED_BASE_BRANCH: 'v0.2',
      ACTIVE_BRANCH: 'ts-port-phase-2',
    };
    const result = ConfigSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('parses an empty object since all fields are optional', () => {
    expect(ConfigSchema.safeParse({}).success).toBe(true);
  });

  it('accepts an optional stages[].provider field when present', () => {
    const result = ConfigSchema.safeParse({
      stages: {
        recon: { provider: { type: 'gemini', model: 'gemini-1.5-pro' } },
        contracts: {},
      },
    });
    expect(result.success).toBe(true);
  });

  it('passes through unknown legacy fields via .passthrough()', () => {
    const result = ConfigSchema.safeParse({ SOME_FUTURE_FIELD: 'value' });
    expect(result.success).toBe(true);
  });
});
