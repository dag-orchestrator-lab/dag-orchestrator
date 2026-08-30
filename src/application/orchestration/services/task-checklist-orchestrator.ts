import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import { extractXmlBlock } from '../../../domain/orchestration/utils/llm-response-extractor.js';
import {
  verifyTaskChecklist,
  type TaskChecklistVerificationResult,
} from '../../../domain/orchestration/validation/pre-flight-verifier.js';
import { PlannerPromptBuilder } from '../../../infrastructure/orchestration/prompts/planner-prompt-builder.js';

const CHECKLIST_TAG = 'checklist';

/** Final checklist text together with the pre-flight verification result it was resolved against. */
export interface TaskChecklistResolution {
  readonly checklist: string;
  readonly verification: TaskChecklistVerificationResult;
}

/**
 * Resolves the merged task checklist produced by the Planner Agent's merge step: extracts the
 * `<checklist>` block, runs pre-flight verification, and auto-heals it at most once (contract
 * Invariant 3) if verification fails.
 */
export class TaskChecklistOrchestrator {
  constructor(private readonly llmClient: LlmClientPort) {}

  /**
   * @param mergedTasksResponse Raw LLM completion from the merge step, containing a `<checklist>` block.
   * @returns The resolved checklist text and its final pre-flight verification result.
   * @throws LlmResponseExtractionError if no `<checklist>` block can be extracted from either
   *   the merge response or the auto-heal response.
   */
  async resolve(mergedTasksResponse: string): Promise<TaskChecklistResolution> {
    const checklist = extractXmlBlock(mergedTasksResponse, CHECKLIST_TAG);
    const verification = verifyTaskChecklist(checklist);

    if (verification.isValid) {
      return { checklist, verification };
    }

    const healPrompt = PlannerPromptBuilder.buildAutoHealPrompt(checklist, verification.missingFieldTaskTitles);
    const rawHealResponse = await this.llmClient.complete({ systemPrompt: '', userPrompt: healPrompt });
    const healedChecklist = extractXmlBlock(rawHealResponse, CHECKLIST_TAG);

    return { checklist: healedChecklist, verification: verifyTaskChecklist(healedChecklist) };
  }
}
