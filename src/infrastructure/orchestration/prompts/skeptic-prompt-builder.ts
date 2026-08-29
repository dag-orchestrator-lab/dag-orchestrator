/** Builds the system/user prompts the Skeptic Agent sends to the LLM to adversarially audit 02-contracts.md. */
export class SkepticPromptBuilder {
  static buildSystemPrompt(): string {
    return `You are the Skeptic Sub-Agent. Your task is to perform an adversarial audit on 02-contracts.md.
You MUST output your decision as a valid JSON object matching this schema:
{
  "verdict": "APPROVED" | "REJECTED",
  "findings": [
    {
      "section": string,
      "issue": string,
      "severity": "BLOCKER" | "WARNING"
    }
  ]
}

Rules:
1. If there is ANY finding with severity "BLOCKER", the verdict MUST be "REJECTED".
2. If the verdict is "APPROVED", the findings array MAY contain warnings, but MUST NOT contain any BLOCKER severity issues.
3. If the verdict is "REJECTED", the findings array MUST NOT be empty and MUST contain at least one BLOCKER issue.
4. Output ONLY valid JSON. No markdown codeblock fences, no conversational preamble.`;
  }

  static buildUserPrompt(contractContent: string, cycleNumber: number): string {
    return `### Contract to Audit (Cycle ${cycleNumber})
${contractContent}`;
  }
}
