import { describe, expect, it } from 'vitest';
import { GateApproval } from '../../feature-workspace/value-objects/gate-approval.js';
import { InvalidStageTransitionError } from '../errors/pipeline-stage-invariant-error.js';
import { PipelineStageInvariants } from './pipeline-stage-invariants.js';

function createGateApproval(gateName: string): GateApproval {
  const result = GateApproval.create({
    gateName,
    approver: 'larzthimotyp@gmail.com',
    approvedAt: '2026-08-30T00:00:00.000Z',
  });
  if (!result.isOk) throw new Error('expected GateApproval.create to succeed');
  return result.value;
}

describe('PipelineStageInvariants.assertCanTransitionToCoder', () => {
  it('does not throw when the planner completed and the tasks file exists', () => {
    expect(() =>
      PipelineStageInvariants.assertCanTransitionToCoder(true, true)
    ).not.toThrow();
  });

  it('throws InvalidStageTransitionError when the planner has not completed', () => {
    expect(() => PipelineStageInvariants.assertCanTransitionToCoder(false, true)).toThrow(
      InvalidStageTransitionError
    );
  });

  it('throws InvalidStageTransitionError when 05-tasks.md is missing', () => {
    expect(() => PipelineStageInvariants.assertCanTransitionToCoder(true, false)).toThrow(
      InvalidStageTransitionError
    );
  });

  it('throws InvalidStageTransitionError when both preconditions are false', () => {
    expect(() => PipelineStageInvariants.assertCanTransitionToCoder(false, false)).toThrow(
      InvalidStageTransitionError
    );
  });
});

describe('PipelineStageInvariants.assertCanAdvancePastGate4', () => {
  it('does not throw when a gate-4 GateApproval is present', () => {
    expect(() =>
      PipelineStageInvariants.assertCanAdvancePastGate4(createGateApproval('gate-4'))
    ).not.toThrow();
  });

  it('throws InvalidStageTransitionError when no GateApproval is present', () => {
    expect(() => PipelineStageInvariants.assertCanAdvancePastGate4(undefined)).toThrow(
      InvalidStageTransitionError
    );
  });

  it('throws InvalidStageTransitionError when the approval is for a different gate', () => {
    expect(() =>
      PipelineStageInvariants.assertCanAdvancePastGate4(createGateApproval('gate-3'))
    ).toThrow(InvalidStageTransitionError);
  });
});
