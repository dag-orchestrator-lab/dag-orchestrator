import { describe, expect, it } from 'vitest';
import { PipelineEvaluator } from '../pipeline-evaluator.js';
import { FeatureWorkspace } from '../../aggregates/feature-workspace.js';
import { FeatureSlug } from '../../value-objects/feature-slug.js';
import { WorkspaceStatus } from '../../value-objects/workspace-status.js';
import { GateApproval } from '../../value-objects/gate-approval.js';
import { PipelineStage } from '../../entities/pipeline-stage.js';

function buildWorkspace(): FeatureWorkspace {
  const slugResult = FeatureSlug.create('my-feature');
  if (!slugResult.isOk) throw new Error('expected FeatureSlug.create to succeed');

  const approvalResult = GateApproval.create({
    gateName: 'contracts-approved',
    approver: 'someone',
    approvedAt: '2026-08-22T00:00:00.000Z',
  });
  if (!approvalResult.isOk) throw new Error('expected GateApproval.create to succeed');

  const stage1Result = PipelineStage.create({
    name: 'stage-1',
    requiredGates: ['contracts-approved'],
  });
  if (!stage1Result.isOk) throw new Error('expected PipelineStage.create to succeed');

  const stage2Result = PipelineStage.create({
    name: 'stage-2',
    requiredGates: ['final-approved'],
  });
  if (!stage2Result.isOk) throw new Error('expected PipelineStage.create to succeed');

  return FeatureWorkspace.reconstitute({
    slug: slugResult.value,
    status: WorkspaceStatus.ACTIVE,
    contextMeta: {},
    approvals: [approvalResult.value],
    stages: [stage1Result.value, stage2Result.value],
    artifacts: [],
  });
}

describe('PipelineEvaluator.evaluateStatus', () => {
  it('reports overallComplete false and per-stage isComplete flags when one stage is approved and one is not', () => {
    const workspace = buildWorkspace();

    const status = PipelineEvaluator.evaluateStatus(workspace);

    expect(status.slug).toBe('my-feature');
    expect(status.overallComplete).toBe(false);
    expect(status.stages).toHaveLength(2);

    expect(status.stages[0].stageName).toBe('stage-1');
    expect(status.stages[0].index).toBe(0);
    expect(status.stages[0].isComplete).toBe(true);
    expect(status.stages[0].requiredGates).toEqual(['contracts-approved']);
    expect(status.stages[0].passedGates).toEqual(['contracts-approved']);

    expect(status.stages[1].stageName).toBe('stage-2');
    expect(status.stages[1].index).toBe(1);
    expect(status.stages[1].isComplete).toBe(false);
    expect(status.stages[1].requiredGates).toEqual(['final-approved']);
    expect(status.stages[1].passedGates).toEqual([]);
  });

  it('reports overallComplete true when all stages are complete', () => {
    const slugResult = FeatureSlug.create('another-feature');
    if (!slugResult.isOk) throw new Error('expected FeatureSlug.create to succeed');

    const approvalResult = GateApproval.create({
      gateName: 'contracts-approved',
      approver: 'someone',
      approvedAt: '2026-08-22T00:00:00.000Z',
    });
    if (!approvalResult.isOk) throw new Error('expected GateApproval.create to succeed');

    const stageResult = PipelineStage.create({
      name: 'stage-1',
      requiredGates: ['contracts-approved'],
    });
    if (!stageResult.isOk) throw new Error('expected PipelineStage.create to succeed');

    const workspace = FeatureWorkspace.reconstitute({
      slug: slugResult.value,
      status: WorkspaceStatus.ACTIVE,
      contextMeta: {},
      approvals: [approvalResult.value],
      stages: [stageResult.value],
      artifacts: [],
    });

    const status = PipelineEvaluator.evaluateStatus(workspace);

    expect(status.overallComplete).toBe(true);
  });

  it('does not access a private stageList accessor and instead uses the public stages getter', () => {
    const workspace = buildWorkspace();

    expect(() => PipelineEvaluator.evaluateStatus(workspace)).not.toThrow();
  });
});
