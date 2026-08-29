import { describe, expect, it } from 'vitest';
import {
  validateAgentContext,
  validateAgentResult,
  validateFeedbackSequence,
} from '../validation/contract-invariants.js';
import type { AgentContext } from '../models/agent-context.js';
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

describe('validateAgentResult', () => {
  it('rejects a non-skeptic result that carries a verdict', () => {
    const result: AgentResult = { role: 'recon', artifactPath: '/tmp/01-recon.md', verdict: 'APPROVED' };

    const outcome = validateAgentResult(result, WORKSPACE_SLUG);

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error).toBeInstanceOf(AgentExecutionError);
      expect(outcome.error.role).toBe('recon');
      expect(outcome.error.workspaceSlug).toBe(WORKSPACE_SLUG);
    }
  });

  it('rejects a non-skeptic result that carries feedback', () => {
    const result: AgentResult = {
      role: 'architect',
      artifactPath: '/tmp/02-contracts.md',
      feedback: buildFeedbackRecord(1),
    };

    const outcome = validateAgentResult(result, WORKSPACE_SLUG);

    expect(outcome.isErr).toBe(true);
  });

  it('accepts a non-skeptic result with no verdict or feedback', () => {
    const result: AgentResult = { role: 'recon', artifactPath: '/tmp/01-recon.md' };

    expect(validateAgentResult(result, WORKSPACE_SLUG).isOk).toBe(true);
  });

  it('rejects a skeptic result missing a verdict', () => {
    const result: AgentResult = { role: 'skeptic', artifactPath: '/tmp/02-contracts.md' };

    const outcome = validateAgentResult(result, WORKSPACE_SLUG);

    expect(outcome.isErr).toBe(true);
  });

  it('rejects a skeptic APPROVED result that carries feedback', () => {
    const result: AgentResult = {
      role: 'skeptic',
      artifactPath: '/tmp/02-contracts.md',
      verdict: 'APPROVED',
      feedback: buildFeedbackRecord(1),
    };

    const outcome = validateAgentResult(result, WORKSPACE_SLUG);

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error.cycle).toBe(1);
    }
  });

  it('accepts a skeptic APPROVED result with no feedback', () => {
    const result: AgentResult = {
      role: 'skeptic',
      artifactPath: '/tmp/02-contracts.md',
      verdict: 'APPROVED',
    };

    expect(validateAgentResult(result, WORKSPACE_SLUG).isOk).toBe(true);
  });

  it('rejects a skeptic REJECTED result with empty findings', () => {
    const result: AgentResult = {
      role: 'skeptic',
      artifactPath: '/tmp/02-contracts.md',
      verdict: 'REJECTED',
      feedback: { cycle: 1, raisedAt: new Date().toISOString(), findings: [] },
    };

    const outcome = validateAgentResult(result, WORKSPACE_SLUG);

    expect(outcome.isErr).toBe(true);
  });

  it('rejects a skeptic REJECTED result with no feedback at all', () => {
    const result: AgentResult = {
      role: 'skeptic',
      artifactPath: '/tmp/02-contracts.md',
      verdict: 'REJECTED',
    };

    expect(validateAgentResult(result, WORKSPACE_SLUG).isErr).toBe(true);
  });

  it('accepts a skeptic REJECTED result with non-empty findings', () => {
    const result: AgentResult = {
      role: 'skeptic',
      artifactPath: '/tmp/02-contracts.md',
      verdict: 'REJECTED',
      feedback: buildFeedbackRecord(1),
    };

    expect(validateAgentResult(result, WORKSPACE_SLUG).isOk).toBe(true);
  });
});

describe('validateFeedbackSequence', () => {
  it('accepts an empty history', () => {
    expect(validateFeedbackSequence([], WORKSPACE_SLUG).isOk).toBe(true);
  });

  it('accepts a gapless 1-based sequence', () => {
    const history = [buildFeedbackRecord(1), buildFeedbackRecord(2), buildFeedbackRecord(3)];

    expect(validateFeedbackSequence(history, WORKSPACE_SLUG).isOk).toBe(true);
  });

  it('rejects a sequence with a gap', () => {
    const history = [buildFeedbackRecord(1), buildFeedbackRecord(3)];

    const outcome = validateFeedbackSequence(history, WORKSPACE_SLUG);

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error).toBeInstanceOf(AgentExecutionError);
      expect(outcome.error.role).toBe('skeptic');
      expect(outcome.error.workspaceSlug).toBe(WORKSPACE_SLUG);
      expect(outcome.error.cycle).toBe(3);
    }
  });

  it('rejects a sequence that reuses a cycle number', () => {
    const history = [buildFeedbackRecord(1), buildFeedbackRecord(1)];

    const outcome = validateFeedbackSequence(history, WORKSPACE_SLUG);

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error.cycle).toBe(1);
    }
  });
});

describe('validateAgentContext', () => {
  const baseContext: AgentContext = {
    workspaceSlug: WORKSPACE_SLUG,
    requirementsPath: '/tmp/00-requirements.md',
  };

  it('accepts a context with a non-empty workspaceSlug and requirementsPath', () => {
    expect(validateAgentContext(baseContext, 'recon').isOk).toBe(true);
  });

  it('rejects an empty workspaceSlug', () => {
    const outcome = validateAgentContext({ ...baseContext, workspaceSlug: '' }, 'recon');

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error).toBeInstanceOf(AgentExecutionError);
      expect(outcome.error.role).toBe('recon');
    }
  });

  it('rejects a whitespace-only workspaceSlug', () => {
    expect(validateAgentContext({ ...baseContext, workspaceSlug: '   ' }, 'recon').isErr).toBe(true);
  });

  it('rejects an empty requirementsPath', () => {
    const outcome = validateAgentContext({ ...baseContext, requirementsPath: '' }, 'architect');

    expect(outcome.isErr).toBe(true);
    if (outcome.isErr) {
      expect(outcome.error.workspaceSlug).toBe(WORKSPACE_SLUG);
      expect(outcome.error.role).toBe('architect');
    }
  });
});
