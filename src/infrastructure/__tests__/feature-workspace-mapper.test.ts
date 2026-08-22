import { describe, expect, it } from 'vitest';
import { FeatureWorkspaceMapper } from '../feature-workspace-mapper.js';

describe('FeatureWorkspaceMapper', () => {
  describe('toDomain', () => {
    it('returns Result.err(PersistenceReadError) when rawJson is null', () => {
      const result = FeatureWorkspaceMapper.toDomain('my-feature', '/dag/features/my-feature', null, false);

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error.kind).toBe('PersistenceReadError');
      }
    });

    it('returns Result.err(PersistenceReadError) when rawJson is an array', () => {
      const result = FeatureWorkspaceMapper.toDomain('my-feature', '/dag/features/my-feature', [], false);

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error.kind).toBe('PersistenceReadError');
      }
    });

    it('returns Result.err(PersistenceReadError) when a nested field is malformed, without throwing', () => {
      expect(() =>
        FeatureWorkspaceMapper.toDomain(
          'my-feature',
          '/dag/features/my-feature',
          { approvals: [{ gateName: 42, approver: 'someone', approvedAt: '2026-08-22T00:00:00.000Z' }] },
          false,
        ),
      ).not.toThrow();

      const result = FeatureWorkspaceMapper.toDomain(
        'my-feature',
        '/dag/features/my-feature',
        { approvals: [{ gateName: 42, approver: 'someone', approvedAt: '2026-08-22T00:00:00.000Z' }] },
        false,
      );

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error.kind).toBe('PersistenceReadError');
      }
    });

    it('reconstitutes a valid workspace, defaulting missing optional collections', () => {
      const result = FeatureWorkspaceMapper.toDomain(
        'my-feature',
        '/dag/features/my-feature',
        { contextMeta: { jiraTicket: 'ABC-123' } },
        false,
      );

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.slug.value).toBe('my-feature');
        expect(result.value.status.isActive()).toBe(true);
        expect(result.value.contextMeta).toEqual({ jiraTicket: 'ABC-123' });
        expect(result.value.approvals).toEqual([]);
        expect(result.value.stages).toEqual([]);
        expect(result.value.artifacts).toEqual([]);
      }
    });

    it('marks the workspace archived when isArchived is true', () => {
      const result = FeatureWorkspaceMapper.toDomain('my-feature', '/dag/archive/my-feature', {}, true);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.status.isArchived()).toBe(true);
      }
    });

    it('reconstitutes full round-trip fields (approvals, stages, artifacts)', () => {
      const rawJson = {
        contextMeta: { jiraTicket: 'ABC-123' },
        approvals: [
          { gateName: 'contracts-approved', approver: 'someone', approvedAt: '2026-08-22T00:00:00.000Z' },
        ],
        stages: [{ name: 'stage-1', requiredGates: ['contracts-approved'] }],
        artifacts: ['plan.md'],
      };

      const result = FeatureWorkspaceMapper.toDomain('my-feature', '/dag/features/my-feature', rawJson, false);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.approvals).toHaveLength(1);
        expect(result.value.approvals[0]?.gateName).toBe('contracts-approved');
        expect(result.value.stages).toHaveLength(1);
        expect(result.value.stages[0]?.name).toBe('stage-1');
        expect(result.value.artifacts).toEqual(['plan.md']);
      }
    });
  });

  describe('toPersistence', () => {
    it('delegates to workspace.toPersistenceFormat()', () => {
      const toDomainResult = FeatureWorkspaceMapper.toDomain(
        'my-feature',
        '/dag/features/my-feature',
        { contextMeta: { jiraTicket: 'ABC-123' } },
        false,
      );
      if (!toDomainResult.isOk) throw new Error('expected toDomain to succeed');

      const persisted = FeatureWorkspaceMapper.toPersistence(toDomainResult.value);

      expect(persisted).toEqual(toDomainResult.value.toPersistenceFormat());
    });
  });
});
