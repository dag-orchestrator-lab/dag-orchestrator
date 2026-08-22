import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitAdapter } from '../../infrastructure/process/git-adapter.js';
import type { Prompter } from '../../infrastructure/cli/readline-prompter.js';
import { ExecuteStagePromptUseCase } from '../llm/execute-stage-prompt-use-case.js';
import { PipelineStep } from '../../domain/cli/value-objects/pipeline-step.js';
import { GitWorkingTreeStatus } from '../../domain/cli/value-objects/git-working-tree-status.js';
import { DirtyTreeGuardPolicy } from '../../domain/cli/policies/dirty-tree-guard-policy.js';
import { StepExecutionFailedError } from '../../domain/cli/errors.js';

const execFileAsync = promisify(execFile);

// TODO: confirm legacy retry bound against bin/dag.js's actual auto-heal retry count.
const MAX_AUTO_HEAL_RETRIES = 1;

/** Default base branch used to compute the Step 4 holistic feature-branch diff when `.dag/config.json` omits it. */
const DEFAULT_STACKED_BASE_BRANCH = 'develop';

/** Driving-adapter port for the Pipeline Advancer, implemented by `bin/dag.ts` (see 02-contracts.md §Ports). */
export interface PipelineAdvancer {
  runStep0(): Promise<void>;
  runStep1(): Promise<void>;
  runStep2(): Promise<void>;
  runStep3(): Promise<void>;
  runStep4(): Promise<void>;
}

/** Subset of `.dag/config.json` consumed by the Pipeline Advancer (see Review Impact Analysis constraint). */
export interface PipelineAdvancerConfig {
  readonly STACKED_BASE_BRANCH?: string;
}

/**
 * Extracts the entire holistic feature-branch diff against the stacked base branch, so Step 4 review
 * covers all incrementally-committed atomic tasks rather than only the latest commit.
 * @param cwd - Git working tree to run the diff in.
 * @param baseBranch - Base branch to diff against (`${baseBranch}...HEAD`).
 * @returns The diff text, or an empty string if the diff could not be computed.
 */
async function extractStackedBaseDiff(cwd: string, baseBranch: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', `${baseBranch}...HEAD`], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

/** Coordinates pipeline step execution (`step0`-`step4`) with Git dirty checks and auto-healing retries (see 03-app-infra.md §3.2). */
export class DefaultPipelineAdvancer implements PipelineAdvancer {
  constructor(
    private readonly gitAdapter: GitAdapter,
    private readonly prompter: Prompter,
    private readonly executeStageUseCase: ExecuteStagePromptUseCase,
    private readonly cwd: string = process.cwd(),
    private readonly config: PipelineAdvancerConfig = {},
    private readonly extractGitDiff: (cwd: string, baseBranch: string) => Promise<string> = extractStackedBaseDiff
  ) {}

  async runStep0(): Promise<void> {
    await this.runStep(DefaultPipelineAdvancer.stepOf(0));
  }

  async runStep1(): Promise<void> {
    await this.runStep(DefaultPipelineAdvancer.stepOf(1));
  }

  async runStep2(): Promise<void> {
    await this.runStep(DefaultPipelineAdvancer.stepOf(2));
  }

  async runStep3(): Promise<void> {
    await this.runStep(DefaultPipelineAdvancer.stepOf(3));
  }

  async runStep4(): Promise<void> {
    await this.runStep(DefaultPipelineAdvancer.stepOf(4));
  }

  private static stepOf(value: 0 | 1 | 2 | 3 | 4): PipelineStep {
    const result = PipelineStep.create(value);
    if (result.isErr) {
      throw new Error(`unreachable: PipelineStep.create(${value}) failed`);
    }
    return result.value;
  }

  /**
   * @param step - The pipeline step to execute.
   * @throws {StepExecutionFailedError} If all auto-heal attempts are exhausted without success.
   */
  private async runStep(step: PipelineStep): Promise<void> {
    const stageName = step.toString();

    await this.guardPreStepDirtyTree(stageName);

    const prompt = step.value === 4 ? await this.buildStep4Prompt() : '';

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_AUTO_HEAL_RETRIES; attempt++) {
      try {
        const result = await this.executeStageUseCase.execute(stageName, prompt);
        if (result.isErr) {
          throw new Error(result.error.message);
        }
        await this.reportPostStepDirtyTree(stageName);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new StepExecutionFailedError(step, lastError ?? new Error('Unknown pipeline step failure.'));
  }

  private async buildStep4Prompt(): Promise<string> {
    const baseBranch = this.config.STACKED_BASE_BRANCH ?? DEFAULT_STACKED_BASE_BRANCH;
    return this.extractGitDiff(this.cwd, baseBranch);
  }

  /** Blocks/prompts on a dirty pre-step working tree per `DirtyTreeGuardPolicy` (contract invariant 2). */
  private async guardPreStepDirtyTree(stageName: string): Promise<void> {
    const isClean = await this.gitAdapter.isWorkingTreeClean(this.cwd);
    const status = isClean ? GitWorkingTreeStatus.clean() : GitWorkingTreeStatus.dirty('');
    const validation = DirtyTreeGuardPolicy.validateStepExecution(status);

    if (validation.isOk) {
      return;
    }

    console.warn(`\x1b[33m⚠ Warning: Git working tree has uncommitted changes before ${stageName}.\x1b[0m`);
    const answer = await this.prompter.askQuestion('Proceed anyway? (y/n): ');
    const normalized = answer.trim().toLowerCase();
    if (normalized !== 'y' && normalized !== 'yes') {
      throw new Error(`Execution halted due to uncommitted Git changes prior to ${stageName}.`);
    }
  }

  /** Logs (never blocks) when a step leaves the working tree dirty afterward (contract Failure semantics). */
  private async reportPostStepDirtyTree(stageName: string): Promise<void> {
    const isClean = await this.gitAdapter.isWorkingTreeClean(this.cwd);
    if (!isClean) {
      console.log(`\x1b[33mℹ Note: ${stageName} produced uncommitted changes in Git working directory.\x1b[0m`);
    }
  }
}
