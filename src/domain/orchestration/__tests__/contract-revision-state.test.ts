import { describe, expect, it } from 'vitest';
import { ContractRevisionState } from '../models/contract-revision-state.js';
import type { AgentResult } from '../models/agent-result.js';
import type { ContractFeedbackRecord } from '../models/contract-feedback-record.js';
import { AgentExecutionError } from '../errors/agent-execution-error.js';

const WORKSPACE_SLUG = 'epic-2-agents';

function buildFeedbackRecord(cycle: number): ContractFeedbackRecord {
  return {
    cycle,
    raisedAt: new Date().toISOString(),
    findings: [{ section: 'Ports', issue: 'missing adapter', severity: 'BLOCKER' }],
  };
}

function buildRejectedResult(cycle: number): AgentResult {
  return {
    role: 'skeptic',
    artifactPath: '/tmp/02-contracts.md',
    verdict: 'REJECTED',
    feedback: buildFeedbackRecord(cycle),
  };
}

function buildApprovedResult(): AgentResult {
  return { role: 'skeptic', artifactPath: '/tmp/02-contracts.md', verdict: 'APPROVED' };
}

describe('ContractRevisionState.create', () => {
  it('starts a fresh state at cycle 0, IN_PROGRESS, with no feedback history', () => {
    const state = ContractRevisionState.create(WORKSPACE_SLUG);

    expect(state.currentCycle).toBe(0);
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.feedbackHistory).toEqual([]);
  });
});

describe('ContractRevisionState.reconstruct', () => {
  it('rehydrates a valid gapless feedback history', () => {
    const history = [buildFeedbackRecord(1), buildFeedbackRecord(2)];

    const outcome = ContractRevisionState.reconstruct(WORKSPACE_SLUG, 2, 'IN_PROGRESS', history);

    expect(outcome.isOk).toBe(true);
    if (outcome.isOk) {
      expect(outcome.value.currentCycle).toBe(2);
      expect(outcome.value.feedbackHistory).toEqual(history);
    }
  });

  it('rejects a feedback history with a gap', () => {
    const history = [buildFeedbackRecord(1), buildFeedbackRecord(3)];

    const outcome = ContractRevisionState.reconstruct(WORKSPACE_SLUG, 3, 'IN_PROGRESS', history);

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error).toBeInstanceOf(AgentExecutionError);
    }
  });
});

describe('ContractRevisionState.applySkepticResult', () => {
  it('advances the cycle and appends feedback on REJECTED', () => {
    const state = ContractRevisionState.create(WORKSPACE_SLUG);

    const outcome = state.applySkepticResult(buildRejectedResult(1));

    expect(outcome.isOk).toBe(true);
    expect(state.currentCycle).toBe(1);
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.feedbackHistory).toEqual([buildFeedbackRecord(1)]);
  });

  it('runs REJECTED -> REJECTED -> APPROVED and advances cycle/history correctly', () => {
    const state = ContractRevisionState.create(WORKSPACE_SLUG);

    expect(state.applySkepticResult(buildRejectedResult(1)).isOk).toBe(true);
    expect(state.applySkepticResult(buildRejectedResult(2)).isOk).toBe(true);
    expect(state.currentCycle).toBe(2);
    expect(state.feedbackHistory).toHaveLength(2);

    const approvedOutcome = state.applySkepticResult(buildApprovedResult());

    expect(approvedOutcome.isOk).toBe(true);
    expect(state.status).toBe('APPROVED');
    expect(state.currentCycle).toBe(2);
    expect(state.feedbackHistory).toHaveLength(2);
  });

  it('rejects further transitions once status is APPROVED', () => {
    const state = ContractRevisionState.create(WORKSPACE_SLUG);
    state.applySkepticResult(buildApprovedResult());

    const outcome = state.applySkepticResult(buildRejectedResult(1));

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error).toBeInstanceOf(AgentExecutionError);
      expect(outcome.error.role).toBe('skeptic');
    }
    expect(state.status).toBe('APPROVED');
    expect(state.feedbackHistory).toEqual([]);
  });

  it('rejects a feedback cycle that skips ahead of currentCycle + 1', () => {
    const state = ContractRevisionState.create(WORKSPACE_SLUG);

    const outcome = state.applySkepticResult(buildRejectedResult(2));

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error).toBeInstanceOf(AgentExecutionError);
    }
    expect(state.currentCycle).toBe(0);
    expect(state.feedbackHistory).toEqual([]);
  });

  it('rejects a feedback cycle that reuses an already-applied cycle number', () => {
    const state = ContractRevisionState.create(WORKSPACE_SLUG);
    state.applySkepticResult(buildRejectedResult(1));

    const outcome = state.applySkepticResult(buildRejectedResult(1));

    expect(outcome.isErr).toBe(true);
    expect(state.currentCycle).toBe(1);
    expect(state.feedbackHistory).toHaveLength(1);
  });
});
