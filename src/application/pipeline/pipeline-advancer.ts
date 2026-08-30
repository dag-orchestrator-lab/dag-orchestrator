import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitAdapter } from '../../infrastructure/process/git-adapter.js';
import type { Prompter } from '../../infrastructure/cli/readline-prompter.js';
import { ExecuteStagePromptUseCase } from '../llm/execute-stage-prompt-use-case.js';
import { PipelineStep } from '../../domain/cli/value-objects/pipeline-step.js';
import { GitWorkingTreeStatus } from '../../domain/cli/value-objects/git-working-tree-status.js';
import { DirtyTreeGuardPolicy } from '../../domain/cli/policies/dirty-tree-guard-policy.js';
import { StepExecutionFailedError } from '../../domain/cli/errors.js';
import { LlmNetworkTimeoutError } from '../../domain/llm/errors/llm-network-timeout-error.js';
import type { SwarmAgentStage } from '../../domain/orchestration/models/pipeline-stage-types.js';
import { TaskExecutionAttempt } from '../../domain/orchestration/models/task-execution-attempt.js';
import { TaskAttemptInvariants } from '../../domain/orchestration/validation/task-attempt-invariants.js';
import { PipelineStageInvariants } from '../../domain/orchestration/validation/pipeline-stage-invariants.js';
import { TaskAttemptLimitExceededError } from '../../domain/orchestration/errors/task-attempt-limit-error.js';
import { MAX_FIXER_RETRIES, type VerifyConfiguration } from '../../domain/orchestration/models/verify-command.js';
import type { SubprocessExecutionResult } from '../../domain/orchestration/models/subprocess-command.js';
import { FIXER_RETRIES_EXHAUSTED_EVENT_NAME } from '../../domain/orchestration/events/fixer-events.js';
import { GATE4_PAUSED_EVENT_NAME } from '../../domain/orchestration/events/pipeline-events.js';
import type { GateApproval } from '../../domain/feature-workspace/value-objects/gate-approval.js';
import type { IpcBusPort } from '../../domain/orchestration/ports/ipc-bus-port.js';
import type { CoderAgent, CoderTaskSpec } from '../orchestration/agents/coder-agent.js';
import type { FixerAgent } from '../orchestration/agents/fixer-agent.js';
import type {
  ReviewerAgent,
  ContractAddendumCreationOutcome,
} from '../orchestration/agents/reviewer-agent.js';

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
          throw result.error;
        }
        await this.reportPostStepDirtyTree(stageName);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError instanceof LlmNetworkTimeoutError) {
          console.warn(
            `\x1b[33m⚠ LLM provider network timeout during ${stageName} (attempt ${attempt + 1}/${MAX_AUTO_HEAL_RETRIES + 1}); auto-healing.\x1b[0m`
          );
        }
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

/** Collaborators the Swarm Engine's 7-stage pipeline advancer drives per-feature. */
export interface SwarmPipelineAdvancerDeps {
  readonly coderAgent: CoderAgent;
  readonly fixerAgent: FixerAgent;
  readonly reviewerAgent: ReviewerAgent;
  readonly ipcBus: IpcBusPort;
}

/** Input to `SwarmPipelineAdvancer.runCoderFixerLoop`: one feature's remaining tasks from `05-tasks.md`. */
export interface RunCoderFixerLoopInput {
  readonly featureId: string;
  readonly workspaceSlug: string;
  readonly tasks: readonly CoderTaskSpec[];
  readonly verifyConfiguration: VerifyConfiguration;
}

/** Outcome of `runCoderFixerLoop`: either every task verified, or one task exhausted its retries. */
export type CoderFixerLoopResult =
  | { readonly stage: 'REVIEWER_RUNNING' }
  | { readonly stage: 'BLOCKED'; readonly taskId: string };

/** Input to `SwarmPipelineAdvancer.advancePastGate4`. */
export interface AdvancePastGate4Input {
  readonly featureId: string;
  readonly gate4Approval: GateApproval | undefined;
}

/** Input to `SwarmPipelineAdvancer.submitGate4Feedback`. */
export interface SubmitGate4FeedbackInput {
  readonly featureId: string;
  readonly workspaceSlug: string;
  readonly addendumSequence: number;
  readonly priorAddendumSequences: readonly number[];
  readonly addendumContent: string;
  readonly createdAt: Date;
}

/**
 * Coordinates the Swarm Engine's 7-stage pipeline (Recon through Reviewer plus Gate 4) for a single
 * feature at a time, tracking `SwarmAgentStage` identity per `featureId` (resolves Conflict 7: no
 * parallel stage-name type). Recon/Architect/Skeptic/Planner remain driven by the legacy
 * `DefaultPipelineAdvancer` above; this class owns only the stages introduced by this feature:
 * `CODER_RUNNING`, `FIXER_RUNNING` (via the auto-heal loop), `REVIEWER_RUNNING`, `GATE4_PAUSED`,
 * `BLOCKED`, and `COMPLETED`.
 */
export class SwarmPipelineAdvancer {
  private readonly stageByFeatureId = new Map<string, SwarmAgentStage>();

  constructor(private readonly deps: SwarmPipelineAdvancerDeps) {}

  /** @returns the current `SwarmAgentStage` tracked for `featureId`, or `undefined` if none yet. */
  getStage(featureId: string): SwarmAgentStage | undefined {
    return this.stageByFeatureId.get(featureId);
  }

  /**
   * Transitions a feature into `CODER_RUNNING`.
   * @throws InvalidStageTransitionError if the Planner has not completed or `05-tasks.md` is missing.
   */
  transitionToCoder(input: { featureId: string; plannerCompleted: boolean; tasksFileExists: boolean }): void {
    PipelineStageInvariants.assertCanTransitionToCoder(input.plannerCompleted, input.tasksFileExists);
    this.stageByFeatureId.set(input.featureId, 'CODER_RUNNING');
  }

  /**
   * Runs every task through the Coder Agent, auto-healing failed `verify` runs via the Fixer Agent.
   * Each task tracks its own `TaskExecutionAttempt`, incrementing via `createNext`/`recordResult`; the
   * Fixer is always given `attempt.stackTraceSummary` (combined stdout+stderr, never raw `.stderr`
   * alone — Conflict 8). If a task's attempts exceed `1 + MAX_FIXER_RETRIES`, the stage transitions to
   * `BLOCKED` and `FixerRetriesExhaustedEvent` fires before returning, rather than continuing silently.
   * @param input - the feature/workspace identity, the tasks to run, and the resolved `verify` commands.
   * @returns `REVIEWER_RUNNING` once every task verifies, or `BLOCKED` at the first exhausted task.
   */
  async runCoderFixerLoop(input: RunCoderFixerLoopInput): Promise<CoderFixerLoopResult> {
    for (const task of input.tasks) {
      const outcome = await this.runTaskWithAutoHeal(input, task);
      if (outcome.stage === 'BLOCKED') {
        this.stageByFeatureId.set(input.featureId, 'BLOCKED');
        return outcome;
      }
    }

    this.stageByFeatureId.set(input.featureId, 'REVIEWER_RUNNING');
    return { stage: 'REVIEWER_RUNNING' };
  }

  /** Runs one task's Coder attempt, then Fixer retries, until verified or the attempt limit is hit. */
  private async runTaskWithAutoHeal(
    input: RunCoderFixerLoopInput,
    task: CoderTaskSpec
  ): Promise<CoderFixerLoopResult> {
    let attempt = TaskExecutionAttempt.createInitial(task.taskId);
    const coderOutcome = await this.deps.coderAgent.executeTask({
      featureId: input.featureId,
      workspaceSlug: input.workspaceSlug,
      task,
      attemptNumber: attempt.attemptNumber,
      verifyConfiguration: input.verifyConfiguration,
    });
    if (coderOutcome.isErr) {
      throw coderOutcome.error;
    }
    attempt = attempt.recordResult(SwarmPipelineAdvancer.latestVerifyResult(coderOutcome.value));

    while (attempt.status === 'FAILED') {
      const nextAttemptNumber = attempt.attemptNumber + 1;
      try {
        TaskAttemptInvariants.assertValidAttemptNumber(task.taskId, nextAttemptNumber);
      } catch (err) {
        if (!(err instanceof TaskAttemptLimitExceededError)) {
          throw err;
        }
        this.deps.ipcBus.publish(FIXER_RETRIES_EXHAUSTED_EVENT_NAME, {
          featureId: input.featureId,
          taskId: task.taskId,
          maxRetries: MAX_FIXER_RETRIES,
        });
        return { stage: 'BLOCKED', taskId: task.taskId };
      }

      const fixerOutcome = await this.deps.fixerAgent.applyPatchAndVerify({
        featureId: input.featureId,
        workspaceSlug: input.workspaceSlug,
        task,
        failedAttempt: attempt,
        verifyConfiguration: input.verifyConfiguration,
      });
      if (fixerOutcome.isErr) {
        throw fixerOutcome.error;
      }
      attempt = TaskExecutionAttempt.createNext(attempt, attempt.stackTraceSummary ?? '');
      attempt = attempt.recordResult(SwarmPipelineAdvancer.latestVerifyResult(fixerOutcome.value));
    }

    return { stage: 'REVIEWER_RUNNING' };
  }

  /** The verify outcome to record: the test result when typecheck passed, else the typecheck failure. */
  private static latestVerifyResult(outcome: {
    readonly typecheckResult: SubprocessExecutionResult;
    readonly testResult?: SubprocessExecutionResult;
  }): SubprocessExecutionResult {
    return outcome.testResult ?? outcome.typecheckResult;
  }

  /**
   * Pauses a feature at Gate 4, publishing `Gate4PausedEvent`. Idempotent under
   * `(featureId, gateNumber=4)`: re-invoking while already `GATE4_PAUSED` is a no-op that does not
   * re-publish the event.
   */
  pauseAtGate4(featureId: string): void {
    if (this.stageByFeatureId.get(featureId) === 'GATE4_PAUSED') {
      return;
    }
    this.stageByFeatureId.set(featureId, 'GATE4_PAUSED');
    this.deps.ipcBus.publish(GATE4_PAUSED_EVENT_NAME, { featureId });
  }

  /**
   * Advances a feature past Gate 4 into `COMPLETED`.
   * @throws InvalidStageTransitionError if no matching `GateApproval` for Gate 4 has been recorded.
   */
  advancePastGate4(input: AdvancePastGate4Input): void {
    PipelineStageInvariants.assertCanAdvancePastGate4(input.gate4Approval);
    this.stageByFeatureId.set(input.featureId, 'COMPLETED');
  }

  /**
   * Handles Gate 4 feedback-with-content: writes a new `ContractAddendum` via the Reviewer Agent
   * (which itself publishes `ContractAddendumCreatedEvent`), then re-triggers `PLANNER`.
   * @param input - the addendum's sequence, prior sequences, and feedback content.
   * @returns the created addendum outcome.
   */
  async submitGate4Feedback(input: SubmitGate4FeedbackInput): Promise<ContractAddendumCreationOutcome> {
    const result = await this.deps.reviewerAgent.createContractAddendum({
      featureId: input.featureId,
      workspaceSlug: input.workspaceSlug,
      addendumSequence: input.addendumSequence,
      priorAddendumSequences: input.priorAddendumSequences,
      addendumContent: input.addendumContent,
      createdAt: input.createdAt,
    });
    if (result.isErr) {
      throw result.error;
    }
    this.stageByFeatureId.set(input.featureId, 'PLANNER');
    return result.value;
  }
}
