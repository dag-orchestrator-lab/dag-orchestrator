/** Identifies which pipeline stage an AgentContext/event belongs to. */
export type PipelineStageId =
  | 'requirements'
  | 'recon'
  | 'contracts'
  | 'skeptic'
  | 'coder';
