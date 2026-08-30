import { describe, it, expect, vi } from 'vitest';
import { TaskChecklistOrchestrator } from '../task-checklist-orchestrator.js';
import { LlmResponseExtractionError } from '../../../../domain/orchestration/errors/llm-response-extraction-error.js';
import type { LlmClientPort } from '../../../../domain/orchestration/ports/llm-client-port.js';

function createLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    complete: vi.fn(async () => '<checklist>healed</checklist>'),
    ...overrides,
  };
}

const validTask = `### [ ] T-1 Do the thing
Depends on: none
Lane: change
Files: src/foo.ts
Done when: it works.
Check: npm test -- src/foo.test.ts`;

const taskMissingFields = `### [ ] T-1 Do the thing
Depends on: none
Lane: change
Done when: it works.
`;

describe('TaskChecklistOrchestrator', () => {
  it('extracts the checklist and returns it unchanged when pre-flight verification passes', async () => {
    const llmClient = createLlmClient();
    const orchestrator = new TaskChecklistOrchestrator(llmClient);

    const result = await orchestrator.resolve(`<checklist>${validTask}</checklist>`);

    expect(result.checklist).toBe(validTask);
    expect(result.verification.isValid).toBe(true);
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it('makes exactly one auto-heal call when pre-flight verification fails, then re-extracts', async () => {
    const llmClient = createLlmClient({
      complete: vi.fn(async () => `<checklist>${validTask}</checklist>`),
    });
    const orchestrator = new TaskChecklistOrchestrator(llmClient);

    const result = await orchestrator.resolve(`<checklist>${taskMissingFields}</checklist>`);

    expect(llmClient.complete).toHaveBeenCalledTimes(1);
    expect(result.checklist).toBe(validTask);
    expect(result.verification.isValid).toBe(true);
  });

  it('returns an invalid verification result without looping when the healed checklist still fails', async () => {
    const llmClient = createLlmClient({
      complete: vi.fn(async () => `<checklist>${taskMissingFields}</checklist>`),
    });
    const orchestrator = new TaskChecklistOrchestrator(llmClient);

    const result = await orchestrator.resolve(`<checklist>${taskMissingFields}</checklist>`);

    expect(llmClient.complete).toHaveBeenCalledTimes(1);
    expect(result.verification.isValid).toBe(false);
    expect(result.verification.missingFieldTaskTitles).toContain('T-1 Do the thing');
  });

  it('propagates LlmResponseExtractionError when the merged tasks text has no <checklist> block', async () => {
    const orchestrator = new TaskChecklistOrchestrator(createLlmClient());

    await expect(orchestrator.resolve('no checklist here')).rejects.toBeInstanceOf(LlmResponseExtractionError);
  });
});
