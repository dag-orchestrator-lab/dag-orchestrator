import { describe, expect, it, afterEach } from 'vitest';
import path from 'node:path';
import { resolveConfiguration } from '../config.js';

describe('resolveConfiguration', () => {
  const originalRoot = process.env.DAG_WORKSPACE_ROOT;

  afterEach(() => {
    if (originalRoot === undefined) {
      delete process.env.DAG_WORKSPACE_ROOT;
    } else {
      process.env.DAG_WORKSPACE_ROOT = originalRoot;
    }
  });

  it('derives paths from process.cwd() when DAG_WORKSPACE_ROOT is unset', () => {
    delete process.env.DAG_WORKSPACE_ROOT;
    const config = resolveConfiguration();
    expect(config.rootDir).toBe(process.cwd());
    expect(config.dagDir).toBe(path.join(process.cwd(), '.dag'));
    expect(config.featuresDir).toBe(path.join(process.cwd(), '.dag', 'features'));
    expect(config.archivedDir).toBe(path.join(process.cwd(), '.dag', 'archive'));
  });

  it('derives paths from DAG_WORKSPACE_ROOT when set', () => {
    process.env.DAG_WORKSPACE_ROOT = '/tmp/some-root';
    const config = resolveConfiguration();
    expect(config.rootDir).toBe('/tmp/some-root');
    expect(config.dagDir).toBe(path.join('/tmp/some-root', '.dag'));
    expect(config.featuresDir).toBe(path.join('/tmp/some-root', '.dag', 'features'));
    expect(config.archivedDir).toBe(path.join('/tmp/some-root', '.dag', 'archive'));
  });
});
