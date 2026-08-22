import { FeatureWorkspace } from '../aggregates/feature-workspace.js';

export interface PipelineStageStatus {
  stageName: string;
  index: number;
  isComplete: boolean;
  requiredGates: string[];
  passedGates: string[];
}

export interface FeaturePipelineStatus {
  slug: string;
  overallComplete: boolean;
  stages: PipelineStageStatus[];
}

/** Evaluates composite pipeline status across all stages without modifying persistent state. */
export class PipelineEvaluator {
  public static evaluateStatus(workspace: FeatureWorkspace): FeaturePipelineStatus {
    const approvals = workspace.approvals;
    const passedGateNames = new Set(approvals.map((a) => a.gateName));

    const stageStatuses: PipelineStageStatus[] = workspace.stages.map((stage, index) => {
      const isComplete = stage.isComplete(approvals);
      return {
        stageName: stage.name,
        index,
        isComplete,
        requiredGates: [...stage.requiredGates],
        passedGates: stage.requiredGates.filter((g) => passedGateNames.has(g)),
      };
    });

    const overallComplete = stageStatuses.length > 0 && stageStatuses.every((s) => s.isComplete);

    return {
      slug: workspace.slug.value,
      overallComplete,
      stages: stageStatuses,
    };
  }
}
