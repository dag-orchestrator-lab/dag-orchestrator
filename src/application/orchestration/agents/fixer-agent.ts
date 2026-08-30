import { success, type Result } from '../../../domain/common/result.js';
import { extractJson } from '../../../domain/orchestration/utils/llm-response-extractor.js';
import { FIXER_PATCH_APPLIED_EVENT_NAME } from '../../../domain/orchestration/events/fixer-events.js';
import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { SubprocessExecutionPort } from '../../../domain/orchestration/ports/subprocess-execution-port.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';
import type { VerifyConfiguration } from '../../../domain/orchestration/models/verify-command.js';
import type { SubprocessExecutionResult } from '../../../domain/orchestration/models/subprocess-command.js';
import type { TaskExecutionAttempt } from '../../../domain/orchestration/models/task-execution-attempt.js';
import type { CoderTaskSpec } from './coder-agent.js';

/** Input to a single `FixerAgent.applyPatchAndVerify` attempt. */
export interface FixerApplyPatchInput {
  readonly featureId: string;
  readonly workspaceSlug: string;
  readonly task: CoderTaskSpec;
  /** The attempt that failed `verify`; its `stackTraceSummary` (set by `recordResult`) is the sole diagnostic context passed to the LLM. */
  readonly failedAttempt: TaskExecutionAttempt;
  readonly verifyConfiguration: VerifyConfiguration;
}

/** Outcome of a single Fixer Agent patch attempt: whether `verify` (typecheck + test) passed after the patch. */
export interface FixerPatchOutcome {
  readonly verified: boolean;
  readonly typecheckResult: SubprocessExecutionResult;
  readonly testResult?: SubprocessExecutionResult;
}

/**
 * Agent invoked only when `verify` fails after a Coder attempt: generates a patch from the
 * failed attempt's diagnostic context via the LLM, writes it to the workspace, then re-runs
 * `verify` (typecheck, then test) via the injected {@link SubprocessExecutionPort}, mirroring
 * `CoderAgent.executeTask`'s verify sequence. Test execution is skipped when typecheck fails.
 */
export class FixerAgent {
  constructor(
    private readonly llmClient: LlmClientPort,
    private readonly workspaceFileSystem: WorkspaceFileSystemPort,
    private readonly subprocessExecution: SubprocessExecutionPort,
    private readonly ipcBus: IpcBusPort
  ) {}

  /**
   * Generates and writes a patch for a failed task attempt, then re-runs `verify` against it.
   * @param input - the task spec, failed attempt (carrying diagnostic context), and resolved `verify` commands.
   * @returns the typecheck (and, if it passed, test) results, never throwing on a failed `verify`.
   */
  async applyPatchAndVerify(input: FixerApplyPatchInput): Promise<Result<FixerPatchOutcome, never>> {
    const stackTraceSummary = input.failedAttempt.stackTraceSummary ?? '';

    this.ipcBus.publish(FIXER_PATCH_APPLIED_EVENT_NAME, {
      featureId: input.featureId,
      taskId: input.task.taskId,
      attemptNumber: input.failedAttempt.attemptNumber + 1,
      stackTraceSummary,
    });

    await this.generateAndWritePatch(input, stackTraceSummary);

    const typecheckResult = await this.subprocessExecution.execute(input.verifyConfiguration.typecheck);
    if (typecheckResult.exitCode !== 0 || typecheckResult.didTimeout) {
      return success({ verified: false, typecheckResult });
    }

    const testResult = await this.subprocessExecution.execute(input.verifyConfiguration.test);
    const verified = testResult.exitCode === 0 && !testResult.didTimeout;

    return success({ verified, typecheckResult, testResult });
  }

  /** Requests patched file contents for every file the task lists, then writes each to the workspace. */
  private async generateAndWritePatch(input: FixerApplyPatchInput, stackTraceSummary: string): Promise<void> {
    const rawResponse = await this.llmClient.complete({
      systemPrompt: '',
      userPrompt: this.buildFixPrompt(input.task, stackTraceSummary),
    });

    const filesByPath = extractJson<Record<string, string>>(rawResponse);

    for (const relativePath of input.task.files) {
      await this.workspaceFileSystem.writeFile(input.workspaceSlug, relativePath, filesByPath[relativePath] ?? '');
    }
  }

  /** Builds the user prompt asking the LLM for a JSON map of relative file path to patched file content. */
  private buildFixPrompt(task: CoderTaskSpec, stackTraceSummary: string): string {
    return [
      `Fix task ${task.taskId}: ${task.title}`,
      `Done when: ${task.doneWhen}`,
      `Files to patch: ${task.files.join(', ')}`,
      'The previous attempt failed verify with the following combined stdout/stderr output:',
      stackTraceSummary,
      'Respond with a single JSON object mapping each file path to its full patched file content.',
    ].join('\n');
  }
}
