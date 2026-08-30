/** Bus name published when the Reviewer Agent finishes writing `REVIEW.md`. */
export const REVIEW_COMPLETED_EVENT_NAME = 'reviewer.review.completed';

/** Bus name published when the Reviewer Agent writes a new contract addendum from Gate 4 feedback. */
export const CONTRACT_ADDENDUM_CREATED_EVENT_NAME = 'reviewer.addendum.created';

/** Published when the Reviewer Agent has written the final `REVIEW.md` artifact. */
export interface ReviewCompletedEvent {
  readonly featureId: string;
  readonly reviewArtifactPath: string;
}

/** Published when the Reviewer Agent writes an immutable contract addendum from Gate 4 feedback. */
export interface ContractAddendumCreatedEvent {
  readonly featureId: string;
  readonly addendumSequence: number;
  readonly addendumPath: string;
}
