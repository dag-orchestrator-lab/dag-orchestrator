import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DagConfigRepository } from '../config/dag-config-repository.js';
import { Configuration } from '../config.js';

function makeConfiguration(rootDir: string): Configuration {
  return {
    rootDir,
    dagDir: path.join(rootDir, '.dag'),
    featuresDir: path.join(rootDir, '.dag', 'features'),
    archivedDir: path.join(rootDir, '.dag', 'archive'),
  };
}

describe('DagConfigRepository', () => {
  let tmpRootDir: string;

  afterEach(() => {
    fs.rmSync(tmpRootDir, { recursive: true, force: true });
  });

  it('round-trips a written config through read()', () => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-config-repo-test-'));
    const repo = new DagConfigRepository(makeConfiguration(tmpRootDir));

    const writeResult = repo.write({ version: '1.0.0', llmProvider: 'openai', autoParkPrompt: false });
    expect(writeResult.isOk).toBe(true);

    const readResult = repo.read();
    expect(readResult.isOk).toBe(true);
    if (readResult.isOk) {
      expect(readResult.value).toEqual({ version: '1.0.0', llmProvider: 'openai', autoParkPrompt: false });
    }
  });

  it('applies schema defaults for llmProvider and autoParkPrompt when writing', () => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-config-repo-test-'));
    const repo = new DagConfigRepository(makeConfiguration(tmpRootDir));

    repo.write({ version: '1.0.0' } as unknown as Parameters<DagConfigRepository['write']>[0]);
    const readResult = repo.read();
    expect(readResult.isOk).toBe(true);
    if (readResult.isOk) {
      expect(readResult.value.llmProvider).toBe('gemini');
      expect(readResult.value.autoParkPrompt).toBe(true);
    }
  });

  it('fails schema validation when version is missing on write', () => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-config-repo-test-'));
    const repo = new DagConfigRepository(makeConfiguration(tmpRootDir));

    const writeResult = repo.write({ llmProvider: 'gemini' } as unknown as Parameters<DagConfigRepository['write']>[0]);
    expect(writeResult.isOk).toBe(false);
    if (writeResult.isErr) {
      expect(writeResult.error.kind).toBe('ValidationError');
    }
  });

  it('fails schema validation when version is missing on an existing file read', () => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-config-repo-test-'));
    fs.mkdirSync(path.join(tmpRootDir, '.dag'));
    fs.writeFileSync(
      path.join(tmpRootDir, '.dag', 'config.json'),
      JSON.stringify({ llmProvider: 'gemini', autoParkPrompt: true })
    );

    const repo = new DagConfigRepository(makeConfiguration(tmpRootDir));
    const readResult = repo.read();
    expect(readResult.isOk).toBe(false);
    if (readResult.isErr) {
      expect(readResult.error.kind).toBe('ValidationError');
    }
  });

  it('returns a NotFoundError when no config file exists', () => {
    tmpRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-config-repo-test-'));
    const repo = new DagConfigRepository(makeConfiguration(tmpRootDir));

    const readResult = repo.read();
    expect(readResult.isOk).toBe(false);
    if (readResult.isErr) {
      expect(readResult.error.kind).toBe('NotFoundError');
    }
  });
});
