import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the compiled CLI entrypoint under test (see 02-contracts.md §API surface). */
const DAG_BIN = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'bin',
  'dag.js'
);

interface CliResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Spawns the compiled CLI as a real subprocess against `cwd`, feeding `stdin` for any interactive prompts. */
function runDag(cwd: string, args: readonly string[], stdin = ''): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DAG_BIN, ...args], {
      cwd,
      env: { ...process.env, DAG_WORKSPACE_ROOT: cwd },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

function initGitRepo(cwd: string): void {
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 'e2e@dag-orchestrator.test'], { cwd });
  execFileSync('git', ['config', 'user.name', 'e2e'], { cwd });
  fs.writeFileSync(path.join(cwd, 'README.md'), 'e2e fixture repo\n');
  execFileSync('git', ['add', 'README.md'], { cwd });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd });
}

function isActive(cwd: string, slug: string): boolean {
  return fs.existsSync(path.join(cwd, '.dag', 'features', slug, 'meta.json'));
}

function isArchived(cwd: string, slug: string): boolean {
  return fs.existsSync(path.join(cwd, '.dag', 'archive', slug, 'meta.json'));
}

describe('CLI end-to-end: Auto-Park and dirty-tree guard', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-e2e-'));
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('worked example: `dag new my-feature` with a different active workspace prompts, parks, and creates', async () => {
    const created = await runDag(tmpDir, ['new', 'old-feature']);
    expect(created.code).toBe(0);
    expect(isActive(tmpDir, 'old-feature')).toBe(true);

    const result = await runDag(tmpDir, ['new', 'my-feature'], 'y\n');

    expect(result.stdout).toContain('An active workspace "old-feature" already exists.');
    expect(result.stdout).toContain('Created workspace "my-feature".');
    expect(result.code).toBe(0);

    expect(isActive(tmpDir, 'my-feature')).toBe(true);
    expect(isActive(tmpDir, 'old-feature')).toBe(false);
    expect(isArchived(tmpDir, 'old-feature')).toBe(true);
  });

  it('BLOCKER regression: `dag plan <same-active-name>` re-enters without prompting or archiving', async () => {
    const created = await runDag(tmpDir, ['new', 'same-feature']);
    expect(created.code).toBe(0);

    const result = await runDag(tmpDir, ['plan', 'same-feature'], '');

    expect(result.stdout).not.toContain('already exists');
    expect(result.stdout).toContain('Resuming existing workspace "same-feature".');
    expect(result.code).toBe(0);

    expect(isActive(tmpDir, 'same-feature')).toBe(true);
    expect(isArchived(tmpDir, 'same-feature')).toBe(false);
  });

  it('dirty-tree-before-stepN: halts/prompts instead of silently proceeding', async () => {
    const created = await runDag(tmpDir, ['new', 'dirty-feature']);
    expect(created.code).toBe(0);

    fs.appendFileSync(path.join(tmpDir, 'README.md'), 'uncommitted change\n');

    const result = await runDag(tmpDir, ['step0'], 'n\n');

    expect(result.stderr).toContain('uncommitted changes before step0');
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain('Created workspace');
  });
});
