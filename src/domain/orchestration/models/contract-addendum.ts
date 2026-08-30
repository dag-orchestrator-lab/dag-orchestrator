/** Filename prefix for a contract addendum artifact written by the Reviewer Agent. */
const CONTRACT_ADDENDUM_FILE_PREFIX = 'contract-addendum-';

/** Filename extension for a contract addendum artifact. */
const CONTRACT_ADDENDUM_FILE_EXTENSION = '.md';

/** Immutable supplementary document amending `02-contracts.md`, identified by `(featureId, addendumSequence)`. */
export class ContractAddendum {
  readonly featureId: string;
  readonly addendumSequence: number;
  readonly content: string;
  readonly createdAt: Date;

  /**
   * Creates an immutable contract addendum record.
   * @param featureId - identity of the feature this addendum amends.
   * @param addendumSequence - monotonically increasing sequence number for this feature's addenda.
   * @param content - the addendum's markdown content.
   * @param createdAt - the timestamp this addendum was created; copied defensively to prevent shared mutable state.
   */
  constructor(featureId: string, addendumSequence: number, content: string, createdAt: Date) {
    this.featureId = featureId;
    this.addendumSequence = addendumSequence;
    this.content = content;
    this.createdAt = new Date(createdAt.getTime());
  }

  /** Workspace-relative file path this addendum is written to, e.g. `contract-addendum-2.md`. */
  get filePath(): string {
    return `${CONTRACT_ADDENDUM_FILE_PREFIX}${this.addendumSequence}${CONTRACT_ADDENDUM_FILE_EXTENSION}`;
  }
}
