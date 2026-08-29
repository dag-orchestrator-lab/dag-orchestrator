import { DomainError } from '../../common/errors.js';
import type { AgentRole } from '../models/agent-role.js';

/** Raised when a Sub-Agent's execute() encounters an unexpected or unrecoverable failure. */
export class AgentExecutionError extends DomainError {
  constructor(
    public readonly role: AgentRole,
    public readonly workspaceSlug: string,
    public readonly cycle: number | undefined,
    message: string,
    public readonly cause?: unknown
  ) {
    super(
      `Sub-Agent execution failed [role=${role}, workspaceSlug=${workspaceSlug}, cycle=${cycle ?? 'n/a'}]: ${message}`
    );
    this.name = 'AgentExecutionError';
    Object.setPrototypeOf(this, AgentExecutionError.prototype);
  }
}
