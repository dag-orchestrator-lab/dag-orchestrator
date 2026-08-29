import { describe, it, expect } from 'vitest';
import { SkepticPromptBuilder } from '../skeptic-prompt-builder.js';

describe('SkepticPromptBuilder', () => {
  it('system prompt enforces the JSON verdict/findings schema', () => {
    const prompt = SkepticPromptBuilder.buildSystemPrompt();
    expect(prompt).toContain('"verdict": "APPROVED" | "REJECTED"');
    expect(prompt).toContain('"findings"');
    expect(prompt).toContain('"section"');
    expect(prompt).toContain('"issue"');
    expect(prompt).toContain('"severity": "BLOCKER" | "WARNING"');
  });

  it('system prompt enforces the BLOCKER present implies REJECTED rule', () => {
    const prompt = SkepticPromptBuilder.buildSystemPrompt();
    expect(prompt).toContain('If there is ANY finding with severity "BLOCKER", the verdict MUST be "REJECTED"');
  });

  it('system prompt instructs JSON-only output with no markdown fences or preamble', () => {
    const prompt = SkepticPromptBuilder.buildSystemPrompt();
    expect(prompt).toContain('Output ONLY valid JSON');
    expect(prompt).toContain('No markdown codeblock fences');
  });

  it('user prompt embeds contract content and the cycle number', () => {
    const prompt = SkepticPromptBuilder.buildUserPrompt('CONTRACT CONTENT', 3);
    expect(prompt).toContain('CONTRACT CONTENT');
    expect(prompt).toContain('Cycle 3');
  });
});
