import { describe, expect, it } from 'vitest';
import { RollbackSnapshot } from '../rollback-snapshot.js';

describe('RollbackSnapshot.toLegacyFormat', () => {
  it('returns a plain object with all five fields', () => {
    const result = RollbackSnapshot.create({
      snapshotId: 'snap-1',
      slug: 'my-feature',
      createdAt: '2026-08-22T00:00:00.000Z',
      metadataContent: { status: 'ACTIVE' },
      artifactManifest: ['05-tasks.md'],
    });

    if (!result.isOk) {
      throw new Error('expected RollbackSnapshot.create to succeed');
    }

    const legacy = result.value.toLegacyFormat();

    expect(legacy).toEqual({
      snapshotId: 'snap-1',
      slug: 'my-feature',
      createdAt: '2026-08-22T00:00:00.000Z',
      metadataContent: { status: 'ACTIVE' },
      artifactManifest: ['05-tasks.md'],
    });
  });

  it('never exposes an `id` field, only `snapshotId`', () => {
    const result = RollbackSnapshot.create({
      snapshotId: 'snap-2',
      slug: 'my-feature',
      createdAt: '2026-08-22T00:00:00.000Z',
      metadataContent: {},
      artifactManifest: [],
    });

    if (!result.isOk) {
      throw new Error('expected RollbackSnapshot.create to succeed');
    }

    const legacy = result.value.toLegacyFormat();

    expect(legacy).toHaveProperty('snapshotId');
    expect(legacy).not.toHaveProperty('id');
  });
});
