import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import { extractXmlBlock } from '../../../domain/orchestration/utils/llm-response-extractor.js';
import { PlannerPromptBuilder, type PlannerLayer } from '../../../infrastructure/orchestration/prompts/planner-prompt-builder.js';

const LAYER_PLAN_TAG = 'layer_plan';
const PLANNER_LAYERS: readonly PlannerLayer[] = ['domain', 'app-infra', 'data'];

/** The three independently-produced layer plans, keyed by layer. */
export interface LayerPlanResults {
  readonly domain: string;
  readonly appInfra: string;
  readonly data: string;
}

/**
 * Runs the three layer-plan LLM calls (domain, app-infra, data) concurrently and extracts each
 * `<layer_plan>` block. Per contract Invariant 4, none of the three calls may use another's
 * output as input; per Invariant 4's failure semantics, if any call rejects the whole batch
 * fails fast via `Promise.all` and no layer plan is returned.
 */
export class ParallelLayerPlanningService {
  constructor(private readonly llmClient: LlmClientPort) {}

  /**
   * @param contractsContent The frozen contract document (02-contracts.md).
   * @param reconContent The reconnaissance report (01-recon.md).
   * @returns The three extracted layer plans.
   * @throws LlmResponseExtractionError if any layer response is missing its `<layer_plan>` block.
   */
  async planLayers(contractsContent: string, reconContent: string): Promise<LayerPlanResults> {
    const [domain, appInfra, data] = await Promise.all(
      PLANNER_LAYERS.map((layer) => this.planLayer(layer, contractsContent, reconContent))
    );

    return { domain, appInfra, data };
  }

  private async planLayer(layer: PlannerLayer, contractsContent: string, reconContent: string): Promise<string> {
    const userPrompt = PlannerPromptBuilder.buildLayerPrompt(layer, contractsContent, reconContent);
    const rawResponse = await this.llmClient.complete({ systemPrompt: '', userPrompt });
    return extractXmlBlock(rawResponse, LAYER_PLAN_TAG);
  }
}
