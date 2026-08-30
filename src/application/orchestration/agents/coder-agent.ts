import { success, type Result } from '../../../domain/common/result.js';
import { extractJson } from '../../../domain/orchestration/utils/llm-response-extractor.js';
import {
  CODER_TASK_STARTED_EVENT_NAME,
  CODER_TASK_VERIFIED_EVENT_NAME,
} from '../../../domain/orchestration/events/coder-events.js';
import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { SubprocessExecutionPort } from '../../../domain/orchestration/ports/subprocess-execution-port.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';
import type { VerifyConfiguration } from '../../../domain/orchestration/models/verify-command.js';
import type { SubprocessExecutionResult } from '../../../domain/orchestration/models/subprocess-command.js';

/** One task entry from `05-tasks.md`: the unit of work a single Coder Agent attempt implements. */
export interface CoderTaskSpec {
  readonly taskId: string;
  readonly title: string;
  readonly doneWhen: string;
  readonly files: readonly string[];
}

/** Input to a single `CoderAgent.executeTask` attempt. */
export interface CoderExecuteTaskInput {
  readonly featureId: string;
  readonly workspaceSlug: string;
  readonly task: CoderTaskSpec;
  readonly attemptNumber: number;
  readonly verifyConfiguration: VerifyConfiguration;
}

/** Outcome of a single Coder Agent task attempt: whether `verify` (typecheck + test) passed. */
export interface CoderTaskExecutionOutcome {
  readonly verified: boolean;
  readonly typecheckResult: SubprocessExecutionResult;
  readonly testResult?: SubprocessExecutionResult;
}

/**
 * Agent that implements one task at a time from `05-tasks.md`: generates the task's files via the
 * LLM, writes them to the workspace, then runs `verify` (typecheck, then test) via the injected
 * {@link SubprocessExecutionPort}. Test execution is skipped entirely when typecheck fails, since a
 * type error makes any test result meaningless.
 */
export class CoderAgent {
  constructor(
    private readonly llmClient: LlmClientPort,
    private readonly workspaceFileSystem: WorkspaceFileSystemPort,
    private readonly subprocessExecution: SubprocessExecutionPort,
    private readonly ipcBus: IpcBusPort
  ) {}

  /**
   * Generates and writes a task's implementation, then runs `verify` against it.
   * @param input - the task spec, attempt number, and resolved `verify` commands to run under.
   * @returns the typecheck (and, if it passed, test) results, never throwing on a failed `verify`.
   */
  async executeTask(input: CoderExecuteTaskInput): Promise<Result<CoderTaskExecutionOutcome, never>> {
    this.ipcBus.publish(CODER_TASK_STARTED_EVENT_NAME, {
      featureId: input.featureId,
      taskId: input.task.taskId,
      attemptNumber: input.attemptNumber,
    });

    await this.generateAndWriteFiles(input);

    const typecheckResult = await this.subprocessExecution.execute(input.verifyConfiguration.typecheck);
    if (typecheckResult.exitCode !== 0 || typecheckResult.didTimeout) {
      return success({ verified: false, typecheckResult });
    }

    const testResult = await this.subprocessExecution.execute(input.verifyConfiguration.test);
    const verified = testResult.exitCode === 0 && !testResult.didTimeout;

    this.ipcBus.publish(CODER_TASK_VERIFIED_EVENT_NAME, {
      featureId: input.featureId,
      taskId: input.task.taskId,
      verifyResult: testResult,
    });

    return success({ verified, typecheckResult, testResult });
  }

  /** Requests file contents for every file the task lists, then writes each to the workspace. */
  private async generateAndWriteFiles(input: CoderExecuteTaskInput): Promise<void> {
    const rawResponse = await this.llmClient.complete({
      systemPrompt: '',
      userPrompt: this.buildImplementationPrompt(input.task),
    });

    const filesByPath = extractJson<Record<string, string>>(rawResponse);

    for (const relativePath of input.task.files) {
      await this.workspaceFileSystem.writeFile(input.workspaceSlug, relativePath, filesByPath[relativePath] ?? '');
    }
  }

  /** Builds the user prompt asking the LLM for a JSON map of relative file path to file content. */
  private buildImplementationPrompt(task: CoderTaskSpec): string {
    return [
      `Implement task ${task.taskId}: ${task.title}`,
      `Done when: ${task.doneWhen}`,
      `Files to write: ${task.files.join(', ')}`,
      'Respond with a single JSON object mapping each file path to its full file content.',
    ].join('\n');
  }
}
