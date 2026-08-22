import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '../../../domain/common/result.js';
import { StepExecutionFailedError } from '../../../domain/cli/errors.js';
import { ProviderExecutionError } from '../../../domain/llm/errors/provider-execution-error.js';
import { DefaultPipelineAdvancer } from '../pipeline-advancer.js';
import type { GitAdapter } from '../../../infrastructure/process/git-adapter.js';
import type { Prompter } from '../../../infrastructure/cli/readline-prompter.js';
import type { ExecuteStagePromptUseCase } from '../../llm/execute-stage-prompt-use-case.js';

function makeGitAdapter(isClean: boolean): GitAdapter {
  return {
    isWorkingTreeClean: vi.fn(async () => isClean),
  };
}

function makePrompter(answer: string): Prompter {
  return {
    askQuestion: vi.fn(async () => answer),
    askMultiLine: vi.fn(async () => ''),
    close: vi.fn(),
  };
}

type ExecuteMock = Pick<ExecuteStagePromptUseCase, 'execute'>;

describe('DefaultPipelineAdvancer', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('runStep0()...runStep4() are all present and delegate to a successful attempt', async () => {
    const gitAdapter = makeGitAdapter(true);
    const prompter = makePrompter('y');
    const execute = vi.fn(async () => Result.ok('ok')) satisfies ExecuteMock['execute'];
    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo',
      {},
      vi.fn(async () => 'diff-text')
    );

    await advancer.runStep0();
    await advancer.runStep1();
    await advancer.runStep2();
    await advancer.runStep3();
    await advancer.runStep4();

    expect(execute).toHaveBeenCalledTimes(5);
    expect(execute).toHaveBeenNthCalledWith(1, 'step0', '');
    expect(execute).toHaveBeenNthCalledWith(5, 'step4', 'diff-text');
  });

  it('retries exactly once on a single failure then succeeds: execute called exactly twice', async () => {
    const gitAdapter = makeGitAdapter(true);
    const prompter = makePrompter('y');
    const execute = vi
      .fn()
      .mockResolvedValueOnce(Result.err(new ProviderExecutionError('boom')))
      .mockResolvedValueOnce(Result.ok('ok'));

    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo'
    );

    await expect(advancer.runStep1()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('throws StepExecutionFailedError and invokes execute exactly MAX_AUTO_HEAL_RETRIES + 1 times when all retries are exhausted', async () => {
    const gitAdapter = makeGitAdapter(true);
    const prompter = makePrompter('y');
    const execute = vi.fn(async () => Result.err(new ProviderExecutionError('persistent failure')));

    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo'
    );

    await expect(advancer.runStep2()).rejects.toBeInstanceOf(StepExecutionFailedError);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('blocks/prompts on a dirty pre-step working tree, and halts if the user declines to proceed', async () => {
    const gitAdapter = makeGitAdapter(false);
    const prompter = makePrompter('n');
    const execute = vi.fn(async () => Result.ok('ok'));

    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo'
    );

    await expect(advancer.runStep0()).rejects.toThrow(/uncommitted Git changes/);
    expect(prompter.askQuestion).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('proceeds past a dirty pre-step working tree when the user confirms', async () => {
    const gitAdapter = makeGitAdapter(false);
    const prompter = makePrompter('y');
    const execute = vi.fn(async () => Result.ok('ok'));

    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo'
    );

    await expect(advancer.runStep0()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('logs (but does not block) when the post-step working tree is dirty', async () => {
    const gitAdapter: GitAdapter = {
      isWorkingTreeClean: vi
        .fn()
        .mockResolvedValueOnce(true) // pre-step check
        .mockResolvedValueOnce(false), // post-step check
    };
    const prompter = makePrompter('y');
    const execute = vi.fn(async () => Result.ok('ok'));

    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo'
    );

    await expect(advancer.runStep0()).resolves.toBeUndefined();
    expect(prompter.askQuestion).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('produced uncommitted changes'));
  });

  it('runStep4() extracts the diff via `${config.STACKED_BASE_BRANCH}...HEAD` and passes it as the prompt', async () => {
    const gitAdapter = makeGitAdapter(true);
    const prompter = makePrompter('y');
    const execute = vi.fn(async () => Result.ok('ok'));
    const extractGitDiff = vi.fn(async (cwd: string, baseBranch: string) => `diff for ${cwd} against ${baseBranch}`);

    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo',
      { STACKED_BASE_BRANCH: 'main' },
      extractGitDiff
    );

    await advancer.runStep4();

    expect(extractGitDiff).toHaveBeenCalledWith('/repo', 'main');
    expect(execute).toHaveBeenCalledWith('step4', 'diff for /repo against main');
  });

  it('runStep4() falls back to the default base branch when config.STACKED_BASE_BRANCH is absent', async () => {
    const gitAdapter = makeGitAdapter(true);
    const prompter = makePrompter('y');
    const execute = vi.fn(async () => Result.ok('ok'));
    const extractGitDiff = vi.fn(async (_cwd: string, baseBranch: string) => `diff:${baseBranch}`);

    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo',
      {},
      extractGitDiff
    );

    await advancer.runStep4();

    expect(extractGitDiff).toHaveBeenCalledWith('/repo', 'develop');
  });

  it('does not double-invoke execute for a single logical attempt (idempotent re-entry, invariant 3)', async () => {
    const gitAdapter = makeGitAdapter(true);
    const prompter = makePrompter('y');
    const execute = vi.fn(async () => Result.ok('ok'));

    const advancer = new DefaultPipelineAdvancer(
      gitAdapter,
      prompter,
      { execute } as unknown as ExecuteStagePromptUseCase,
      '/repo'
    );

    await advancer.runStep3();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
