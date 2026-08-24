import type { AgentContext } from '../models/agent-context.js';
import type { AgentResult } from '../models/agent-result.js';

/** The shape any Sub-Agent must implement: run its stage logic against an AgentContext. */
export interface AgentPort {
  execute(context: AgentContext): Promise<AgentResult>;
}
