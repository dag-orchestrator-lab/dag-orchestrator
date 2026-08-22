import { describe, it, expect, vi } from 'vitest';
import { Result } from '../../domain/common/result.js';
import { WorkspaceCollisionError } from '../../domain/cli/errors.js';
import {
  FeatureWorkspaceGuard,
  type ActiveWorkspaceSummary,
  type FeatureWorkspaceGuardService,
} from '../feature-workspace-guard.js';
import type { Prompter } from '../../infrastructure/cli/readline-prompter.js';

function makeService(active: ActiveWorkspaceSummary | null): FeatureWorkspaceGuardService {
  return {
    getActiveWorkspace: vi.fn(() => Result.ok(active)),
    archiveWorkspace: vi.fn(() => Result.ok(undefined)),
  };
}

function makePrompter(answer: string): Prompter {
  return {
    askQuestion: vi.fn(async () => answer),
    askMultiLine: vi.fn(async () => ''),
    close: vi.fn(),
  };
}

describe('FeatureWorkspaceGuard.ensureNoActiveWorkspace', () => {
  it('Scenario A: active workspace exists, user answers "y" -> parks and returns Result.ok()', async () => {
    const service = makeService({ name: 'old-feature' });
    const prompter = makePrompter('y');
    const guard = new FeatureWorkspaceGuard(service, prompter);

    const result = await guard.ensureNoActiveWorkspace('new-feature');

    expect(result.isOk).toBe(true);
    expect(prompter.askQuestion).toHaveBeenCalledTimes(1);
    expect(service.archiveWorkspace).toHaveBeenCalledExactlyOnceWith('old-feature');
  });

  it('Scenario B: active workspace exists, user answers "n" -> aborts and returns Result.err()', async () => {
    const service = makeService({ name: 'old-feature' });
    const prompter = makePrompter('n');
    const guard = new FeatureWorkspaceGuard(service, prompter);

    const result = await guard.ensureNoActiveWorkspace('new-feature');

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBeInstanceOf(WorkspaceCollisionError);
    }
    expect(service.archiveWorkspace).not.toHaveBeenCalled();
  });

  it('Scenario C: no active workspace -> proceeds cleanly without prompting', async () => {
    const service = makeService(null);
    const prompter = makePrompter('y');
    const guard = new FeatureWorkspaceGuard(service, prompter);

    const result = await guard.ensureNoActiveWorkspace('new-feature');

    expect(result.isOk).toBe(true);
    expect(prompter.askQuestion).not.toHaveBeenCalled();
    expect(service.archiveWorkspace).not.toHaveBeenCalled();
  });

  it('Scenario D: active workspace name equals target name -> no prompt, no archive, Result.ok()', async () => {
    const service = makeService({ name: 'same-feature' });
    const prompter = makePrompter('y');
    const guard = new FeatureWorkspaceGuard(service, prompter);

    const result = await guard.ensureNoActiveWorkspace('same-feature');

    expect(result.isOk).toBe(true);
    expect(prompter.askQuestion).not.toHaveBeenCalled();
    expect(service.archiveWorkspace).not.toHaveBeenCalled();
  });
});
