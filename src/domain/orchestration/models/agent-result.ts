import type { AgentRole } from './agent-role.js';
import type { ContractFeedbackRecord } from './contract-feedback-record.js';
import type { SkepticVerdict } from './skeptic-verdict.js';

/** The outcome a Sub-Agent's execute() returns upon producing an artifact. */
export interface AgentResult {
  readonly role: AgentRole;
  readonly artifactPath: string;
  /** Only set by the Skeptic. */
  readonly verdict?: SkepticVerdict;
  /** Only set when verdict === 'REJECTED'. */
  readonly feedback?: ContractFeedbackRecord;
}
