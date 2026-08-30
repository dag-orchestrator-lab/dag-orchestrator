import { describe, it, expect } from 'vitest';
import { ArchitectPromptBuilder } from '../architect-prompt-builder.js';
import type { ContractFeedbackRecord } from '../../../../domain/orchestration/models/contract-feedback-record.js';

describe('ArchitectPromptBuilder', () => {
  it('system prompt lists all required contract sections', () => {
    const prompt = ArchitectPromptBuilder.buildSystemPrompt();
    expect(prompt).toContain('In one paragraph');
    expect(prompt).toContain('Ubiquitous language');
    expect(prompt).toContain('Bounded context');
    expect(prompt).toContain('Aggregates and invariants');
    expect(prompt).toContain('Ports');
    expect(prompt).toContain('Events');
    expect(prompt).toContain('Data');
    expect(prompt).toContain('API surface');
    expect(prompt).toContain('UI/UX & Visual Contract');
    expect(prompt).toContain('Failure semantics');
    expect(prompt).toContain('Non-goals');
  });

  it('system prompt instructs appending an addendum header instead of rewriting prior sections', () => {
    const prompt = ArchitectPromptBuilder.buildSystemPrompt();
    expect(prompt).toContain('## Revision Cycle N Addendum');
    expect(prompt).toContain('DO NOT rewrite the original approved sections silently');
  });

  it('system prompt demands the document be wrapped in a <contract> tag', () => {
    const prompt = ArchitectPromptBuilder.buildSystemPrompt();
    expect(prompt).toContain('<contract>...</contract>');
  });

  it('initial user prompt embeds requirements and recon content and instructs generating 02-contracts.md', () => {
    const prompt = ArchitectPromptBuilder.buildInitialUserPrompt('REQ CONTENT', 'RECON CONTENT');
    expect(prompt).toContain('REQ CONTENT');
    expect(prompt).toContain('RECON CONTENT');
    expect(prompt).toContain('02-contracts.md');
  });

  it('revision user prompt embeds existing contract, serialized feedback, and the latest cycle number', () => {
    const feedback: readonly ContractFeedbackRecord[] = [
      { cycle: 1, raisedAt: '2026-01-01T00:00:00.000Z', findings: [] },
      { cycle: 2, raisedAt: '2026-01-02T00:00:00.000Z', findings: [] },
    ];
    const prompt = ArchitectPromptBuilder.buildRevisionUserPrompt('EXISTING CONTRACT', feedback);
    expect(prompt).toContain('EXISTING CONTRACT');
    expect(prompt).toContain('"cycle": 2');
    expect(prompt).toContain('cycle 2');
  });
});
