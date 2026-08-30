import { SubAgentBase } from '../sub-agent-base.js';
import type { AgentRole } from '../../../domain/orchestration/models/agent-role.js';
import type { AgentContext } from '../../../domain/orchestration/models/agent-context.js';
import type { AgentResult } from '../../../domain/orchestration/models/agent-result.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import type { PlannerStageName } from '../../../domain/orchestration/events/event-map.js';
import { AgentExecutionError } from '../../../domain/orchestration/errors/agent-execution-error.js';
import { LlmResponseExtractionError } from '../../../domain/orchestration/errors/llm-response-extraction-error.js';
import { extractXmlBlock } from '../../../domain/orchestration/utils/llm-response-extractor.js';
import { ParallelLayerPlanningService } from '../../../application/orchestration/services/parallel-layer-planning-service.js';
import { TaskChecklistOrchestrator } from '../../../application/orchestration/services/task-checklist-orchestrator.js';
import { PlannerPromptBuilder } from '../prompts/planner-prompt-builder.js';

export const PLANNER_DOMAIN_ARTIFACT_FILENAME = '03-domain.md';
export const PLANNER_APP_INFRA_ARTIFACT_FILENAME = '03-app-infra.md';
export const PLANNER_DATA_ARTIFACT_FILENAME = '03-data.md';
export const PLANNER_FINDINGS_ARTIFACT_FILENAME = '04-layer-findings.md';
export const PLANNER_CHECKLIST_ARTIFACT_FILENAME = '05-tasks.md';

const FINDINGS_TAG = 'findings';

/**
 * Sub-Agent that plans a feature's implementation: produces the three layer plans in parallel,
 * adversarially reviews them for findings, merges the result into a task checklist, pre-flight
 * verifies it (auto-healing at most once), and publishes STAGE_COMPLETE for each of the five
 * artifacts as they land durably on the workspace.
 */
export class PlannerAgent extends SubAgentBase {
  readonly role: AgentRole = 'planner';

  private readonly layerPlanningService: ParallelLayerPlanningService;
  private readonly taskChecklistOrchestrator: TaskChecklistOrchestrator;

  constructor(
    ipcBus: IpcBusPort,
    private readonly workspaceFileSystem: WorkspaceFileSystemPort,
    private readonly llmClient: LlmClientPort
  ) {
    super(ipcBus);
    this.layerPlanningService = new ParallelLayerPlanningService(llmClient);
    this.taskChecklistOrchestrator = new TaskChecklistOrchestrator(llmClient);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { contractsContent, reconContent } = await this.readUpstreamArtifacts(context);

    const layerPlans = await this.layerPlanningService.planLayers(contractsContent, reconContent);

    await this.writeAndAnnounce(context, PLANNER_DOMAIN_ARTIFACT_FILENAME, layerPlans.domain, '03-domain');
    await this.writeAndAnnounce(context, PLANNER_APP_INFRA_ARTIFACT_FILENAME, layerPlans.appInfra, '03-app-infra');
    await this.writeAndAnnounce(context, PLANNER_DATA_ARTIFACT_FILENAME, layerPlans.data, '03-data');

    const findings = await this.generateFindings(context, layerPlans);
    await this.writeAndAnnounce(context, PLANNER_FINDINGS_ARTIFACT_FILENAME, findings, '04-layer-findings');

    const checklist = await this.generateChecklist(context, layerPlans, findings);
    await this.writeAndAnnounce(context, PLANNER_CHECKLIST_ARTIFACT_FILENAME, checklist, '05-tasks');

    return {
      role: this.role,
      artifactPath: PLANNER_CHECKLIST_ARTIFACT_FILENAME,
      artifactsProduced: [
        PLANNER_DOMAIN_ARTIFACT_FILENAME,
        PLANNER_APP_INFRA_ARTIFACT_FILENAME,
        PLANNER_DATA_ARTIFACT_FILENAME,
        PLANNER_FINDINGS_ARTIFACT_FILENAME,
        PLANNER_CHECKLIST_ARTIFACT_FILENAME,
      ],
      status: 'COMPLETED',
    };
  }

  private async readUpstreamArtifacts(
    context: AgentContext
  ): Promise<{ contractsContent: string; reconContent: string }> {
    if (!context.contractsPath) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        'contractsPath is required to plan a feature'
      );
    }
    if (!context.reconPath) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        'reconPath is required to plan a feature'
      );
    }

    const contractsExist = await this.workspaceFileSystem.fileExists(context.workspaceSlug, context.contractsPath);
    if (!contractsExist) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        `referenced contract file not found at ${context.contractsPath}`
      );
    }

    const reconExists = await this.workspaceFileSystem.fileExists(context.workspaceSlug, context.reconPath);
    if (!reconExists) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        `referenced recon file not found at ${context.reconPath}`
      );
    }

    try {
      const [contractsContent, reconContent] = await Promise.all([
        this.workspaceFileSystem.readFile(context.workspaceSlug, context.contractsPath),
        this.workspaceFileSystem.readFile(context.workspaceSlug, context.reconPath),
      ]);
      return { contractsContent, reconContent };
    } catch (cause) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        'failed to read contract or recon artifacts',
        cause
      );
    }
  }

  private async generateFindings(
    context: AgentContext,
    layerPlans: { domain: string; appInfra: string; data: string }
  ): Promise<string> {
    const userPrompt = PlannerPromptBuilder.buildFindingsPrompt(
      layerPlans.domain,
      layerPlans.appInfra,
      layerPlans.data
    );
    const rawResponse = await this.llmClient.complete({ systemPrompt: '', userPrompt });

    try {
      return extractXmlBlock(rawResponse, FINDINGS_TAG);
    } catch (cause) {
      if (cause instanceof LlmResponseExtractionError) {
        throw new AgentExecutionError(
          this.role,
          context.workspaceSlug,
          undefined,
          'LLM response did not contain a <findings> block',
          cause
        );
      }
      throw cause;
    }
  }

  private async generateChecklist(
    context: AgentContext,
    layerPlans: { domain: string; appInfra: string; data: string },
    findings: string
  ): Promise<string> {
    const userPrompt = PlannerPromptBuilder.buildMergePrompt(
      layerPlans.domain,
      layerPlans.appInfra,
      layerPlans.data,
      findings
    );
    const rawResponse = await this.llmClient.complete({ systemPrompt: '', userPrompt });

    const resolution = await this.taskChecklistOrchestrator.resolve(rawResponse);
    if (!resolution.verification.isValid) {
      throw new AgentExecutionError(
        this.role,
        context.workspaceSlug,
        undefined,
        `task checklist failed pre-flight verification after auto-heal: missing Files:/Check: on ${resolution.verification.missingFieldTaskTitles.join(', ')}`
      );
    }

    return resolution.checklist;
  }

  private async writeAndAnnounce(
    context: AgentContext,
    artifactPath: string,
    content: string,
    stageName: PlannerStageName
  ): Promise<void> {
    await this.workspaceFileSystem.writeFile(context.workspaceSlug, artifactPath, content);

    this.publishStageComplete({
      role: this.role,
      workspaceSlug: context.workspaceSlug,
      artifactPath,
      timestamp: new Date().toISOString(),
      stageName,
    } as any);
  }
}
