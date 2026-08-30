import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceConfigLoader } from './workspace-config-loader.js';
import { validateAgainstJsonSchema, type JsonSchemaLite } from './json-schema-lite.js';
import {
  DEFAULT_TEST_COMMAND,
  DEFAULT_TYPECHECK_COMMAND,
} from '../../../domain/orchestration/models/verify-command.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(MODULE_DIR, '../../../..');
const CONFIG_SCHEMA: JsonSchemaLite = JSON.parse(
  readFileSync(join(REPO_ROOT, '.dag/config.schema.json'), 'utf8')
) as JsonSchemaLite;
const FIXTURES_DIR = join(MODULE_DIR, '__fixtures__');

function readFixture(fileName: string): string {
  return readFileSync(join(FIXTURES_DIR, fileName), 'utf8');
}

function createWorkspaceFileSystem(overrides: Partial<WorkspaceFileSystemPort> = {}): WorkspaceFileSystemPort {
  return {
    readFile: vi.fn(async () => '{}'),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => false),
    readFeedbackRecord: vi.fn(async () => '{}'),
    writeFeedbackRecord: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('WorkspaceConfigLoader.loadVerifyCommands', () => {
  it('falls back to defaults when .dag/config.json does not exist', async () => {
    const fileSystem = createWorkspaceFileSystem({ fileExists: vi.fn(async () => false) });
    const loader = new WorkspaceConfigLoader(fileSystem);

    const result = await loader.loadVerifyCommands('feature-slug');

    expect(result.typecheck).toEqual(DEFAULT_TYPECHECK_COMMAND);
    expect(result.test).toEqual(DEFAULT_TEST_COMMAND);
  });

  it('falls back to defaults when .dag/config.json contains invalid JSON', async () => {
    const fileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async () => true),
      readFile: vi.fn(async () => 'not valid json{{'),
    });
    const loader = new WorkspaceConfigLoader(fileSystem);

    const result = await loader.loadVerifyCommands('feature-slug');

    expect(result.typecheck).toEqual(DEFAULT_TYPECHECK_COMMAND);
    expect(result.test).toEqual(DEFAULT_TEST_COMMAND);
  });

  it('falls back to defaults when readFile rejects', async () => {
    const fileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async () => true),
      readFile: vi.fn(async () => {
        throw new Error('disk failure');
      }),
    });
    const loader = new WorkspaceConfigLoader(fileSystem);

    const result = await loader.loadVerifyCommands('feature-slug');

    expect(result.typecheck).toEqual(DEFAULT_TYPECHECK_COMMAND);
    expect(result.test).toEqual(DEFAULT_TEST_COMMAND);
  });

  it('reads a fully-specified verify configuration from .dag/config.json', async () => {
    const fileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async () => true),
      readFile: vi.fn(async () =>
        JSON.stringify({
          verify: {
            typecheck: { executable: 'pnpm', args: ['typecheck'], cwd: '/repo', timeoutMs: 60_000 },
            test: { executable: 'pnpm', args: ['test'], cwd: '/repo', timeoutMs: 90_000 },
          },
        })
      ),
    });
    const loader = new WorkspaceConfigLoader(fileSystem);

    const result = await loader.loadVerifyCommands('feature-slug');

    expect(result.typecheck).toEqual({ executable: 'pnpm', args: ['typecheck'], cwd: '/repo', timeoutMs: 60_000 });
    expect(result.test).toEqual({ executable: 'pnpm', args: ['test'], cwd: '/repo', timeoutMs: 90_000 });
  });

  it('falls back per-field to defaults when a partial verify configuration is given', async () => {
    const fileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async () => true),
      readFile: vi.fn(async () =>
        JSON.stringify({
          verify: {
            typecheck: { timeoutMs: 5_000 },
          },
        })
      ),
    });
    const loader = new WorkspaceConfigLoader(fileSystem);

    const result = await loader.loadVerifyCommands('feature-slug');

    expect(result.typecheck).toEqual({
      executable: DEFAULT_TYPECHECK_COMMAND.executable,
      args: DEFAULT_TYPECHECK_COMMAND.args,
      cwd: DEFAULT_TYPECHECK_COMMAND.cwd,
      timeoutMs: 5_000,
    });
    expect(result.test).toEqual(DEFAULT_TEST_COMMAND);
  });

  it('falls back to defaults when the verify field is missing entirely', async () => {
    const fileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async () => true),
      readFile: vi.fn(async () => JSON.stringify({ someOtherField: true })),
    });
    const loader = new WorkspaceConfigLoader(fileSystem);

    const result = await loader.loadVerifyCommands('feature-slug');

    expect(result.typecheck).toEqual(DEFAULT_TYPECHECK_COMMAND);
    expect(result.test).toEqual(DEFAULT_TEST_COMMAND);
  });

  it('resolves the partial-overrides (typecheck only) fixture to a complete VerifyConfiguration', async () => {
    const fixtureContent = readFixture('partial-typecheck-only.config.json');
    const errors = validateAgainstJsonSchema(CONFIG_SCHEMA, JSON.parse(fixtureContent) as unknown);
    expect(errors).toEqual([]);

    const fileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async () => true),
      readFile: vi.fn(async () => fixtureContent),
    });
    const loader = new WorkspaceConfigLoader(fileSystem);

    const result = await loader.loadVerifyCommands('feature-slug');

    expect(result.typecheck).toEqual({
      executable: 'pnpm',
      args: ['typecheck'],
      cwd: DEFAULT_TYPECHECK_COMMAND.cwd,
      timeoutMs: DEFAULT_TYPECHECK_COMMAND.timeoutMs,
    });
    expect(result.test).toEqual(DEFAULT_TEST_COMMAND);
  });

  it('resolves the no-verify-key fixture to a complete VerifyConfiguration', async () => {
    const fixtureContent = readFixture('no-verify-key.config.json');
    const errors = validateAgainstJsonSchema(CONFIG_SCHEMA, JSON.parse(fixtureContent) as unknown);
    expect(errors).toEqual([]);

    const fileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async () => true),
      readFile: vi.fn(async () => fixtureContent),
    });
    const loader = new WorkspaceConfigLoader(fileSystem);

    const result = await loader.loadVerifyCommands('feature-slug');

    expect(result.typecheck).toEqual(DEFAULT_TYPECHECK_COMMAND);
    expect(result.test).toEqual(DEFAULT_TEST_COMMAND);
  });
});
