import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIAdapter } from './openai-adapter.js';
import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';

describe('OpenAIAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the message content on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hello world' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAIAdapter({ apiKey: 'test-key', model: 'gpt-4o' });
    const result = await adapter.execute('prompt text', 'system text');

    expect(result).toBe('Hello world');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toEqual([
      { role: 'system', content: 'system text' },
      { role: 'user', content: 'prompt text' },
    ]);
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe(
      'Bearer test-key'
    );
  });

  it('uses the configured endpoint when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAIAdapter({
      apiKey: 'test-key',
      model: 'gpt-4o',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
    });
    await adapter.execute('prompt');

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.deepseek.com/v1/chat/completions');
  });

  it('throws ProviderExecutionError when apiKey is missing', async () => {
    const adapter = new OpenAIAdapter({ apiKey: '', model: 'gpt-4o' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });

  it('throws ProviderExecutionError on a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAIAdapter({ apiKey: 'test-key', model: 'gpt-4o' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });

  it('never throws a bare Error on transport failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAIAdapter({ apiKey: 'test-key', model: 'gpt-4o' });

    try {
      await adapter.execute('prompt');
      throw new Error('expected execute to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderExecutionError);
    }
  });

  it('throws ProviderExecutionError when the response has no content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OpenAIAdapter({ apiKey: 'test-key', model: 'gpt-4o' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });
});
