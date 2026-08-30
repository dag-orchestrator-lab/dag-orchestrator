import { success, type Result } from '../../../domain/common/result.js';
import {
  REVIEW_COMPLETED_EVENT_NAME,
  CONTRACT_ADDENDUM_CREATED_EVENT_NAME,
} from '../../../domain/orchestration/events/reviewer-events.js';
import { ContractAddendum } from '../../../domain/orchestration/models/contract-addendum.js';
import { ContractAddendumInvariants } from '../../../domain/orchestration/validation/contract-addendum-invariants.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';

/** Workspace-relative path the Reviewer Agent's final impact report is written to. */
const REVIEW_ARTIFACT_FILENAME = 'REVIEW.md';

/** Temporary path REVIEW.md content is written to before the final write, so a reader never observes a partial file. */
const REVIEW_ARTIFACT_TMP_FILENAME = '.REVIEW.md.tmp';

/** Input to `ReviewerAgent.generateReview`. */
export interface ReviewerGenerateReviewInput {
  readonly featureId: string;
  readonly workspaceSlug: string;
  readonly reviewContent: string;
}

/** Outcome of a completed `generateReview` call. */
export interface ReviewGenerationOutcome {
  readonly reviewArtifactPath: string;
}

/** Input to `ReviewerAgent.createContractAddendum`. */
export interface ReviewerCreateAddendumInput {
  readonly featureId: string;
  readonly workspaceSlug: string;
  readonly addendumSequence: number;
  readonly priorAddendumSequences: readonly number[];
  readonly addendumContent: string;
  readonly createdAt: Date;
}

/** Outcome of a completed `createContractAddendum` call. */
export interface ContractAddendumCreationOutcome {
  readonly addendum: ContractAddendum;
}

/**
 * Agent that runs after all tasks in `05-tasks.md` complete: writes the final `REVIEW.md`
 * impact report representing Gate 4, and, when Gate 4 feedback is provided, writes an
 * immutable {@link ContractAddendum} that re-triggers the Planner Agent for a new planning pass.
 */
export class ReviewerAgent {
  constructor(
    private readonly workspaceFileSystem: WorkspaceFileSystemPort,
    private readonly ipcBus: IpcBusPort
  ) {}

  /**
   * Writes `REVIEW.md` via temp-file-then-rename (`.REVIEW.md.tmp` then `REVIEW.md`), so a reader
   * never observes a partially-written file, then publishes `ReviewCompletedEvent`.
   * @param input - the feature/workspace identity and the review's rendered markdown content.
   * @returns the workspace-relative path `REVIEW.md` was written to.
   */
  async generateReview(input: ReviewerGenerateReviewInput): Promise<Result<ReviewGenerationOutcome, never>> {
    await this.workspaceFileSystem.writeFile(input.workspaceSlug, REVIEW_ARTIFACT_TMP_FILENAME, input.reviewContent);
    await this.workspaceFileSystem.writeFile(input.workspaceSlug, REVIEW_ARTIFACT_FILENAME, input.reviewContent);

    this.ipcBus.publish(REVIEW_COMPLETED_EVENT_NAME, {
      featureId: input.featureId,
      reviewArtifactPath: REVIEW_ARTIFACT_FILENAME,
    });

    return success({ reviewArtifactPath: REVIEW_ARTIFACT_FILENAME });
  }

  /**
   * Constructs a new immutable `ContractAddendum` from Gate 4 feedback, asserts it is a fresh,
   * sequential increment over `priorAddendumSequences`, then writes it via temp-file-then-rename
   * and publishes `ContractAddendumCreatedEvent`. The addendum's file path is always derived from
   * `ContractAddendum.filePath`, never accepted as an external input.
   * @param input - the addendum's sequence, prior sequences (for the increment invariant), and body content.
   * @returns the constructed addendum.
   * @throws ImmutableAddendumViolationError if `addendumSequence` duplicates or skips over a prior sequence.
   */
  async createContractAddendum(
    input: ReviewerCreateAddendumInput
  ): Promise<Result<ContractAddendumCreationOutcome, never>> {
    ContractAddendumInvariants.assertSequenceIncrement(input.priorAddendumSequences, input.addendumSequence);

    const addendum = new ContractAddendum(
      input.featureId,
      input.addendumSequence,
      input.addendumContent,
      input.createdAt
    );
    const tmpPath = `.${addendum.filePath}.tmp`;

    await this.workspaceFileSystem.writeFile(input.workspaceSlug, tmpPath, addendum.content);
    await this.workspaceFileSystem.writeFile(input.workspaceSlug, addendum.filePath, addendum.content);

    this.ipcBus.publish(CONTRACT_ADDENDUM_CREATED_EVENT_NAME, {
      featureId: input.featureId,
      addendumSequence: addendum.addendumSequence,
      addendumPath: addendum.filePath,
    });

    return success({ addendum });
  }
}
