import { describe, it, expect } from 'vitest';
import { PlannerPromptBuilder } from '../planner-prompt-builder.js';

describe('PlannerPromptBuilder', () => {
  it('buildLayerPrompt embeds contract and recon content and instructs <layer_plan> wrapping', () => {
    const prompt = PlannerPromptBuilder.buildLayerPrompt('domain', 'CONTRACT CONTENT', 'RECON CONTENT');
    expect(prompt).toContain('CONTRACT CONTENT');
    expect(prompt).toContain('RECON CONTENT');
    expect(prompt).toContain('<layer_plan>...</layer_plan>');
  });

  it('buildLayerPrompt scopes the prompt to the requested layer', () => {
    const domainPrompt = PlannerPromptBuilder.buildLayerPrompt('app-infra', 'C', 'R');
    expect(domainPrompt).toContain('application/infrastructure layer');
  });

  it('buildFindingsPrompt embeds all three layer plans and instructs <findings> wrapping', () => {
    const prompt = PlannerPromptBuilder.buildFindingsPrompt('DOMAIN PLAN', 'APP INFRA PLAN', 'DATA PLAN');
    expect(prompt).toContain('DOMAIN PLAN');
    expect(prompt).toContain('APP INFRA PLAN');
    expect(prompt).toContain('DATA PLAN');
    expect(prompt).toContain('<findings>...</findings>');
  });

  it('buildMergePrompt embeds all layer plans and findings, enforces traceability, and instructs <checklist> wrapping', () => {
    const prompt = PlannerPromptBuilder.buildMergePrompt('DOMAIN PLAN', 'APP INFRA PLAN', 'DATA PLAN', 'FINDINGS');
    expect(prompt).toContain('DOMAIN PLAN');
    expect(prompt).toContain('APP INFRA PLAN');
    expect(prompt).toContain('DATA PLAN');
    expect(prompt).toContain('FINDINGS');
    expect(prompt).toContain('Do not invent net-new task scope');
    expect(prompt).toContain('<checklist>...</checklist>');
  });

  it('buildMergePrompt requires the standard task field format', () => {
    const prompt = PlannerPromptBuilder.buildMergePrompt('D', 'A', 'X', 'F');
    expect(prompt).toContain("### [ ] T-X <title>");
    expect(prompt).toContain('Depends on:');
    expect(prompt).toContain('Files:');
    expect(prompt).toContain('Check:');
  });

  it('buildAutoHealPrompt embeds the checklist, the missing-field task titles, and instructs <checklist> wrapping', () => {
    const prompt = PlannerPromptBuilder.buildAutoHealPrompt('CHECKLIST CONTENT', ['T-2 Build widget', 'T-5 Wire adapter']);
    expect(prompt).toContain('CHECKLIST CONTENT');
    expect(prompt).toContain('T-2 Build widget');
    expect(prompt).toContain('T-5 Wire adapter');
    expect(prompt).toContain('<checklist>...</checklist>');
  });
});
