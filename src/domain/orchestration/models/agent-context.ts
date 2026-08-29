import type { ContractFeedbackRecord } from './contract-feedback-record.js';

/** The input handed to a Sub-Agent's execute(): workspace location, upstream artifact paths, and any pending Skeptic feedback. */
export interface AgentContext {
  readonly workspaceSlug: string;
  readonly requirementsPath: string;
  readonly reconPath?: string;
  readonly contractsPath?: string;
  /** Present only when the Architect is being re-invoked after a Skeptic rejection. */
  readonly pendingFeedback?: readonly ContractFeedbackRecord[];
}
