import type { ContractFinding } from './contract-finding.js';

/** The durable record of one Skeptic rejection cycle, persisted by the Orchestrator and replayed into the next Architect invocation. */
export interface ContractFeedbackRecord {
  readonly cycle: number;
  readonly raisedAt: string;
  readonly findings: readonly ContractFinding[];
}
