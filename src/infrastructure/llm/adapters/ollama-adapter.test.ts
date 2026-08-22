import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaAdapter } from './ollama-adapter.js';
import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';

describe('OllamaAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the default endpoint when none is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: 'Hello world' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OllamaAdapter({ model: 'llama3' });
    const result = await adapter.execute('prompt text', 'system text');

    expect(result).toBe('Hello world');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:11434/api/generate');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('llama3');
    expect(body.prompt).toBe('prompt text');
    expect(body.system).toBe('system text');
    expect(body.stream).toBe(false);
  });

  it('uses the configured endpoint when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OllamaAdapter({
      model: 'llama3',
      endpoint: 'http://remote-host:11434',
    });
    await adapter.execute('prompt');

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://remote-host:11434/api/generate');
  });

  it('throws ProviderExecutionError on a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OllamaAdapter({ model: 'llama3' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });

  it('never throws a bare Error on transport failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OllamaAdapter({ model: 'llama3' });

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
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OllamaAdapter({ model: 'llama3' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });

  it('throws ProviderExecutionError when the response body is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new OllamaAdapter({ model: 'llama3' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });
});
