/** Builds the system/user prompts the Recon Agent sends to the LLM to produce 01-recon.md. */
export class ReconPromptBuilder {
  static buildSystemPrompt(): string {
    return `You are the Recon Sub-Agent. Your task is to analyze feature requirements and perform reconnaissance on the codebase.
You MUST output a single Markdown document conforming exactly to the 6 reconnaissance sections:
1. Which bounded context owns this?
2. What is the closest existing feature in this repo?
3. Which shared packages already solve part of this?
4. What conventions apply?
5. What is genuinely absent?
6. What could not be determined from the code alone?`;
  }

  static buildUserPrompt(requirementsContent: string, codeContextSummary: string): string {
    return `### Feature Requirements (00-requirements.md)
${requirementsContent}

### Codebase Inspection Summary
${codeContextSummary}

Please construct the complete 01-recon.md file based on the analysis above.`;
  }
}
