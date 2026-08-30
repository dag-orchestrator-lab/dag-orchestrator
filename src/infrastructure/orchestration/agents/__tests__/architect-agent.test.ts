import { describe, it, expect, vi } from 'vitest';
import { ArchitectAgent, ARCHITECT_ARTIFACT_FILENAME } from '../architect-agent.js';
import { AgentExecutionError } from '../../../../domain/orchestration/errors/agent-execution-error.js';
import { STAGE_COMPLETE_EVENT_NAME } from '../../../../domain/orchestration/events/stage-complete-event.js';
import type { IpcBusPort } from '../../../../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../../../../domain/orchestration/ports/llm-client-port.js';
import type { ContractFeedbackRecord } from '../../../../domain/orchestration/models/contract-feedback-record.js';

function createIpcBus(): IpcBusPort {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
  };
}

function createWorkspaceFileSystem(overrides: Partial<WorkspaceFileSystemPort> = {}): WorkspaceFileSystemPort {
  return {
    readFile: vi.fn(async () => 'file content'),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => true),
    readFeedbackRecord: vi.fn(async () => '{}'),
    writeFeedbackRecord: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    complete: vi.fn(async () => '<contract># Contracts Document</contract>'),
    ...overrides,
  };
}

const feedback: readonly ContractFeedbackRecord[] = [
  { cycle: 1, raisedAt: '2026-01-01T00:00:00.000Z', findings: [{ section: 'Ports', issue: 'missing', severity: 'BLOCKER' }] },
];

describe('ArchitectAgent', () => {
  it('has role "architect"', () => {
    const agent = new ArchitectAgent(createIpcBus(), createWorkspaceFileSystem(), createLlmClient());
    expect(agent.role).toBe('architect');
  });

  it('throws AgentExecutionError in first-pass mode when reconPath is missing', async () => {
    const agent = new ArchitectAgent(createIpcBus(), createWorkspaceFileSystem(), createLlmClient());

    await expect(
      agent.execute({ workspaceSlug: 'epic-2-agents', requirementsPath: '00-requirements.md' })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError in first-pass mode when the recon file does not exist', async () => {
    const workspaceFileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async (_slug: string, path: string) => path !== '01-recon.md'),
    });
    const agent = new ArchitectAgent(createIpcBus(), workspaceFileSystem, createLlmClient());

    await expect(
      agent.execute({
        workspaceSlug: 'epic-2-agents',
        requirementsPath: '00-requirements.md',
        reconPath: '01-recon.md',
      })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError in revision mode when contractsPath is not set', async () => {
    const agent = new ArchitectAgent(createIpcBus(), createWorkspaceFileSystem(), createLlmClient());

    await expect(
      agent.execute({
        workspaceSlug: 'epic-2-agents',
        requirementsPath: '00-requirements.md',
        reconPath: '01-recon.md',
        pendingFeedback: feedback,
      })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError in revision mode when the referenced contracts file does not exist', async () => {
    const workspaceFileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async () => false),
    });
    const agent = new ArchitectAgent(createIpcBus(), workspaceFileSystem, createLlmClient());

    await expect(
      agent.execute({
        workspaceSlug: 'epic-2-agents',
        requirementsPath: '00-requirements.md',
        reconPath: '01-recon.md',
        contractsPath: '02-contracts.md',
        pendingFeedback: feedback,
      })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError when the LLM response has no <contract> block', async () => {
    const llmClient = createLlmClient({ complete: vi.fn(async () => 'plain text, no tags') });
    const agent = new ArchitectAgent(createIpcBus(), createWorkspaceFileSystem(), llmClient);

    await expect(
      agent.execute({
        workspaceSlug: 'epic-2-agents',
        requirementsPath: '00-requirements.md',
        reconPath: '01-recon.md',
      })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('writes 02-contracts.md and publishes STAGE_COMPLETE in first-pass mode', async () => {
    const ipcBus = createIpcBus();
    const workspaceFileSystem = createWorkspaceFileSystem();
    const llmClient = createLlmClient();
    const agent = new ArchitectAgent(ipcBus, workspaceFileSystem, llmClient);

    const result = await agent.execute({
      workspaceSlug: 'epic-2-agents',
      requirementsPath: '00-requirements.md',
      reconPath: '01-recon.md',
    });

    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'epic-2-agents',
      ARCHITECT_ARTIFACT_FILENAME,
      '# Contracts Document'
    );
    expect(ipcBus.publish).toHaveBeenCalledTimes(1);
    expect(ipcBus.publish).toHaveBeenCalledWith(
      STAGE_COMPLETE_EVENT_NAME,
      expect.objectContaining({ role: 'architect', artifactPath: ARCHITECT_ARTIFACT_FILENAME })
    );
    expect(result).toEqual({ role: 'architect', artifactPath: ARCHITECT_ARTIFACT_FILENAME });
  });

  it('appends the addendum to existing contract content rather than replacing it in revision mode', async () => {
    const workspaceFileSystem = createWorkspaceFileSystem({
      readFile: vi.fn(async () => '# Existing Contract\nOriginal section text.'),
    });
    const llmClient = createLlmClient({
      complete: vi.fn(async () => '<contract>## Revision Cycle 1 Addendum\nAddressed BLOCKER finding.</contract>'),
    });
    const agent = new ArchitectAgent(createIpcBus(), workspaceFileSystem, llmClient);

    await agent.execute({
      workspaceSlug: 'epic-2-agents',
      requirementsPath: '00-requirements.md',
      reconPath: '01-recon.md',
      contractsPath: '02-contracts.md',
      pendingFeedback: feedback,
    });

    const writtenContent = (workspaceFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][2] as string;
    expect(writtenContent).toContain('# Existing Contract');
    expect(writtenContent).toContain('Original section text.');
    expect(writtenContent).toContain('## Revision Cycle 1 Addendum');
    expect(writtenContent.indexOf('Original section text.')).toBeLessThan(
      writtenContent.indexOf('## Revision Cycle 1 Addendum')
    );
  });
});
