import { describe, it, expect } from 'vitest';
import { DirtyTreeGuardPolicy } from '../dirty-tree-guard-policy.js';
import { GitWorkingTreeStatus } from '../../value-objects/git-working-tree-status.js';
import { DirtyWorkingTreeError } from '../../errors.js';

describe('DirtyTreeGuardPolicy.validateStepExecution', () => {
  it('returns ok when the working tree is clean', () => {
    const result = DirtyTreeGuardPolicy.validateStepExecution(GitWorkingTreeStatus.clean());
    expect(result.isOk).toBe(true);
  });

  it('returns a failed result with DirtyWorkingTreeError when the working tree is dirty', () => {
    const status = GitWorkingTreeStatus.dirty(' M src/foo.ts');
    const result = DirtyTreeGuardPolicy.validateStepExecution(status);

    expect(result.isErr).toBe(true);
    if (!result.isErr) throw new Error('expected validateStepExecution to fail for dirty tree');
    expect(result.error).toBeInstanceOf(DirtyWorkingTreeError);
    expect(result.error.gitStatusOutput).toBe(' M src/foo.ts');
  });
});
