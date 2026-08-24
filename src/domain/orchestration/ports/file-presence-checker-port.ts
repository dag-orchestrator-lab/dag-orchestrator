/** Port for checking whether a file exists at an absolute path, without depending on `node:fs` directly. */
export interface FilePresenceCheckerPort {
  existsSync(absolutePath: string): boolean;
}
