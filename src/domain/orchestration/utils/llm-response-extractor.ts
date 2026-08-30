import { LlmResponseExtractionError } from '../errors/llm-response-extraction-error.js';

const CODE_FENCE_PATTERN = /```(?:[a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/;

/**
 * Extracts and parses a JSON value embedded in a raw LLM completion, tolerating
 * conversational filler and markdown code fences surrounding the payload.
 * @param raw The raw text completion returned by the LLM.
 * @returns The parsed JSON value, typed as `T`.
 * @throws LlmResponseExtractionError if no JSON payload can be located or parsed.
 */
export function extractJson<T>(raw: string): T {
  const candidates = collectJsonCandidates(raw);

  if (candidates.length === 0) {
    throw new LlmResponseExtractionError('No JSON payload found in LLM response', 'NO_JSON_FOUND');
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  throw new LlmResponseExtractionError('LLM response contains malformed JSON', 'MALFORMED_JSON');
}

/**
 * Extracts the trimmed inner content of the first `<tag>...</tag>` block in a raw LLM completion.
 * @param raw The raw text completion returned by the LLM.
 * @param tag The XML/pseudo-XML tag name to locate (without angle brackets).
 * @returns The trimmed content between the opening and closing tags.
 * @throws LlmResponseExtractionError if the tag is not present in the response.
 */
export function extractXmlBlock(raw: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapedTag}>`);
  const match = pattern.exec(raw);

  if (!match) {
    throw new LlmResponseExtractionError(`No <${tag}> block found in LLM response`, 'TAG_NOT_FOUND');
  }

  return match[1].trim();
}

/** Builds an ordered list of JSON-parse candidates: fenced blocks first, then the widest balanced brace/bracket span. */
function collectJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const fenceMatch = CODE_FENCE_PATTERN.exec(raw);
  if (fenceMatch) {
    candidates.push(fenceMatch[1].trim());
  }

  const balancedSpan = findBalancedJsonSpan(raw);
  if (balancedSpan) {
    candidates.push(balancedSpan);
  }

  return candidates;
}

/** Scans for the first balanced top-level `{...}` or `[...]` span, respecting nested brackets and string literals. */
function findBalancedJsonSpan(raw: string): string | undefined {
  const openers = new Set(['{', '[']);
  const closers: Record<string, string> = { '{': '}', '[': ']' };

  for (let start = 0; start < raw.length; start += 1) {
    const openChar = raw[start];
    if (!openers.has(openChar)) {
      continue;
    }

    const closeChar = closers[openChar];
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === openChar) {
        depth += 1;
      } else if (char === closeChar) {
        depth -= 1;
        if (depth === 0) {
          return raw.slice(start, index + 1);
        }
      }
    }
  }

  return undefined;
}
