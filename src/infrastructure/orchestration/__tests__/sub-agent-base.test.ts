import { describe, expect, it } from 'vitest';
import { SubAgentBase } from '../sub-agent-base.js';
import { AgentExecutionError } from '../../../domain/orchestration/errors/agent-execution-error.js';
import { AgentContext } from '../../../domain/orchestration/models/agent-context.js';
import { PipelineStage } from '../../../domain/feature-workspace/entities/pipeline-stage.js';
import { Result } from '../../../domain/common/result.js';
import type { AgentResult } from '../../../domain/orchestration/models/agent-result.js';
import type { ExecuteStagePromptUseCase } from '../../../application/llm/execute-stage-prompt-use-case.js';
import type { DagConfigRepository } from '../../config/dag-config-repository.js';

/** Minimal concrete Sub-Agent implementing all three abstract members, exercising the base class contract. */
class TestSubAgent extends SubAgentBase {
  public async execute(_context: AgentContext): Promise<AgentResult> {
    try {
      throw new Error('boom');
    } catch (cause) {
      return Result.err(this.formatErrorTrace(cause));
    }
  }

  protected async loadRules(): Promise<string> {
    return '';
  }

  protected formatErrorTrace(cause: unknown): AgentExecutionError {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return new AgentExecutionError('recon', error.message, {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }
}

function makeContext(): AgentContext {
  const stageResult = PipelineStage.create({ name: 'recon', requiredGates: [] });
  if (stageResult.isErr) throw new Error('unexpected stage validation failure');

  const contextResult = AgentContext.create(
    {
      pipelineState: stageResult.value,
      workingDirectory: '/tmp/feature',
      artifactRefs: [],
    },
    { existsSync: () => true }
  );
  if (contextResult.isErr) throw new Error('unexpected context validation failure');
  return contextResult.value;
}

describe('SubAgentBase', () => {
  it('never throws out of execute() when the concrete agent returns Result.err', async () => {
    const agent = new TestSubAgent(
      {} as ExecuteStagePromptUseCase,
      {} as DagConfigRepository
    );

    await expect(agent.execute(makeContext())).resolves.toBeDefined();
    const result = await agent.execute(makeContext());
    expect(result.isErr).toBe(true);
  });

  it('formatErrorTrace constructed positionally produces a correctly populated message and stageId', async () => {
    const agent = new TestSubAgent(
      {} as ExecuteStagePromptUseCase,
      {} as DagConfigRepository
    );

    const result = await agent.execute(makeContext());

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.stageId).toBe('recon');
      expect(result.error.message).toBe(
        "Sub-Agent execution failed for stage 'recon': boom"
      );
      expect(result.error.causeDetails?.message).toBe('boom');
    }
  });
});
