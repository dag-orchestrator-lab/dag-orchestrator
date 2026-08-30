import { describe, it, expect, vi } from 'vitest';
import { FixerAgent, type FixerApplyPatchInput } from './fixer-agent.js';
import { FIXER_PATCH_APPLIED_EVENT_NAME } from '../../../domain/orchestration/events/fixer-events.js';
import { TaskExecutionAttempt } from '../../../domain/orchestration/models/task-execution-attempt.js';
import type { LlmClientPort } from '../../../domain/orchestration/ports/llm-client-port.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { SubprocessExecutionPort } from '../../../domain/orchestration/ports/subprocess-execution-port.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';
import type { SubprocessCommand, SubprocessExecutionResult } from '../../../domain/orchestration/models/subprocess-command.js';

const TYPECHECK_COMMAND: SubprocessCommand = {
  executable: 'npx',
  args: ['tsc', '--noEmit'],
  cwd: '/workspace/feature-x',
  timeoutMs: 987_654,
};

const TEST_COMMAND: SubprocessCommand = {
  executable: 'npx',
  args: ['vitest', 'run'],
  cwd: '/workspace/feature-x',
  timeoutMs: 123_456,
};

function passingResult(): SubprocessExecutionResult {
  return { exitCode: 0, stdout: 'ok', stderr: '', didTimeout: false };
}

function failingResult(): SubprocessExecutionResult {
  return { exitCode: 1, stdout: '', stderr: 'boom', didTimeout: false };
}

function stdoutOnlyFailingResult(): SubprocessExecutionResult {
  return { exitCode: 1, stdout: 'src/foo.ts(3,5): error TS2322: Type mismatch.', stderr: '', didTimeout: false };
}

function failedAttempt(result: SubprocessExecutionResult = failingResult()): TaskExecutionAttempt {
  return TaskExecutionAttempt.createInitial('T-14').recordResult(result);
}

function createInput(overrides: Partial<FixerApplyPatchInput> = {}): FixerApplyPatchInput {
  return {
    featureId: 'feature-x',
    workspaceSlug: 'feature-x-workspace',
    task: {
      taskId: 'T-14',
      title: 'Implement CoderAgent',
      doneWhen: 'verify passes',
      files: ['src/foo.ts'],
    },
    failedAttempt: failedAttempt(),
    verifyConfiguration: { typecheck: TYPECHECK_COMMAND, test: TEST_COMMAND },
    ...overrides,
  };
}

function createLlmClient(): LlmClientPort {
  return {
    complete: vi.fn(async () => '{"src/foo.ts": "export const foo = 2;"}'),
  };
}

function createWorkspaceFileSystem(): WorkspaceFileSystemPort {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(),
    readFeedbackRecord: vi.fn(),
    writeFeedbackRecord: vi.fn(),
  };
}

function createIpcBus(): IpcBusPort {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
  };
}

describe('FixerAgent', () => {
  it('publishes FixerPatchAppliedEvent, writes the patched files, then runs typecheck and test in order', async () => {
    const llmClient = createLlmClient();
    const workspaceFileSystem = createWorkspaceFileSystem();
    const ipcBus = createIpcBus();
    const subprocessExecution: SubprocessExecutionPort = {
      execute: vi.fn(async () => passingResult()),
    };
    const agent = new FixerAgent(llmClient, workspaceFileSystem, subprocessExecution, ipcBus);
    const input = createInput();

    const result = await agent.applyPatchAndVerify(input);

    expect(ipcBus.publish).toHaveBeenCalledWith(FIXER_PATCH_APPLIED_EVENT_NAME, {
      featureId: 'feature-x',
      taskId: 'T-14',
      attemptNumber: 2,
      stackTraceSummary: input.failedAttempt.stackTraceSummary,
    });
    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'feature-x-workspace',
      'src/foo.ts',
      'export const foo = 2;'
    );
    expect(subprocessExecution.execute).toHaveBeenNthCalledWith(1, TYPECHECK_COMMAND);
    expect(subprocessExecution.execute).toHaveBeenNthCalledWith(2, TEST_COMMAND);
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.verified).toBe(true);
      expect(result.value.typecheckResult).toEqual(passingResult());
      expect(result.value.testResult).toEqual(passingResult());
    }
  });

  it('returns success({ verified: false, typecheckResult }) and never runs test when typecheck fails', async () => {
    const llmClient = createLlmClient();
    const workspaceFileSystem = createWorkspaceFileSystem();
    const ipcBus = createIpcBus();
    const typecheckFailure = failingResult();
    const subprocessExecution: SubprocessExecutionPort = {
      execute: vi.fn(async () => typecheckFailure),
    };
    const agent = new FixerAgent(llmClient, workspaceFileSystem, subprocessExecution, ipcBus);

    const result = await agent.applyPatchAndVerify(createInput());

    expect(subprocessExecution.execute).toHaveBeenCalledTimes(1);
    expect(subprocessExecution.execute).toHaveBeenCalledWith(TYPECHECK_COMMAND);
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ verified: false, typecheckResult: typecheckFailure });
      expect(result.value.testResult).toBeUndefined();
    }
  });

  it('treats a timed-out typecheck the same as a non-zero exit code', async () => {
    const llmClient = createLlmClient();
    const workspaceFileSystem = createWorkspaceFileSystem();
    const ipcBus = createIpcBus();
    const timedOutResult: SubprocessExecutionResult = { exitCode: 0, stdout: '', stderr: '', didTimeout: true };
    const subprocessExecution: SubprocessExecutionPort = {
      execute: vi.fn(async () => timedOutResult),
    };
    const agent = new FixerAgent(llmClient, workspaceFileSystem, subprocessExecution, ipcBus);

    const result = await agent.applyPatchAndVerify(createInput());

    expect(subprocessExecution.execute).toHaveBeenCalledTimes(1);
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.verified).toBe(false);
    }
  });

  it('uses the exact SubprocessCommand objects from the resolved VerifyConfiguration, never a hardcoded timeout', async () => {
    const llmClient = createLlmClient();
    const workspaceFileSystem = createWorkspaceFileSystem();
    const ipcBus = createIpcBus();
    const subprocessExecution: SubprocessExecutionPort = {
      execute: vi.fn(async () => passingResult()),
    };
    const agent = new FixerAgent(llmClient, workspaceFileSystem, subprocessExecution, ipcBus);
    const customVerifyConfiguration = {
      typecheck: { ...TYPECHECK_COMMAND, timeoutMs: 42 },
      test: { ...TEST_COMMAND, timeoutMs: 99 },
    };

    await agent.applyPatchAndVerify(createInput({ verifyConfiguration: customVerifyConfiguration }));

    expect(subprocessExecution.execute).toHaveBeenNthCalledWith(1, customVerifyConfiguration.typecheck);
    expect(subprocessExecution.execute).toHaveBeenNthCalledWith(2, customVerifyConfiguration.test);
  });

  it('builds a non-empty prompt context from stdout-only tsc diagnostics via recordResult, never reading .stderr alone', async () => {
    const llmClient = createLlmClient();
    const workspaceFileSystem = createWorkspaceFileSystem();
    const ipcBus = createIpcBus();
    const subprocessExecution: SubprocessExecutionPort = {
      execute: vi.fn(async () => passingResult()),
    };
    const agent = new FixerAgent(llmClient, workspaceFileSystem, subprocessExecution, ipcBus);
    const stdoutOnlyFailure = stdoutOnlyFailingResult();
    const attemptWithStdoutOnlyFailure = failedAttempt(stdoutOnlyFailure);

    expect(stdoutOnlyFailure.stderr).toBe('');
    expect(attemptWithStdoutOnlyFailure.stackTraceSummary).toContain('Type mismatch');

    await agent.applyPatchAndVerify(createInput({ failedAttempt: attemptWithStdoutOnlyFailure }));

    const publishedEvent = (ipcBus.publish as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventName]) => eventName === FIXER_PATCH_APPLIED_EVENT_NAME
    );
    expect(publishedEvent?.[1].stackTraceSummary).toContain('Type mismatch');

    const completeCall = (llmClient.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(completeCall.userPrompt).toContain('Type mismatch');
    expect(completeCall.userPrompt.length).toBeGreaterThan(0);
  });
});
