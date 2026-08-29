/** How serious a Skeptic finding is: BLOCKER forces a REJECTED verdict, WARNING does not. */
export type FindingSeverity = 'BLOCKER' | 'WARNING';

/** A single objection the Skeptic raises against one section of 02-contracts.md. */
export interface ContractFinding {
  readonly section: string;
  readonly issue: string;
  readonly severity: FindingSeverity;
}
