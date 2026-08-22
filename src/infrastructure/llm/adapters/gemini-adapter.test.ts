import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiAdapter } from './gemini-adapter.js';
import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';

describe('GeminiAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the joined candidate text on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: 'Hello ' }, { text: 'world' }] } },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GeminiAdapter({ apiKey: 'test-key', model: 'gemini-1.5-pro' });
    const result = await adapter.execute('prompt text', 'system text');

    expect(result).toBe('Hello world');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('gemini-1.5-pro');
    expect(String(url)).toContain('test-key');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.contents[0].parts[0].text).toBe('prompt text');
    expect(body.systemInstruction.parts[0].text).toBe('system text');
  });

  it('throws ProviderExecutionError when apiKey is missing', async () => {
    const adapter = new GeminiAdapter({ apiKey: '', model: 'gemini-1.5-pro' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });

  it('throws ProviderExecutionError on a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GeminiAdapter({ apiKey: 'test-key', model: 'gemini-1.5-pro' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });

  it('throws ProviderExecutionError when the candidates array is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GeminiAdapter({ apiKey: 'test-key', model: 'gemini-1.5-pro' });

    await expect(adapter.execute('prompt')).rejects.toBeInstanceOf(ProviderExecutionError);
  });

  it('never throws a bare Error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GeminiAdapter({ apiKey: 'test-key', model: 'gemini-1.5-pro' });

    try {
      await adapter.execute('prompt');
      throw new Error('expected execute to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderExecutionError);
    }
  });
});
