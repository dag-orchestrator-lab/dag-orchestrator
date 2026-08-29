/** Port a Sub-Agent uses to read and write feature workspace artifacts, without depending on `node:fs` directly. */
export interface WorkspaceFileSystemPort {
  /**
   * Reads an artifact file relative to a feature workspace.
   * @param workspaceSlug - the feature workspace identifier
   * @param relativePath - the artifact's path relative to the workspace root
   * @returns the file's contents
   */
  readFile(workspaceSlug: string, relativePath: string): Promise<string>;

  /**
   * Writes an artifact file relative to a feature workspace, overwriting it in place.
   * @param workspaceSlug - the feature workspace identifier
   * @param relativePath - the artifact's path relative to the workspace root
   * @param content - the file contents to write
   */
  writeFile(workspaceSlug: string, relativePath: string, content: string): Promise<void>;

  /**
   * Checks whether an artifact file exists relative to a feature workspace.
   * @param workspaceSlug - the feature workspace identifier
   * @param relativePath - the artifact's path relative to the workspace root
   * @returns whether the file exists
   */
  fileExists(workspaceSlug: string, relativePath: string): Promise<boolean>;

  /**
   * Reads the durable feedback record for a given revision cycle.
   * @param workspaceSlug - the feature workspace identifier
   * @param cycle - the revision cycle number
   * @returns the serialized feedback record contents
   */
  readFeedbackRecord(workspaceSlug: string, cycle: number): Promise<string>;

  /**
   * Writes the durable feedback record for a given revision cycle.
   * @param workspaceSlug - the feature workspace identifier
   * @param cycle - the revision cycle number
   * @param content - the serialized feedback record contents to write
   */
  writeFeedbackRecord(workspaceSlug: string, cycle: number, content: string): Promise<void>;
}
