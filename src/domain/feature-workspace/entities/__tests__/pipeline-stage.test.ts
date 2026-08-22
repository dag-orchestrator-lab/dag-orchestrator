import { describe, expect, it } from 'vitest';
import { PipelineStage } from '../pipeline-stage.js';
import { GateApproval } from '../../value-objects/gate-approval.js';

function createApproval(gateName: string): GateApproval {
  const result = GateApproval.create({
    gateName,
    approver: 'someone',
    approvedAt: '2026-08-22T00:00:00.000Z',
  });
  if (!result.isOk) {
    throw new Error('expected GateApproval.create to succeed');
  }
  return result.value;
}

describe('PipelineStage.isComplete', () => {
  it('is false when only one of two required gates has an approval', () => {
    const stageResult = PipelineStage.create({
      name: 'gate-1',
      requiredGates: ['contracts-approved', 'plan-approved'],
    });
    if (!stageResult.isOk) {
      throw new Error('expected PipelineStage.create to succeed');
    }

    const approvals = [createApproval('contracts-approved')];

    expect(stageResult.value.isComplete(approvals)).toBe(false);
  });

  it('is true once every required gate has a matching approval', () => {
    const stageResult = PipelineStage.create({
      name: 'gate-1',
      requiredGates: ['contracts-approved', 'plan-approved'],
    });
    if (!stageResult.isOk) {
      throw new Error('expected PipelineStage.create to succeed');
    }

    const approvals = [createApproval('contracts-approved'), createApproval('plan-approved')];

    expect(stageResult.value.isComplete(approvals)).toBe(true);
  });

  it('is true when a stage requires no gates', () => {
    const stageResult = PipelineStage.create({ name: 'no-gate-stage', requiredGates: [] });
    if (!stageResult.isOk) {
      throw new Error('expected PipelineStage.create to succeed');
    }

    expect(stageResult.value.isComplete([])).toBe(true);
  });
});
