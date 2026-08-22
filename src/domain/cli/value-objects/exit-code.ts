/** Domain value object representing standard POSIX process exit codes for CLI execution. */
export class ExitCode {
  private constructor(public readonly code: number) {
    Object.freeze(this);
  }

  public static readonly SUCCESS = new ExitCode(0);
  public static readonly FAILURE = new ExitCode(1);
  public static readonly INTERRUPTED = new ExitCode(130);

  public equals(other: ExitCode): boolean {
    return this.code === other.code;
  }
}
