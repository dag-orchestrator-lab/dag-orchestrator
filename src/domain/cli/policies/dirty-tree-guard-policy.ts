import { Result } from '../../common/result.js';
import { GitWorkingTreeStatus } from '../value-objects/git-working-tree-status.js';
import { DirtyWorkingTreeError } from '../errors.js';

/** Policy governing whether pipeline step advancement is allowed based on Git working tree cleanliness (see 03-domain.md §4). */
export class DirtyTreeGuardPolicy {
  /**
   * Evaluates whether a pipeline step is permitted to execute.
   * @param status - Evaluated Git working tree status.
   * @returns Result indicating allowed or blocked with DirtyWorkingTreeError.
   */
  public static validateStepExecution(
    status: GitWorkingTreeStatus
  ): Result<void, DirtyWorkingTreeError> {
    if (status.isClean) {
      return Result.ok(undefined);
    }
    return Result.err(
      new DirtyWorkingTreeError(
        'Uncommitted changes detected in working tree. Commit or stash changes before executing pipeline steps.',
        status.rawOutput
      )
    );
  }
}
