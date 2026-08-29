import { describe, it, expect } from 'vitest';
import { ReconPromptBuilder } from '../recon-prompt-builder.js';

describe('ReconPromptBuilder', () => {
  it('system prompt lists all 6 reconnaissance sections', () => {
    const prompt = ReconPromptBuilder.buildSystemPrompt();
    expect(prompt).toContain('Which bounded context owns this?');
    expect(prompt).toContain('What is the closest existing feature in this repo?');
    expect(prompt).toContain('Which shared packages already solve part of this?');
    expect(prompt).toContain('What conventions apply?');
    expect(prompt).toContain('What is genuinely absent?');
    expect(prompt).toContain('What could not be determined from the code alone?');
  });

  it('user prompt embeds requirements and codebase summary and instructs producing 01-recon.md', () => {
    const prompt = ReconPromptBuilder.buildUserPrompt('REQ CONTENT', 'CODE SUMMARY');
    expect(prompt).toContain('REQ CONTENT');
    expect(prompt).toContain('CODE SUMMARY');
    expect(prompt).toContain('01-recon.md');
  });
});
