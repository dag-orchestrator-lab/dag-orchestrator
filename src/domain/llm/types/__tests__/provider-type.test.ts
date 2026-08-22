import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_PROVIDER_TYPES,
  isProviderType,
} from '../provider-type.js';

describe('isProviderType', () => {
  it('returns true for each supported provider type', () => {
    for (const type of SUPPORTED_PROVIDER_TYPES) {
      expect(isProviderType(type)).toBe(true);
    }
  });

  it('returns true for ollama', () => {
    expect(isProviderType('ollama')).toBe(true);
  });

  it('returns false for an unsupported provider type', () => {
    expect(isProviderType('bedrock')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isProviderType(undefined)).toBe(false);
    expect(isProviderType(null)).toBe(false);
    expect(isProviderType(42)).toBe(false);
    expect(isProviderType({})).toBe(false);
  });
});
