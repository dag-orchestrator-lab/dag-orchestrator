import { describe, expect, it } from 'vitest';
import { ContractAddendum } from './contract-addendum.js';

describe('ContractAddendum', () => {
  it('stores its constructor fields', () => {
    const createdAt = new Date('2026-08-30T00:00:00.000Z');
    const addendum = new ContractAddendum('feature-1', 1, 'addendum content', createdAt);

    expect(addendum.featureId).toBe('feature-1');
    expect(addendum.addendumSequence).toBe(1);
    expect(addendum.content).toBe('addendum content');
    expect(addendum.createdAt).toEqual(createdAt);
  });

  it('computes filePath from addendumSequence', () => {
    const addendum = new ContractAddendum('feature-1', 3, 'content', new Date());

    expect(addendum.filePath).toBe('contract-addendum-3.md');
  });

  it('produces distinct, independently-immutable objects for the same addendumSequence', () => {
    const createdAt = new Date('2026-08-30T00:00:00.000Z');
    const first = new ContractAddendum('feature-1', 2, 'first content', createdAt);
    const second = new ContractAddendum('feature-1', 2, 'second content', createdAt);

    expect(first).not.toBe(second);
    expect(first.content).toBe('first content');
    expect(second.content).toBe('second content');

    createdAt.setFullYear(1999);
    expect(first.createdAt.getFullYear()).not.toBe(1999);
    expect(second.createdAt.getFullYear()).not.toBe(1999);
  });
});
