import type { PipelineStep } from './pipeline-step.js';

export type CommandType =
  | 'init'
  | 'doctor'
  | 'features'
  | 'plan'
  | 'new'
  | 'archive'
  | 'rollback'
  | 'config'
  | 'step'
  | 'unknown';

/** Encapsulates raw command-line input parsed into a recognized execution target. */
export class CliCommand {
  private constructor(
    public readonly type: CommandType,
    public readonly targetName?: string,
    public readonly step?: PipelineStep,
    public readonly rawArgs: string[] = []
  ) {
    Object.freeze(this);
  }

  public static create(
    type: CommandType,
    targetName?: string,
    step?: PipelineStep,
    rawArgs: string[] = []
  ): CliCommand {
    return new CliCommand(type, targetName, step, rawArgs);
  }

  public isPipelineStep(): boolean {
    return this.type === 'step' && this.step !== undefined;
  }

  public requiresAutoParkCheck(): boolean {
    return this.type === 'plan' || this.type === 'new';
  }
}
