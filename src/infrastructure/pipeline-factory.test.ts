import { describe, it, expect, vi } from 'vitest';
import { createPipelineAdvancer } from './pipeline-factory.js';
import { SwarmPipelineAdvancer } from '../application/pipeline/pipeline-advancer.js';
import { WorkspaceConfigLoader } from './orchestration/config/workspace-config-loader.js';
import { ReconAgent } from './orchestration/agents/recon-agent.js';
import { ArchitectAgent } from './orchestration/agents/architect-agent.js';
import { SkepticAgent } from './orchestration/agents/skeptic-agent.js';
import { PlannerAgent } from './orchestration/agents/planner-agent.js';
import type { IpcBusPort } from '../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../domain/orchestration/ports/llm-client-port.js';

function createIpcBus(): IpcBusPort {
  return { publish: vi.fn(), subscribe: vi.fn() };
}

function createWorkspaceFileSystem(): WorkspaceFileSystemPort {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    fileExists: vi.fn(),
    readFeedbackRecord: vi.fn(),
    writeFeedbackRecord: vi.fn(),
  };
}

function createLlmClient(): LlmClientPort {
  return { complete: vi.fn() };
}

describe('createPipelineAdvancer', () => {
  it('wires the Coder/Fixer/Reviewer agents into a SwarmPipelineAdvancer alongside the unchanged upstream agents', () => {
    const deps = {
      ipcBus: createIpcBus(),
      workspaceFileSystem: createWorkspaceFileSystem(),
      llmClient: createLlmClient(),
    };

    const bundle = createPipelineAdvancer(deps);

    expect(bundle.swarmPipelineAdvancer).toBeInstanceOf(SwarmPipelineAdvancer);
    expect(bundle.workspaceConfigLoader).toBeInstanceOf(WorkspaceConfigLoader);
    expect(bundle.reconAgent).toBeInstanceOf(ReconAgent);
    expect(bundle.architectAgent).toBeInstanceOf(ArchitectAgent);
    expect(bundle.skepticAgent).toBeInstanceOf(SkepticAgent);
    expect(bundle.plannerAgent).toBeInstanceOf(PlannerAgent);
  });

  it('returns a fresh SwarmPipelineAdvancer with no tracked stage for an unseen feature', () => {
    const deps = {
      ipcBus: createIpcBus(),
      workspaceFileSystem: createWorkspaceFileSystem(),
      llmClient: createLlmClient(),
    };

    const bundle = createPipelineAdvancer(deps);

    expect(bundle.swarmPipelineAdvancer.getStage('unseen-feature')).toBeUndefined();
  });
});
