/** Identifies which architectural layer plan a layer-plan prompt is being built for. */
export type PlannerLayer = 'domain' | 'app-infra' | 'data';

const LAYER_DESCRIPTIONS: Record<PlannerLayer, string> = {
  domain: 'the domain layer (core entities, value objects, domain services, invariants)',
  'app-infra': 'the application/infrastructure layer (use cases, adapters, ports, CLI/API wiring)',
  data: 'the data layer (persistence, migrations, storage adapters, data access)',
};

/** Builds the prompts the Planner Agent sends to the LLM to produce layer plans, findings, and the merged task checklist. */
export class PlannerPromptBuilder {
  /**
   * Builds the prompt asking the LLM what work is needed in a single architectural layer.
   * @param layer Which of the three layer plans to produce.
   * @param contractsContent The frozen contract document (02-contracts.md).
   * @param reconContent The reconnaissance report (01-recon.md).
   * @returns The composed prompt instructing the LLM to wrap its answer in `<layer_plan>` tags.
   */
  static buildLayerPrompt(layer: PlannerLayer, contractsContent: string, reconContent: string): string {
    return `You are the Planner Sub-Agent. Your task is to determine what work is needed in ${LAYER_DESCRIPTIONS[layer]} to implement the feature described by the contracts and recon report below.

### Frozen Contract (02-contracts.md)
${contractsContent}

### Reconnaissance Report (01-recon.md)
${reconContent}

Analyze only the ${layer} layer's concerns. Do not describe work belonging to other layers.
Output ONLY your analysis, wrapped in a single <layer_plan>...</layer_plan> tag. No conversational preamble or trailer outside the tag.`;
  }

  /**
   * Builds the prompt asking the LLM to adversarially review the three layer plans together.
   * @param domainPlan Content of 03-domain.md.
   * @param appInfraPlan Content of 03-app-infra.md.
   * @param dataPlan Content of 03-data.md.
   * @returns The composed prompt instructing the LLM to wrap its answer in `<findings>` tags.
   */
  static buildFindingsPrompt(domainPlan: string, appInfraPlan: string, dataPlan: string): string {
    return `You are the Planner Sub-Agent. Your task is to adversarially review the three layer plans below and flag contradictions, gaps, or double-covered work between them.

### Domain Layer Plan (03-domain.md)
${domainPlan}

### App/Infra Layer Plan (03-app-infra.md)
${appInfraPlan}

### Data Layer Plan (03-data.md)
${dataPlan}

Identify every conflict, gap, or overlap across the three plans.
Output ONLY your findings, wrapped in a single <findings>...</findings> tag. No conversational preamble or trailer outside the tag.`;
  }

  /**
   * Builds the prompt asking the LLM to merge the three layer plans and findings into one task checklist.
   * @param domainPlan Content of 03-domain.md.
   * @param appInfraPlan Content of 03-app-infra.md.
   * @param dataPlan Content of 03-data.md.
   * @param findings Content of 04-layer-findings.md.
   * @returns The composed prompt instructing the LLM to wrap its answer in `<checklist>` tags.
   */
  static buildMergePrompt(domainPlan: string, appInfraPlan: string, dataPlan: string, findings: string): string {
    return `You are the Planner Sub-Agent. Your task is to merge the three layer plans and the adversarial findings below into a single executable task checklist (05-tasks.md).

### Domain Layer Plan (03-domain.md)
${domainPlan}

### App/Infra Layer Plan (03-app-infra.md)
${appInfraPlan}

### Data Layer Plan (03-data.md)
${dataPlan}

### Layer Findings (04-layer-findings.md)
${findings}

Every task you emit MUST trace to content present in at least one of the three layer plans or the findings above. Do not invent net-new task scope.
Each task MUST use the format '### [ ] T-X <title>' and include Depends on:, Lane:, Files:, Done when:, and Check: (with a concrete verification command).
Output ONLY the markdown checklist, wrapped in a single <checklist>...</checklist> tag. No conversational preamble or trailer outside the tag.`;
  }

  /**
   * Builds the prompt asking the LLM to inject missing `Files:`/`Check:` fields into a checklist that failed pre-flight verification.
   * @param checklist The current, invalid content of 05-tasks.md.
   * @param missingFieldTaskTitles Titles of tasks that are missing a `Files:` and/or `Check:` field.
   * @returns The composed prompt instructing the LLM to wrap its corrected answer in `<checklist>` tags.
   */
  static buildAutoHealPrompt(checklist: string, missingFieldTaskTitles: readonly string[]): string {
    return `You are the Planner Sub-Agent. The task checklist below (05-tasks.md) failed pre-flight verification: the following tasks are missing a 'Files:' and/or 'Check:' field: ${missingFieldTaskTitles.join(', ')}.

### Current Checklist (05-tasks.md)
${checklist}

Inject the missing 'Files:' and/or 'Check:' fields into exactly those tasks. Do not alter any other task's intent, scope, or the tasks that already pass verification.
Output ONLY the corrected markdown checklist, wrapped in a single <checklist>...</checklist> tag. No conversational preamble or trailer outside the tag.`;
  }
}
