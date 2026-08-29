import type { AgentRole } from '../../domain/orchestration/models/agent-role.js';
import type { AgentContext } from '../../domain/orchestration/models/agent-context.js';
import type { AgentResult } from '../../domain/orchestration/models/agent-result.js';
import type { IpcBusPort } from '../../domain/orchestration/ports/ipc-bus-port.js';
import { STAGE_COMPLETE_EVENT_NAME, type StageCompleteEvent } from '../../domain/orchestration/events/stage-complete-event.js';

/** Shared foundation for concrete Sub-Agents (Recon, Architect, Skeptic) — each runs once and exits. */
export abstract class SubAgentBase {
  abstract readonly role: AgentRole;

  abstract execute(context: AgentContext): Promise<AgentResult>;

  protected constructor(protected readonly ipcBus: IpcBusPort) {}

  /** Publishes STAGE_COMPLETE — the only event a Sub-Agent is permitted to emit. */
  protected publishStageComplete(payload: StageCompleteEvent): void {
    this.ipcBus.publish(STAGE_COMPLETE_EVENT_NAME, payload);
  }
}
