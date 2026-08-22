/** Driving-adapter port for the Pipeline Advancer, implemented by `bin/dag.ts` (see 02-contracts.md §Ports). */
export interface PipelineAdvancer {
  runStep0(): Promise<void>;
  runStep1(): Promise<void>;
  runStep2(): Promise<void>;
  runStep3(): Promise<void>;
  runStep4(): Promise<void>;
}
