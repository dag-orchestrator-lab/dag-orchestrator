import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { WorkspaceFileSystemPort } from '../../domain/orchestration/ports/workspace-file-system-port.js';
import { AgentExecutionError } from '../../domain/orchestration/errors/agent-execution-error.js';

const FEEDBACK_RECORD_FILENAME_PREFIX = '02-contracts-feedback-';
const FEEDBACK_RECORD_FILENAME_SUFFIX = '.json';

/** Local filesystem implementation of `WorkspaceFileSystemPort` — not deployed behind Lambda in this epic. */
export class WorkspaceFileSystemAdapter implements WorkspaceFileSystemPort {
  constructor(private readonly baseWorkspacesDir: string) {}

  private resolvePath(workspaceSlug: string, relativePath: string): string {
    return path.join(this.baseWorkspacesDir, workspaceSlug, relativePath);
  }

  private feedbackRecordFilename(cycle: number): string {
    return `${FEEDBACK_RECORD_FILENAME_PREFIX}${cycle}${FEEDBACK_RECORD_FILENAME_SUFFIX}`;
  }

  async readFile(workspaceSlug: string, relativePath: string): Promise<string> {
    const target = this.resolvePath(workspaceSlug, relativePath);
    return await fs.readFile(target, 'utf-8');
  }

  async writeFile(workspaceSlug: string, relativePath: string, content: string): Promise<void> {
    const target = this.resolvePath(workspaceSlug, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf-8');
  }

  async fileExists(workspaceSlug: string, relativePath: string): Promise<boolean> {
    try {
      const target = this.resolvePath(workspaceSlug, relativePath);
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  async readFeedbackRecord(workspaceSlug: string, cycle: number): Promise<string> {
    return await this.readFile(workspaceSlug, this.feedbackRecordFilename(cycle));
  }

  /**
   * Writes the durable feedback record for a given revision cycle.
   * @throws {AgentExecutionError} when a feedback record for this cycle already exists — feedback records are append-only per cycle.
   */
  async writeFeedbackRecord(workspaceSlug: string, cycle: number, content: string): Promise<void> {
    const relativePath = this.feedbackRecordFilename(cycle);
    if (await this.fileExists(workspaceSlug, relativePath)) {
      throw new AgentExecutionError(
        'skeptic',
        workspaceSlug,
        cycle,
        'feedback record for this cycle already exists'
      );
    }
    await this.writeFile(workspaceSlug, relativePath, content);
  }
}
