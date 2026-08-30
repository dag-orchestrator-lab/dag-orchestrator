/** Subset of JSON Schema (draft-07) needed to validate `.dag/config.schema.json`: type/properties/required/items. */
export interface JsonSchemaLite {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, JsonSchemaLite>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchemaLite;
}

/**
 * Validates `data` against `schema`, collecting all violations rather than throwing on the first.
 * @param schema - the (subset) JSON Schema to validate against.
 * @param data - the parsed JSON value to check.
 * @returns a list of human-readable violation messages; empty when `data` conforms.
 */
export function validateAgainstJsonSchema(schema: JsonSchemaLite, data: unknown): string[] {
  const errors: string[] = [];
  validateNode(schema, data, '$', errors);
  return errors;
}

function validateNode(schema: JsonSchemaLite, data: unknown, path: string, errors: string[]): void {
  if (schema.type === 'object') {
    validateObjectNode(schema, data, path, errors);
    return;
  }
  if (schema.type === 'array') {
    validateArrayNode(schema, data, path, errors);
    return;
  }
  if (schema.type === 'string' && typeof data !== 'string') {
    errors.push(`${path}: expected string`);
  }
}

function validateObjectNode(schema: JsonSchemaLite, data: unknown, path: string, errors: string[]): void {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push(`${path}: expected object`);
    return;
  }
  const record = data as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (!(key in record)) {
      errors.push(`${path}.${key}: missing required property`);
    }
  }
  const properties = schema.properties ?? {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (key in record) {
      validateNode(propertySchema, record[key], `${path}.${key}`, errors);
    }
  }
}

function validateArrayNode(schema: JsonSchemaLite, data: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(data)) {
    errors.push(`${path}: expected array`);
    return;
  }
  const itemSchema = schema.items;
  if (itemSchema === undefined) {
    return;
  }
  data.forEach((item, index) => validateNode(itemSchema, item, `${path}[${index}]`, errors));
}
