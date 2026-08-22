import { describe, expect, it } from 'vitest';
import { FeatureWorkspace } from '../feature-workspace.js';
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

  const stageResult = PipelineStage.create({
    name: 'stage-1',
    requiredGates: ['contracts-approved'],
  });
  if (!stageResult.isOk) throw new Error('expected PipelineStage.create to succeed');

  return FeatureWorkspace.reconstitute({
    slug: slugResult.value,
    status: WorkspaceStatus.ACTIVE,
    contextMeta: { jiraTicket: 'ABC-123' },
    approvals: [approvalResult.value],
    stages: [stageResult.value],
    artifacts: ['plan.md'],
  });
}

describe('FeatureWorkspace', () => {
  it('reconstitute produces accessors matching the supplied props', () => {
    const workspace = buildWorkspace();

    expect(workspace.slug.value).toBe('my-feature');
    expect(workspace.status.isActive()).toBe(true);
    expect(workspace.contextMeta).toEqual({ jiraTicket: 'ABC-123' });
    expect(workspace.approvals).toHaveLength(1);
    expect(workspace.stages).toHaveLength(1);
    expect(workspace.stages[0].name).toBe('stage-1');
  });

  it('archive() then unarchive() round-trips to identical contextMeta and approvals', () => {
    const workspace = buildWorkspace();

    const contextMetaBefore = workspace.contextMeta;
    const approvalsBefore = workspace.approvals;

    const archiveResult = workspace.archive();
    expect(archiveResult.isOk).toBe(true);
    expect(workspace.status.isArchived()).toBe(true);

    const unarchiveResult = workspace.unarchive();
    expect(unarchiveResult.isOk).toBe(true);
    expect(workspace.status.isActive()).toBe(true);

    expect(workspace.contextMeta).toEqual(contextMetaBefore);
    expect(workspace.approvals).toEqual(approvalsBefore);
  });

  it('toPersistenceFormat serializes full aggregate state', () => {
    const workspace = buildWorkspace();

    expect(workspace.toPersistenceFormat()).toEqual({
      slug: 'my-feature',
      status: 'ACTIVE',
      contextMeta: { jiraTicket: 'ABC-123' },
      approvals: [
        {
          gateName: 'contracts-approved',
          approver: 'someone',
          approvedAt: '2026-08-22T00:00:00.000Z',
          metadata: {},
        },
      ],
      stages: [{ name: 'stage-1', requiredGates: ['contracts-approved'] }],
      artifacts: ['plan.md'],
    });
  });

  it('toLegacyFormat flattens contextMeta with slug and status', () => {
    const workspace = buildWorkspace();

    expect(workspace.toLegacyFormat()).toEqual({
      jiraTicket: 'ABC-123',
      slug: 'my-feature',
      status: 'ACTIVE',
    });
  });
});
