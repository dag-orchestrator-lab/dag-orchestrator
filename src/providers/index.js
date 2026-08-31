import { ProviderFactory } from '../../dist/src/infrastructure/llm/provider-factory.js';
import { GetProviderForStageUseCase } from '../../dist/src/application/llm/get-provider-for-stage-use-case.js';
import { ExecuteStagePromptUseCase } from '../../dist/src/application/llm/execute-stage-prompt-use-case.js';
import { buildPrompt } from './prompts.js';

const factory = new ProviderFactory();
const getProviderForStageUseCase = new GetProviderForStageUseCase(factory);
const executeStagePromptUseCase = new ExecuteStagePromptUseCase(factory);

/**
 * @param {string} stageName
 * @param {object} [customConfig]
 * @returns {{ name: string, model: string, type: string, instance: import('../domain/llm/ports/llm-provider-port.js').LLMProviderPort }}
 */
export function getProviderForStage(stageName, customConfig) {
  const result = getProviderForStageUseCase.execute(stageName, customConfig);
  if (result.isErr) {
    throw new Error(result.error.message);
  }
  const handle = result.value;
  return { name: handle.type, model: handle.model, type: handle.type, instance: handle.instance };
}

/**
 * @param {string} stageName
 * @param {any} prompt
 * @param {string} [systemPrompt]
 * @param {object} [options]
 * @returns {Promise<string>}
 */
export async function executeStagePrompt(stageName, prompt, systemPrompt, options) {
  const { finalPrompt, systemPrompt: sysPrompt } = buildPrompt(stageName, prompt, options);
  const result = await executeStagePromptUseCase.execute(stageName, finalPrompt, systemPrompt || sysPrompt, options);
  
  if (result && typeof result === 'string' && /hit your session limit/i.test(result)) {
    throw new Error(`Model provider rate limit / session limit reached: ${result}`);
  }

  if (result.isErr) {
    throw new Error(result.error.message);
  }
  return result.value || result;
}
