import { describe, it, expect, vi } from 'vitest';
import {
  PlannerAgent,
  PLANNER_DOMAIN_ARTIFACT_FILENAME,
  PLANNER_APP_INFRA_ARTIFACT_FILENAME,
  PLANNER_DATA_ARTIFACT_FILENAME,
  PLANNER_FINDINGS_ARTIFACT_FILENAME,
  PLANNER_CHECKLIST_ARTIFACT_FILENAME,
} from '../planner-agent.js';
import { AgentExecutionError } from '../../../../domain/orchestration/errors/agent-execution-error.js';
import { STAGE_COMPLETE_EVENT_NAME } from '../../../../domain/orchestration/events/stage-complete-event.js';
import type { IpcBusPort } from '../../../../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../../../../domain/orchestration/ports/llm-client-port.js';

const VALID_TASK = `### [ ] T-1 Do the thing
Depends on: none
Lane: domain
Files: src/domain/thing.ts
Done when: thing exists
Check: npm test src/domain/__tests__/thing.test.ts`;

const INVALID_TASK = `### [ ] T-1 Do the thing
Depends on: none
Lane: domain
Done when: thing exists`;

function wrap(tag: string, content: string): string {
  return `<${tag}>${content}</${tag}>`;
}

function createIpcBus(): IpcBusPort {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
  };
}

function createWorkspaceFileSystem(overrides: Partial<WorkspaceFileSystemPort> = {}): WorkspaceFileSystemPort {
  return {
    readFile: vi.fn(async () => '# Content'),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(async () => true),
    readFeedbackRecord: vi.fn(async () => '{}'),
    writeFeedbackRecord: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createHappyPathLlmClient(): LlmClientPort {
  const complete = vi
    .fn()
    .mockResolvedValueOnce(wrap('layer_plan', 'domain work'))
    .mockResolvedValueOnce(wrap('layer_plan', 'app-infra work'))
    .mockResolvedValueOnce(wrap('layer_plan', 'data work'))
    .mockResolvedValueOnce(wrap('findings', 'no conflicts'))
    .mockResolvedValueOnce(wrap('checklist', VALID_TASK));
  return { complete };
}

const baseContext = {
  workspaceSlug: 'checkout-flow',
  requirementsPath: '00-requirements.md',
  reconPath: '01-recon.md',
  contractsPath: '02-contracts.md',
};

describe('PlannerAgent', () => {
  it('has role "planner"', () => {
    const agent = new PlannerAgent(createIpcBus(), createWorkspaceFileSystem(), createHappyPathLlmClient());
    expect(agent.role).toBe('planner');
  });

  it('throws AgentExecutionError when contractsPath is missing', async () => {
    const agent = new PlannerAgent(createIpcBus(), createWorkspaceFileSystem(), createHappyPathLlmClient());

    await expect(
      agent.execute({ workspaceSlug: 'checkout-flow', requirementsPath: '00-requirements.md', reconPath: '01-recon.md' })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError when reconPath is missing', async () => {
    const agent = new PlannerAgent(createIpcBus(), createWorkspaceFileSystem(), createHappyPathLlmClient());

    await expect(
      agent.execute({ workspaceSlug: 'checkout-flow', requirementsPath: '00-requirements.md', contractsPath: '02-contracts.md' })
    ).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError when the contracts file does not exist', async () => {
    const workspaceFileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async (_slug: string, path: string) => path !== '02-contracts.md'),
    });
    const agent = new PlannerAgent(createIpcBus(), workspaceFileSystem, createHappyPathLlmClient());

    await expect(agent.execute(baseContext)).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('throws AgentExecutionError when the recon file does not exist', async () => {
    const workspaceFileSystem = createWorkspaceFileSystem({
      fileExists: vi.fn(async (_slug: string, path: string) => path !== '01-recon.md'),
    });
    const agent = new PlannerAgent(createIpcBus(), workspaceFileSystem, createHappyPathLlmClient());

    await expect(agent.execute(baseContext)).rejects.toBeInstanceOf(AgentExecutionError);
  });

  it('runs the three layer-plan calls, findings call, and merge call, then writes and announces all five artifacts', async () => {
    const ipcBus = createIpcBus();
    const workspaceFileSystem = createWorkspaceFileSystem();
    const llmClient = createHappyPathLlmClient();
    const agent = new PlannerAgent(ipcBus, workspaceFileSystem, llmClient);

    const result = await agent.execute(baseContext);

    expect(llmClient.complete).toHaveBeenCalledTimes(5);
    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'checkout-flow',
      PLANNER_DOMAIN_ARTIFACT_FILENAME,
      'domain work'
    );
    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'checkout-flow',
      PLANNER_APP_INFRA_ARTIFACT_FILENAME,
      'app-infra work'
    );
    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'checkout-flow',
      PLANNER_DATA_ARTIFACT_FILENAME,
      'data work'
    );
    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'checkout-flow',
      PLANNER_FINDINGS_ARTIFACT_FILENAME,
      'no conflicts'
    );
    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'checkout-flow',
      PLANNER_CHECKLIST_ARTIFACT_FILENAME,
      VALID_TASK
    );

    expect(ipcBus.publish).toHaveBeenCalledTimes(5);
    for (const stageName of ['03-domain', '03-app-infra', '03-data', '04-layer-findings', '05-tasks']) {
      expect(ipcBus.publish).toHaveBeenCalledWith(
        STAGE_COMPLETE_EVENT_NAME,
        expect.objectContaining({ role: 'planner', workspaceSlug: 'checkout-flow', stageName })
      );
    }

    expect(result).toEqual({
      role: 'planner',
      artifactPath: PLANNER_CHECKLIST_ARTIFACT_FILENAME,
      artifactsProduced: [
        PLANNER_DOMAIN_ARTIFACT_FILENAME,
        PLANNER_APP_INFRA_ARTIFACT_FILENAME,
        PLANNER_DATA_ARTIFACT_FILENAME,
        PLANNER_FINDINGS_ARTIFACT_FILENAME,
        PLANNER_CHECKLIST_ARTIFACT_FILENAME,
      ],
      status: 'COMPLETED',
    });
  });

  it('auto-heals once when the merged checklist fails pre-flight verification, then succeeds', async () => {
    const llmClient: LlmClientPort = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(wrap('layer_plan', 'domain work'))
        .mockResolvedValueOnce(wrap('layer_plan', 'app-infra work'))
        .mockResolvedValueOnce(wrap('layer_plan', 'data work'))
        .mockResolvedValueOnce(wrap('findings', 'no conflicts'))
        .mockResolvedValueOnce(wrap('checklist', INVALID_TASK))
        .mockResolvedValueOnce(wrap('checklist', VALID_TASK)),
    };
    const workspaceFileSystem = createWorkspaceFileSystem();
    const agent = new PlannerAgent(createIpcBus(), workspaceFileSystem, llmClient);

    const result = await agent.execute(baseContext);

    expect(llmClient.complete).toHaveBeenCalledTimes(6);
    expect(workspaceFileSystem.writeFile).toHaveBeenCalledWith(
      'checkout-flow',
      PLANNER_CHECKLIST_ARTIFACT_FILENAME,
      VALID_TASK
    );
    expect(result.status).toBe('COMPLETED');
  });

  it('throws AgentExecutionError when the healed checklist still fails pre-flight verification', async () => {
    const llmClient: LlmClientPort = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(wrap('layer_plan', 'domain work'))
        .mockResolvedValueOnce(wrap('layer_plan', 'app-infra work'))
        .mockResolvedValueOnce(wrap('layer_plan', 'data work'))
        .mockResolvedValueOnce(wrap('findings', 'no conflicts'))
        .mockResolvedValueOnce(wrap('checklist', INVALID_TASK))
        .mockResolvedValueOnce(wrap('checklist', INVALID_TASK)),
    };
    const workspaceFileSystem = createWorkspaceFileSystem();
    const agent = new PlannerAgent(createIpcBus(), workspaceFileSystem, llmClient);

    await expect(agent.execute(baseContext)).rejects.toBeInstanceOf(AgentExecutionError);
    expect(llmClient.complete).toHaveBeenCalledTimes(6);
    expect(workspaceFileSystem.writeFile).not.toHaveBeenCalledWith(
      'checkout-flow',
      PLANNER_CHECKLIST_ARTIFACT_FILENAME,
      expect.anything()
    );
  });

  it('propagates a rejection if any of the three parallel layer-plan calls fails, writing no layer files', async () => {
    const llmClient: LlmClientPort = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(wrap('layer_plan', 'domain work'))
        .mockRejectedValueOnce(new Error('provider timeout'))
        .mockResolvedValueOnce(wrap('layer_plan', 'data work')),
    };
    const workspaceFileSystem = createWorkspaceFileSystem();
    const agent = new PlannerAgent(createIpcBus(), workspaceFileSystem, llmClient);

    await expect(agent.execute(baseContext)).rejects.toThrow('provider timeout');
    expect(workspaceFileSystem.writeFile).not.toHaveBeenCalled();
  });
});
