import { describe, it, expect, vi } from 'vitest';
import { SkepticAgent, SKEPTIC_ARTIFACT_FILENAME } from '../skeptic-agent.js';
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
    readFile: vi.fn(async () => '# Contracts Document'),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => true),
    readFeedbackRecord: vi.fn(async () => '{}'),
    writeFeedbackRecord: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    complete: vi.fn(async () => JSON.stringify({ verdict: 'APPROVED', findings: [] })),
    ...overrides,
  };
}

describe('SkepticAgent', () => {
  it('has role "skeptic"', () => {
    const agent = new SkepticAgent(createIpcBus(), createWorkspaceFileSystem(), createLlmClient());
    expect(agent.role).toBe('skeptic');
  });

  it('throws AgentExecutionError when contractsPath is missing', async () => {
    const agent = new SkepticAgent(createIpcBus(), createWorkspaceFileSystem(), createLlmClient());

    await expect(
      agent.execute({ workspaceSlug: 'epic-2-agents', requirementsPath: '00-requirements.md' })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError when the contracts file does not exist', async () => {
    const workspaceFileSystem = createWorkspaceFileSystem({ fileExists: vi.fn(async () => false) });
    const agent = new SkepticAgent(createIpcBus(), workspaceFileSystem, createLlmClient());

    await expect(
      agent.execute({
        workspaceSlug: 'epic-2-agents',
        requirementsPath: '00-requirements.md',
        contractsPath: '02-contracts.md',
      })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError when the LLM response is invalid JSON', async () => {
    const llmClient = createLlmClient({ complete: vi.fn(async () => 'not json at all') });
    const agent = new SkepticAgent(createIpcBus(), createWorkspaceFileSystem(), llmClient);

    await expect(
      agent.execute({
        workspaceSlug: 'epic-2-agents',
        requirementsPath: '00-requirements.md',
        contractsPath: '02-contracts.md',
      })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError when the LLM response does not match the verdict schema', async () => {
    const llmClient = createLlmClient({ complete: vi.fn(async () => JSON.stringify({ foo: 'bar' })) });
    const agent = new SkepticAgent(createIpcBus(), createWorkspaceFileSystem(), llmClient);

    await expect(
      agent.execute({
        workspaceSlug: 'epic-2-agents',
        requirementsPath: '00-requirements.md',
        contractsPath: '02-contracts.md',
      })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('returns REJECTED with non-empty feedback.findings when a BLOCKER finding is present', async () => {
    const ipcBus = createIpcBus();
    const llmClient = createLlmClient({
      complete: vi.fn(async () =>
        JSON.stringify({
          verdict: 'REJECTED',
          findings: [
            { section: 'Ports', issue: 'missing adapter', severity: 'BLOCKER' },
            { section: 'Events', issue: 'minor nit', severity: 'WARNING' },
          ],
        })
      ),
    });
    const agent = new SkepticAgent(ipcBus, createWorkspaceFileSystem(), llmClient);

    const result = await agent.execute({
      workspaceSlug: 'epic-2-agents',
      requirementsPath: '00-requirements.md',
      contractsPath: '02-contracts.md',
    });

    expect(result.verdict).toBe('REJECTED');
    expect(result.feedback).toBeDefined();
    expect(result.feedback!.findings.length).toBeGreaterThan(0);
    expect(result.feedback!.cycle).toBe(1);
    expect(ipcBus.publish).toHaveBeenCalledWith(
      STAGE_COMPLETE_EVENT_NAME,
      expect.objectContaining({ role: 'skeptic', artifactPath: SKEPTIC_ARTIFACT_FILENAME })
    );
  });

  it('forces REJECTED even when the LLM claims APPROVED but a BLOCKER finding is present', async () => {
    const llmClient = createLlmClient({
      complete: vi.fn(async () =>
        JSON.stringify({
          verdict: 'APPROVED',
          findings: [{ section: 'Ports', issue: 'missing adapter', severity: 'BLOCKER' }],
        })
      ),
    });
    const agent = new SkepticAgent(createIpcBus(), createWorkspaceFileSystem(), llmClient);

    const result = await agent.execute({
      workspaceSlug: 'epic-2-agents',
      requirementsPath: '00-requirements.md',
      contractsPath: '02-contracts.md',
    });

    expect(result.verdict).toBe('REJECTED');
    expect(result.feedback!.findings.length).toBeGreaterThan(0);
  });

  it('returns APPROVED with feedback undefined when there are no BLOCKER findings', async () => {
    const llmClient = createLlmClient({
      complete: vi.fn(async () =>
        JSON.stringify({
          verdict: 'APPROVED',
          findings: [{ section: 'Events', issue: 'minor nit', severity: 'WARNING' }],
        })
      ),
    });
    const agent = new SkepticAgent(createIpcBus(), createWorkspaceFileSystem(), llmClient);

    const result = await agent.execute({
      workspaceSlug: 'epic-2-agents',
      requirementsPath: '00-requirements.md',
      contractsPath: '02-contracts.md',
    });

    expect(result.verdict).toBe('APPROVED');
    expect(result.feedback).toBeUndefined();
  });

  it('derives cycle from pendingFeedback length for the audit prompt and resulting feedback record', async () => {
    const llmClient = createLlmClient({
      complete: vi.fn(async () =>
        JSON.stringify({
          verdict: 'REJECTED',
          findings: [{ section: 'Ports', issue: 'still missing', severity: 'BLOCKER' }],
        })
      ),
    });
    const agent = new SkepticAgent(createIpcBus(), createWorkspaceFileSystem(), llmClient);

    const result = await agent.execute({
      workspaceSlug: 'epic-2-agents',
      requirementsPath: '00-requirements.md',
      contractsPath: '02-contracts.md',
      pendingFeedback: [
        { cycle: 1, raisedAt: '2026-01-01T00:00:00.000Z', findings: [{ section: 'Ports', issue: 'x', severity: 'BLOCKER' }] },
      ],
    });

    expect(result.feedback!.cycle).toBe(2);
  });
});
