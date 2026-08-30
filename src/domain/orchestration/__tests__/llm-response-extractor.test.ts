import { describe, expect, it } from 'vitest';
import { extractJson, extractXmlBlock } from '../utils/llm-response-extractor.js';
import { LlmResponseExtractionError } from '../errors/llm-response-extraction-error.js';

interface SampleShape {
  readonly verdict: string;
  readonly count: number;
}

describe('extractJson', () => {
  it('parses a raw JSON object with no surrounding text', () => {
    const result = extractJson<SampleShape>('{"verdict":"APPROVED","count":2}');

    expect(result).toEqual({ verdict: 'APPROVED', count: 2 });
  });

  it('strips a ```json markdown fence around the payload', () => {
    const raw = '```json\n{"verdict":"APPROVED","count":2}\n```';

    const result = extractJson<SampleShape>(raw);

    expect(result).toEqual({ verdict: 'APPROVED', count: 2 });
  });

  it('strips a bare ``` fence with no language tag', () => {
    const raw = '```\n{"verdict":"REJECTED","count":0}\n```';

    const result = extractJson<SampleShape>(raw);

    expect(result).toEqual({ verdict: 'REJECTED', count: 0 });
  });

  it('ignores conversational filler surrounding the JSON payload', () => {
    const raw = "Sure, here's the verdict you asked for:\n\n{\"verdict\":\"APPROVED\",\"count\":5}\n\nLet me know if you need anything else.";

    const result = extractJson<SampleShape>(raw);

    expect(result).toEqual({ verdict: 'APPROVED', count: 5 });
  });

  it('handles nested objects and braces inside string values', () => {
    const raw = 'Here you go: {"verdict":"APPROVED","count":1,"nested":{"note":"contains a { brace }"}}';

    const result = extractJson<{ verdict: string; count: number; nested: { note: string } }>(raw);

    expect(result.nested.note).toBe('contains a { brace }');
  });

  it('extracts a JSON array payload', () => {
    const raw = 'result: [1, 2, 3]';

    const result = extractJson<number[]>(raw);

    expect(result).toEqual([1, 2, 3]);
  });

  it('when multiple JSON blocks are present, extracts the first one', () => {
    const raw = 'first {"verdict":"APPROVED","count":1} then {"verdict":"REJECTED","count":2}';

    const result = extractJson<SampleShape>(raw);

    expect(result).toEqual({ verdict: 'APPROVED', count: 1 });
  });

  it('throws LlmResponseExtractionError when no JSON is present', () => {
    expect(() => extractJson('just plain conversational text, no payload here')).toThrow(
      LlmResponseExtractionError
    );
  });

  it('throws LlmResponseExtractionError with MALFORMED_JSON code for unparsable braces', () => {
    expect.assertions(2);
    try {
      extractJson('{"verdict": "APPROVED", "count": }');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmResponseExtractionError);
      expect((error as LlmResponseExtractionError).code).toBe('MALFORMED_JSON');
    }
  });
});

describe('extractXmlBlock', () => {
  it('extracts trimmed content between matching tags', () => {
    const raw = 'preamble <plan>\n  do the thing\n</plan> trailer';

    const result = extractXmlBlock(raw, 'plan');

    expect(result).toBe('do the thing');
  });

  it('extracts the first block when multiple tags of the same name are present', () => {
    const raw = '<plan>first</plan> some text <plan>second</plan>';

    const result = extractXmlBlock(raw, 'plan');

    expect(result).toBe('first');
  });

  it('supports tags with attributes on the opening tag', () => {
    const raw = '<plan lang="en">attributed content</plan>';

    const result = extractXmlBlock(raw, 'plan');

    expect(result).toBe('attributed content');
  });

  it('throws LlmResponseExtractionError when the tag is missing', () => {
    expect.assertions(2);
    try {
      extractXmlBlock('no tags here', 'plan');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmResponseExtractionError);
      expect((error as LlmResponseExtractionError).code).toBe('TAG_NOT_FOUND');
    }
  });

  it('throws LlmResponseExtractionError when only the opening tag is present', () => {
    expect(() => extractXmlBlock('<plan>unclosed', 'plan')).toThrow(LlmResponseExtractionError);
  });
});
