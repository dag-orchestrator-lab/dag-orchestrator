import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CLAUDE_CLI_PATH,
  DEFAULT_OLLAMA_ENDPOINT,
  resolveStageEnv,
} from './resolve-stage-env.js';

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'OLLAMA_ENDPOINT',
  'CLAUDE_CLI_PATH',
] as const;

describe('resolveStageEnv', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('falls back apiKey to GEMINI_API_KEY for gemini stages', () => {
    process.env.GEMINI_API_KEY = 'gemini-secret';

    const resolved = resolveStageEnv({ type: 'gemini', model: 'gemini-1.5-pro' });

    expect(resolved.apiKey).toBe('gemini-secret');
  });

  it('falls back apiKey to OPENAI_API_KEY for openai stages', () => {
    process.env.OPENAI_API_KEY = 'openai-secret';

    const resolved = resolveStageEnv({ type: 'openai', model: 'gpt-4o' });

    expect(resolved.apiKey).toBe('openai-secret');
  });

  it('does not override an apiKey already present in the stage config', () => {
    process.env.GEMINI_API_KEY = 'gemini-secret';

    const resolved = resolveStageEnv({
      type: 'gemini',
      model: 'gemini-1.5-pro',
      apiKey: 'explicit-key',
    });

    expect(resolved.apiKey).toBe('explicit-key');
  });

  it('leaves apiKey undefined for provider types without an env fallback', () => {
    const resolved = resolveStageEnv({ type: 'claude-cli', model: 'claude' });

    expect(resolved.apiKey).toBeUndefined();
  });

  it('falls back endpoint to OLLAMA_ENDPOINT for ollama stages', () => {
    process.env.OLLAMA_ENDPOINT = 'http://custom-host:9000';

    const resolved = resolveStageEnv({ type: 'ollama', model: 'llama3' });

    expect(resolved.endpoint).toBe('http://custom-host:9000');
  });

  it('defaults endpoint to localhost:11434 when OLLAMA_ENDPOINT is unset', () => {
    const resolved = resolveStageEnv({ type: 'ollama', model: 'llama3' });

    expect(resolved.endpoint).toBe(DEFAULT_OLLAMA_ENDPOINT);
  });

  it('does not set endpoint fallback for non-ollama stages', () => {
    const resolved = resolveStageEnv({ type: 'gemini', model: 'gemini-1.5-pro' });

    expect(resolved.endpoint).toBeUndefined();
  });

  it('falls back cliPath to CLAUDE_CLI_PATH for claude-cli stages', () => {
    process.env.CLAUDE_CLI_PATH = '/usr/local/bin/claude';

    const resolved = resolveStageEnv({ type: 'claude-cli', model: 'claude' });

    expect(resolved.cliPath).toBe('/usr/local/bin/claude');
  });

  it('defaults cliPath to "claude" when CLAUDE_CLI_PATH is unset', () => {
    const resolved = resolveStageEnv({ type: 'claude-cli', model: 'claude' });

    expect(resolved.cliPath).toBe(DEFAULT_CLAUDE_CLI_PATH);
  });

  it('does not set cliPath fallback for non-claude-cli stages', () => {
    const resolved = resolveStageEnv({ type: 'openai', model: 'gpt-4o' });

    expect(resolved.cliPath).toBeUndefined();
  });
});
