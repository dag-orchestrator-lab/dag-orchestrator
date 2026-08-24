import type { Result } from '../../common/result.js';
import type { AgentExecutionError } from '../errors/agent-execution-error.js';
import type { PipelineStageId } from './pipeline-stage-id.js';

/** The success payload a Sub-Agent returns from execute() upon producing an artifact. */
export interface AgentSuccessPayload {
  readonly stageId: PipelineStageId;
  readonly producedArtifactPath: string;
}

/** The outcome of a Sub-Agent's execute(): always exactly one of success or failure (Invariant 3). */
export type AgentResult = Result<AgentSuccessPayload, AgentExecutionError>;
