import { describe, expect, it } from 'vitest';
import { GateApproval } from './gate-approval.js';

/**
 * T-6: confirms the existing `GateApproval` value object needs no change to
 * represent a Gate 4 (post-implementation) approval. `GateApproval` has no
 * built-in concept of a gate *number*; a gate is identified generically by
 * `gateName` (a string), matched against `PipelineStage.requiredGates`. The
 * caller (pipeline advancer) is responsible for using a distinct name such
 * as `'gate-4'` to represent Gate 4, the same way earlier gates already do.
 */
describe('GateApproval (Gate 4 reuse)', () => {
  it('creates a frozen approval for a gate-4 style gate name', () => {
    const result = GateApproval.create({
      gateName: 'gate-4',
      approver: 'larzthimotyp@gmail.com',
      approvedAt: '2026-08-30T00:00:00.000Z',
    });

    expect(result.isOk).toBe(true);
    if (!result.isOk) return;

    expect(result.value.gateName).toBe('gate-4');
    expect(result.value.approver).toBe('larzthimotyp@gmail.com');
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it('carries optional feedback metadata without requiring schema changes', () => {
    const result = GateApproval.create({
      gateName: 'gate-4',
      approver: 'larzthimotyp@gmail.com',
      approvedAt: '2026-08-30T00:00:00.000Z',
      metadata: { feedback: 'please tighten the retry bound' },
    });

    expect(result.isOk).toBe(true);
    if (!result.isOk) return;

    expect(result.value.metadata.feedback).toBe('please tighten the retry bound');
    expect(Object.isFrozen(result.value.metadata)).toBe(true);
  });

  it('rejects an empty gateName, unchanged validation behavior', () => {
    const result = GateApproval.create({
      gateName: '',
      approver: 'larzthimotyp@gmail.com',
      approvedAt: '2026-08-30T00:00:00.000Z',
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) return;
    expect(result.error.kind).toBe('ValidationError');
    if (result.error.kind !== 'ValidationError') return;
    expect(result.error.field).toBe('gateName');
  });

  it('rejects an empty approver, unchanged validation behavior', () => {
    const result = GateApproval.create({
      gateName: 'gate-4',
      approver: '',
      approvedAt: '2026-08-30T00:00:00.000Z',
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) return;
    expect(result.error.kind).toBe('ValidationError');
    if (result.error.kind !== 'ValidationError') return;
    expect(result.error.field).toBe('approver');
  });

  it('rejects an empty approvedAt, unchanged validation behavior', () => {
    const result = GateApproval.create({
      gateName: 'gate-4',
      approver: 'larzthimotyp@gmail.com',
      approvedAt: '',
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) return;
    expect(result.error.kind).toBe('ValidationError');
    if (result.error.kind !== 'ValidationError') return;
    expect(result.error.field).toBe('approvedAt');
  });
});
