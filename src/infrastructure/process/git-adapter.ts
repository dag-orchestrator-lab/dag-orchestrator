/** Driving-adapter port for querying local Git working-tree state (see 02-contracts.md §Ports). */
export interface GitAdapter {
  /**
   * @param cwd - Absolute path to the Git working tree to inspect.
   * @returns true if `git status --porcelain` reports no changes.
   */
  isWorkingTreeClean(cwd: string): Promise<boolean>;
}
