import { execFile } from 'node:child_process';

/** Driving-adapter port for querying local Git working-tree state (see 02-contracts.md §Ports). */
export interface GitAdapter {
  /**
   * @param cwd - Absolute path to the Git working tree to inspect.
   * @returns true if `git status --porcelain` reports no changes.
   */
  isWorkingTreeClean(cwd: string): Promise<boolean>;
}

/** Node child_process-backed implementation of {@link GitAdapter} (see 03-app-infra.md §2.1). */
export class NodeGitAdapter implements GitAdapter {
  /**
   * @param cwd - Absolute path to the Git working tree to inspect.
   * @returns true iff `git status --porcelain` stdout is empty once trimmed; false on any thrown error (not-a-repo, git missing).
   */
  async isWorkingTreeClean(cwd: string): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('git', ['status', '--porcelain'], { cwd }, (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        resolve(stdout.trim().length === 0);
      });
    });
  }
}
