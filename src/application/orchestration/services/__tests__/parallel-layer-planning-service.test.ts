import { describe, it, expect, vi } from 'vitest';
import { ParallelLayerPlanningService } from '../parallel-layer-planning-service.js';
import { LlmResponseExtractionError } from '../../../../domain/orchestration/errors/llm-response-extraction-error.js';
import type { LlmClientPort, LlmCompletionOptions } from '../../../../domain/orchestration/ports/llm-client-port.js';

function createLlmClient(complete: LlmClientPort['complete']): LlmClientPort {
  return { complete };
}

describe('ParallelLayerPlanningService', () => {
  it('issues three concurrent calls and extracts each <layer_plan> block', async () => {
    const seenPrompts: string[] = [];
    const llmClient = createLlmClient(async (options: LlmCompletionOptions) => {
      seenPrompts.push(options.userPrompt);
      if (options.userPrompt.includes('domain layer')) return '<layer_plan>domain work</layer_plan>';
      if (options.userPrompt.includes('application/infrastructure layer')) return '<layer_plan>app-infra work</layer_plan>';
      return '<layer_plan>data work</layer_plan>';
    });
    const service = new ParallelLayerPlanningService(llmClient);

    const result = await service.planLayers('contracts content', 'recon content');

    expect(result).toEqual({ domain: 'domain work', appInfra: 'app-infra work', data: 'data work' });
    expect(seenPrompts).toHaveLength(3);
  });

  it('does not start any call using another layer call\'s output', async () => {
    const startedBeforeAnyResolved: boolean[] = [];
    let resolvedCount = 0;
    const llmClient = createLlmClient(async () => {
      startedBeforeAnyResolved.push(resolvedCount === 0);
      await new Promise((resolve) => setTimeout(resolve, 0));
      resolvedCount += 1;
      return '<layer_plan>plan</layer_plan>';
    });
    const service = new ParallelLayerPlanningService(llmClient);

    await service.planLayers('contracts content', 'recon content');

    expect(startedBeforeAnyResolved).toEqual([true, true, true]);
  });

  it('fails fast: rejects as soon as any one of the three calls rejects', async () => {
    const llmClient = createLlmClient(async (options: LlmCompletionOptions) => {
      if (options.userPrompt.includes('data layer')) {
        throw new Error('provider failure');
      }
      return '<layer_plan>plan</layer_plan>';
    });
    const service = new ParallelLayerPlanningService(llmClient);

    await expect(service.planLayers('contracts content', 'recon content')).rejects.toThrow('provider failure');
  });

  it('does not produce an unhandled rejection when one call rejects and others are still pending', async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      const llmClient = createLlmClient(async (options: LlmCompletionOptions) => {
        if (options.userPrompt.includes('domain layer')) {
          throw new Error('domain failed');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        return '<layer_plan>plan</layer_plan>';
      });
      const service = new ParallelLayerPlanningService(llmClient);

      await expect(service.planLayers('contracts content', 'recon content')).rejects.toThrow('domain failed');
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(unhandledRejections).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('propagates LlmResponseExtractionError when a layer response is missing its <layer_plan> block', async () => {
    const llmClient = createLlmClient(vi.fn(async () => 'no tag here'));
    const service = new ParallelLayerPlanningService(llmClient);

    await expect(service.planLayers('contracts content', 'recon content')).rejects.toBeInstanceOf(
      LlmResponseExtractionError
    );
  });
});
