/** Represents the evaluated safety state of the local Git repository working directory. */
export class GitWorkingTreeStatus {
  private constructor(
    public readonly isClean: boolean,
    public readonly rawOutput: string
  ) {
    Object.freeze(this);
  }

  public static clean(): GitWorkingTreeStatus {
    return new GitWorkingTreeStatus(true, '');
  }

  public static dirty(rawOutput: string): GitWorkingTreeStatus {
    return new GitWorkingTreeStatus(false, rawOutput);
  }
}
