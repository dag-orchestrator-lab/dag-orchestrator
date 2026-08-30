import { NodeSubprocessAdapter } from './orchestration/adapters/node-subprocess-adapter.js';
import { WorkspaceConfigLoader } from './orchestration/config/workspace-config-loader.js';
import { ReconAgent } from './orchestration/agents/recon-agent.js';
import { ArchitectAgent } from './orchestration/agents/architect-agent.js';
import { SkepticAgent } from './orchestration/agents/skeptic-agent.js';
import { PlannerAgent } from './orchestration/agents/planner-agent.js';
import { CoderAgent } from '../application/orchestration/agents/coder-agent.js';
import { FixerAgent } from '../application/orchestration/agents/fixer-agent.js';
import { ReviewerAgent } from '../application/orchestration/agents/reviewer-agent.js';
import { SwarmPipelineAdvancer } from '../application/pipeline/pipeline-advancer.js';
import type { IpcBusPort } from '../domain/orchestration/ports/ipc-bus-port.js';
import type { WorkspaceFileSystemPort } from '../domain/orchestration/ports/workspace-file-system-port.js';
import type { LlmClientPort } from '../domain/orchestration/ports/llm-client-port.js';

/** External collaborators the composition root must supply; everything else is constructed internally. */
export interface CreatePipelineAdvancerDeps {
  readonly ipcBus: IpcBusPort;
  readonly workspaceFileSystem: WorkspaceFileSystemPort;
  readonly llmClient: LlmClientPort;
}

/** The fully-wired Swarm Engine agents plus the advancer that drives the Coder/Fixer/Reviewer stages. */
export interface PipelineAdvancerBundle {
  readonly swarmPipelineAdvancer: SwarmPipelineAdvancer;
  readonly workspaceConfigLoader: WorkspaceConfigLoader;
  readonly reconAgent: ReconAgent;
  readonly architectAgent: ArchitectAgent;
  readonly skepticAgent: SkepticAgent;
  readonly plannerAgent: PlannerAgent;
}

/**
 * Composition root for the Swarm Engine's seven agents: constructs the new `SubprocessExecutionPort`
 * adapter, the `verify` config loader, and the Coder/Fixer/Reviewer agents, then wires them into a
 * `SwarmPipelineAdvancer` alongside the existing Recon/Architect/Skeptic/Planner agents (unchanged).
 * @param deps - the external collaborators (`IpcBusPort`, `WorkspaceFileSystemPort`, `LlmClientPort`) to inject.
 * @returns the wired `SwarmPipelineAdvancer`, its `WorkspaceConfigLoader`, and the four upstream agents.
 */
export function createPipelineAdvancer(deps: CreatePipelineAdvancerDeps): PipelineAdvancerBundle {
  const subprocessExecution = new NodeSubprocessAdapter();
  const workspaceConfigLoader = new WorkspaceConfigLoader(deps.workspaceFileSystem);

  const reconAgent = new ReconAgent(deps.ipcBus, deps.workspaceFileSystem, deps.llmClient);
  const architectAgent = new ArchitectAgent(deps.ipcBus, deps.workspaceFileSystem, deps.llmClient);
  const skepticAgent = new SkepticAgent(deps.ipcBus, deps.workspaceFileSystem, deps.llmClient);
  const plannerAgent = new PlannerAgent(deps.ipcBus, deps.workspaceFileSystem, deps.llmClient);

  const coderAgent = new CoderAgent(deps.llmClient, deps.workspaceFileSystem, subprocessExecution, deps.ipcBus);
  const fixerAgent = new FixerAgent(deps.llmClient, deps.workspaceFileSystem, subprocessExecution, deps.ipcBus);
  const reviewerAgent = new ReviewerAgent(deps.workspaceFileSystem, deps.ipcBus);

  const swarmPipelineAdvancer = new SwarmPipelineAdvancer({
    coderAgent,
    fixerAgent,
    reviewerAgent,
    ipcBus: deps.ipcBus,
  });

  return {
    swarmPipelineAdvancer,
    workspaceConfigLoader,
    reconAgent,
    architectAgent,
    skepticAgent,
    plannerAgent,
  };
}
