import { describe, it, expect, vi } from 'vitest';
import { SwarmPipelineAdvancer } from './pipeline-advancer.js';
import { InvalidStageTransitionError } from '../../domain/orchestration/errors/pipeline-stage-invariant-error.js';
import { GATE4_PAUSED_EVENT_NAME } from '../../domain/orchestration/events/pipeline-events.js';
import { FIXER_RETRIES_EXHAUSTED_EVENT_NAME } from '../../domain/orchestration/events/fixer-events.js';
import { CONTRACT_ADDENDUM_CREATED_EVENT_NAME } from '../../domain/orchestration/events/reviewer-events.js';
import { MAX_FIXER_RETRIES } from '../../domain/orchestration/models/verify-command.js';
import { GateApproval } from '../../domain/feature-workspace/value-objects/gate-approval.js';
import type { CoderAgent, CoderTaskSpec } from '../orchestration/agents/coder-agent.js';
import type { FixerAgent } from '../orchestration/agents/fixer-agent.js';
import type { ReviewerAgent } from '../orchestration/agents/reviewer-agent.js';
import type { IpcBusPort } from '../../domain/orchestration/ports/ipc-bus-port.js';
import type { VerifyConfiguration } from '../../domain/orchestration/models/verify-command.js';
import type { SubprocessExecutionResult } from '../../domain/orchestration/models/subprocess-command.js';
import { success } from '../../domain/common/result.js';

const VERIFY_CONFIGURATION: VerifyConfiguration = {
  typecheck: { executable: 'npx', args: ['tsc', '--noEmit'], cwd: '/repo', timeoutMs: 1000 },
  test: { executable: 'npx', args: ['vitest', 'run'], cwd: '/repo', timeoutMs: 1000 },
};

function passingResult(): SubprocessExecutionResult {
  return { exitCode: 0, stdout: 'ok', stderr: '', didTimeout: false };
}

function failingResult(stdout = 'stdout diagnostics'): SubprocessExecutionResult {
  return { exitCode: 1, stdout, stderr: '', didTimeout: false };
}

function makeTask(overrides: Partial<CoderTaskSpec> = {}): CoderTaskSpec {
  return { taskId: 'T-1', title: 'Do the thing', doneWhen: 'verify passes', files: ['src/foo.ts'], ...overrides };
}

function makeIpcBus(): IpcBusPort {
  return { publish: vi.fn(), subscribe: vi.fn() };
}

describe('SwarmPipelineAdvancer', () => {
  describe('transitionToCoder', () => {
    it('transitions to CODER_RUNNING when the Planner has completed and 05-tasks.md exists', () => {
      const advancer = new SwarmPipelineAdvancer({
        coderAgent: {} as CoderAgent,
        fixerAgent: {} as FixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus: makeIpcBus(),
      });

      advancer.transitionToCoder({ featureId: 'feature-x', plannerCompleted: true, tasksFileExists: true });

      expect(advancer.getStage('feature-x')).toBe('CODER_RUNNING');
    });

    it('throws InvalidStageTransitionError and does not transition when 05-tasks.md is missing', () => {
      const advancer = new SwarmPipelineAdvancer({
        coderAgent: {} as CoderAgent,
        fixerAgent: {} as FixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus: makeIpcBus(),
      });

      expect(() =>
        advancer.transitionToCoder({ featureId: 'feature-x', plannerCompleted: true, tasksFileExists: false })
      ).toThrow(InvalidStageTransitionError);
      expect(advancer.getStage('feature-x')).toBeUndefined();
    });
  });

  describe('runCoderFixerLoop', () => {
    it('advances to REVIEWER_RUNNING when the Coder verifies a task on the first attempt', async () => {
      const coderAgent = {
        executeTask: vi.fn(async () => success({ verified: true, typecheckResult: passingResult(), testResult: passingResult() })),
      } as unknown as CoderAgent;
      const fixerAgent = { applyPatchAndVerify: vi.fn() } as unknown as FixerAgent;

      const advancer = new SwarmPipelineAdvancer({
        coderAgent,
        fixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus: makeIpcBus(),
      });

      const result = await advancer.runCoderFixerLoop({
        featureId: 'feature-x',
        workspaceSlug: 'feature-x-workspace',
        tasks: [makeTask()],
        verifyConfiguration: VERIFY_CONFIGURATION,
      });

      expect(result).toEqual({ stage: 'REVIEWER_RUNNING' });
      expect(advancer.getStage('feature-x')).toBe('REVIEWER_RUNNING');
      expect(fixerAgent.applyPatchAndVerify).not.toHaveBeenCalled();
    });

    it('invokes the Fixer with the failed attempt (stackTraceSummary derived from combined stdout+stderr) after a failed verify', async () => {
      const coderAgent = {
        executeTask: vi.fn(async () => success({ verified: false, typecheckResult: failingResult('tsc failure on stdout') })),
      } as unknown as CoderAgent;
      const fixerAgent = {
        applyPatchAndVerify: vi.fn(async () => success({ verified: true, typecheckResult: passingResult(), testResult: passingResult() })),
      } as unknown as FixerAgent;

      const advancer = new SwarmPipelineAdvancer({
        coderAgent,
        fixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus: makeIpcBus(),
      });

      const result = await advancer.runCoderFixerLoop({
        featureId: 'feature-x',
        workspaceSlug: 'feature-x-workspace',
        tasks: [makeTask()],
        verifyConfiguration: VERIFY_CONFIGURATION,
      });

      expect(result).toEqual({ stage: 'REVIEWER_RUNNING' });
      expect(fixerAgent.applyPatchAndVerify).toHaveBeenCalledTimes(1);
      const callArg = (fixerAgent.applyPatchAndVerify as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.failedAttempt.stackTraceSummary).toContain('tsc failure on stdout');
      expect(callArg.failedAttempt.attemptNumber).toBe(1);
    });

    it('transitions to BLOCKED and publishes FixerRetriesExhaustedEvent (never continuing silently) once retries are exhausted', async () => {
      const coderAgent = {
        executeTask: vi.fn(async () => success({ verified: false, typecheckResult: failingResult() })),
      } as unknown as CoderAgent;
      const fixerAgent = {
        applyPatchAndVerify: vi.fn(async () => success({ verified: false, typecheckResult: failingResult() })),
      } as unknown as FixerAgent;
      const ipcBus = makeIpcBus();

      const advancer = new SwarmPipelineAdvancer({
        coderAgent,
        fixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus,
      });

      const result = await advancer.runCoderFixerLoop({
        featureId: 'feature-x',
        workspaceSlug: 'feature-x-workspace',
        tasks: [makeTask()],
        verifyConfiguration: VERIFY_CONFIGURATION,
      });

      expect(result).toEqual({ stage: 'BLOCKED', taskId: 'T-1' });
      expect(advancer.getStage('feature-x')).toBe('BLOCKED');
      expect(fixerAgent.applyPatchAndVerify).toHaveBeenCalledTimes(MAX_FIXER_RETRIES);
      expect(ipcBus.publish).toHaveBeenCalledWith(FIXER_RETRIES_EXHAUSTED_EVENT_NAME, {
        featureId: 'feature-x',
        taskId: 'T-1',
        maxRetries: MAX_FIXER_RETRIES,
      });
    });
  });

  describe('Gate 4', () => {
    it('pauses at Gate 4 and publishes Gate4PausedEvent', () => {
      const ipcBus = makeIpcBus();
      const advancer = new SwarmPipelineAdvancer({
        coderAgent: {} as CoderAgent,
        fixerAgent: {} as FixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus,
      });

      advancer.pauseAtGate4('feature-x');

      expect(advancer.getStage('feature-x')).toBe('GATE4_PAUSED');
      expect(ipcBus.publish).toHaveBeenCalledWith(GATE4_PAUSED_EVENT_NAME, { featureId: 'feature-x' });
    });

    it('is idempotent under (featureId, gateNumber=4): re-invoking while already paused does not re-publish', () => {
      const ipcBus = makeIpcBus();
      const advancer = new SwarmPipelineAdvancer({
        coderAgent: {} as CoderAgent,
        fixerAgent: {} as FixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus,
      });

      advancer.pauseAtGate4('feature-x');
      advancer.pauseAtGate4('feature-x');

      expect(ipcBus.publish).toHaveBeenCalledTimes(1);
    });

    it('advances to COMPLETED only when a gate-4 GateApproval is present', () => {
      const advancer = new SwarmPipelineAdvancer({
        coderAgent: {} as CoderAgent,
        fixerAgent: {} as FixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus: makeIpcBus(),
      });
      advancer.pauseAtGate4('feature-x');

      const approvalResult = GateApproval.create({
        gateName: 'gate-4',
        approver: 'larzthimotyp@gmail.com',
        approvedAt: '2026-08-30T00:00:00.000Z',
      });
      if (!approvalResult.isOk) throw new Error('unreachable');

      advancer.advancePastGate4({ featureId: 'feature-x', gate4Approval: approvalResult.value });

      expect(advancer.getStage('feature-x')).toBe('COMPLETED');
    });

    it('throws InvalidStageTransitionError when advancing past Gate 4 without an approval', () => {
      const advancer = new SwarmPipelineAdvancer({
        coderAgent: {} as CoderAgent,
        fixerAgent: {} as FixerAgent,
        reviewerAgent: {} as ReviewerAgent,
        ipcBus: makeIpcBus(),
      });
      advancer.pauseAtGate4('feature-x');

      expect(() => advancer.advancePastGate4({ featureId: 'feature-x', gate4Approval: undefined })).toThrow(
        InvalidStageTransitionError
      );
      expect(advancer.getStage('feature-x')).toBe('GATE4_PAUSED');
    });

    it('feedback-with-content re-triggers PLANNER via ReviewerAgent.createContractAddendum and publishes ContractAddendumCreatedEvent', async () => {
      const ipcBus = makeIpcBus();
      const reviewerAgent = {
        createContractAddendum: vi.fn(async (input: { featureId: string; addendumSequence: number; addendumContent: string }) => {
          ipcBus.publish(CONTRACT_ADDENDUM_CREATED_EVENT_NAME, {
            featureId: input.featureId,
            addendumSequence: input.addendumSequence,
            addendumPath: `contract-addendum-${input.addendumSequence}.md`,
          });
          return success({
            addendum: {
              featureId: input.featureId,
              addendumSequence: input.addendumSequence,
              content: input.addendumContent,
              filePath: `contract-addendum-${input.addendumSequence}.md`,
            },
          });
        }),
      } as unknown as ReviewerAgent;

      const advancer = new SwarmPipelineAdvancer({
        coderAgent: {} as CoderAgent,
        fixerAgent: {} as FixerAgent,
        reviewerAgent,
        ipcBus,
      });
      advancer.pauseAtGate4('feature-x');

      await advancer.submitGate4Feedback({
        featureId: 'feature-x',
        workspaceSlug: 'feature-x-workspace',
        addendumSequence: 1,
        priorAddendumSequences: [],
        addendumContent: 'please tighten the retry bound',
        createdAt: new Date('2026-08-30T00:00:00.000Z'),
      });

      expect(reviewerAgent.createContractAddendum).toHaveBeenCalledTimes(1);
      expect(ipcBus.publish).toHaveBeenCalledWith(
        CONTRACT_ADDENDUM_CREATED_EVENT_NAME,
        expect.objectContaining({ featureId: 'feature-x', addendumSequence: 1 })
      );
      expect(advancer.getStage('feature-x')).toBe('PLANNER');
    });
  });
});
