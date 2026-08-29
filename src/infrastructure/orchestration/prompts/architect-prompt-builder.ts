import type { ContractFeedbackRecord } from '../../../domain/orchestration/models/contract-feedback-record.js';

/** Builds the system/user prompts the Architect Agent sends to the LLM to draft or revise 02-contracts.md. */
export class ArchitectPromptBuilder {
  static buildSystemPrompt(): string {
    return `You are the Architect Sub-Agent. Your task is to draft or revise the technical design contract (02-contracts.md).
The document must strictly contain the standard contract sections:
- In one paragraph
- Ubiquitous language
- Bounded context
- Aggregates and invariants
- Ports
- Events
- Data
- API surface
- UI/UX & Visual Contract
- Failure semantics
- Non-goals

When revising an existing contract in response to feedback, DO NOT rewrite the original approved sections silently. Append an explicit addendum header: "## Revision Cycle N Addendum" addressing each BLOCKER and WARNING finding raised by the Skeptic.`;
  }

  static buildInitialUserPrompt(requirementsContent: string, reconContent: string): string {
    return `### Feature Requirements (00-requirements.md)
${requirementsContent}

### Reconnaissance Report (01-recon.md)
${reconContent}

Please generate the initial 02-contracts.md document.`;
  }

  static buildRevisionUserPrompt(
    existingContractContent: string,
    pendingFeedback: readonly ContractFeedbackRecord[]
  ): string {
    const serializedFeedback = JSON.stringify(pendingFeedback, null, 2);
    return `### Existing Contract (02-contracts.md)
${existingContractContent}

### Pending Feedback Records
${serializedFeedback}

Produce the updated 02-contracts.md document with the appropriate Revision Addendum appended. Ensure all BLOCKER findings from cycle ${pendingFeedback[pendingFeedback.length - 1].cycle} are explicitly addressed.`;
  }
}
