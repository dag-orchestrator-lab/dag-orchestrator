import { describe, expect, it } from 'vitest';
import { validateAgainstJsonSchema, type JsonSchemaLite } from './json-schema-lite.js';

const COMMAND_SCHEMA: JsonSchemaLite = {
  type: 'object',
  properties: {
    executable: { type: 'string' },
    args: { type: 'array', items: { type: 'string' } },
  },
  required: ['executable', 'args'],
};

describe('validateAgainstJsonSchema', () => {
  it('returns no errors for conforming data', () => {
    const errors = validateAgainstJsonSchema(COMMAND_SCHEMA, { executable: 'npx', args: ['tsc'] });

    expect(errors).toEqual([]);
  });

  it('reports missing required properties', () => {
    const errors = validateAgainstJsonSchema(COMMAND_SCHEMA, { executable: 'npx' });

    expect(errors).toEqual(['$.args: missing required property']);
  });

  it('reports a type mismatch on a nested array item', () => {
    const errors = validateAgainstJsonSchema(COMMAND_SCHEMA, { executable: 'npx', args: ['tsc', 42] });

    expect(errors).toEqual(['$.args[1]: expected string']);
  });

  it('reports when the root value is not an object', () => {
    const errors = validateAgainstJsonSchema(COMMAND_SCHEMA, 'not-an-object');

    expect(errors).toEqual(['$: expected object']);
  });
});
