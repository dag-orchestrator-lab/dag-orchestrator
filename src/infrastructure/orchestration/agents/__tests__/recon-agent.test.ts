import { describe, it, expect, vi } from 'vitest';
import { ReconAgent, RECON_ARTIFACT_FILENAME } from '../recon-agent.js';
import { AgentExecutionError } from '../../../../domain/orchestration/errors/agent-execution-error.js';
import { STAGE_COMPLETE_EVENT_NAME } from '../../../../domain/orchestration/events/stage-complete-event.js';
import type { IpcBusPort } from '../../../../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../../../../domain/orchestration/ports/llm-client-port.js';

function createIpcBus(): IpcBusPort {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
  };
}

function createWorkspaceFileSystem(overrides: Partial<WorkspaceFileSystemPort> = {}): WorkspaceFileSystemPort {
  return {
    readFile: vi.fn(async () => 'requirements content'),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => true),
    readFeedbackRecord: vi.fn(async () => '{}'),
    writeFeedbackRecord: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    complete: vi.fn(async () => '# Recon Report'),
    ...overrides,
  };
}

describe('ReconAgent', () => {
  it('has role "recon"', () => {
    const agent = new ReconAgent(createIpcBus(), createWorkspaceFileSystem(), createLlmClient());
    expect(agent.role).toBe('recon');
  });

  it('throws AgentExecutionError when requirementsPath is missing', async () => {
    const agent = new ReconAgent(createIpcBus(), createWorkspaceFileSystem(), createLlmClient());

    await expect(
      agent.execute({ workspaceSlug: 'epic-2-agents', requirementsPath: '' })
    ).rejects.toMatchObject({
      role: 'recon',
      workspaceSlug: 'epic-2-agents',
      cycle: undefined,
    });

    await expect(
      agent.execute({ workspaceSlug: 'epic-2-agents', requirementsPath: '' })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError when the requirements file cannot be read', async () => {
    const workspaceFileSystem = createWorkspaceFileSystem({
      readFile: vi.fn(async () => {
        throw new Error('ENOENT');
      }),
    });
    const agent = new ReconAgent(createIpcBus(), workspaceFileSystem, createLlmClient());

    await expect(
      agent.execute({ workspaceSlug: 'epic-2-agents', requirementsPath: '00-requirements.md' })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('writes 01-recon.md, publishes exactly one STAGE_COMPLETE, and returns a verdict-free result', async () => {
    const ipcBus = createIpcBus();
    const workspaceFileSystem = createWorkspaceFileSystem();
    const llmClient = createLlmClient();
    const agent = new ReconAgent(ipcBus, workspaceFileSystem, llmClient);

    const result = await agent.execute({
      workspaceSlug: 'epic-2-agents',
      requirementsPath: '00-requirements.md',
    });

    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'epic-2-agents',
      RECON_ARTIFACT_FILENAME,
      '# Recon Report'
    );

    expect(ipcBus.publish).toHaveBeenCalledTimes(1);
    expect(ipcBus.publish).toHaveBeenCalledWith(
      STAGE_COMPLETE_EVENT_NAME,
      expect.objectContaining({
        role: 'recon',
        workspaceSlug: 'epic-2-agents',
        artifactPath: RECON_ARTIFACT_FILENAME,
      })
    );

    expect(result).toEqual({ role: 'recon', artifactPath: RECON_ARTIFACT_FILENAME });
    expect(result.verdict).toBeUndefined();
    expect(result.feedback).toBeUndefined();
  });
});
