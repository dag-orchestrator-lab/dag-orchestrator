import {
  geminiPromptRefine,
  geminiRecon,
  geminiSkeptic,
  geminiLayerFanout,
  geminiPlanConformance,
  geminiRepoImpactReview,
  FLASH_MODEL,
  PRO_MODEL
} from '../gemini.js';
import {
  claudeDraftContract,
  claudePlanMerger,
  claudeImplementTask,
  claudeCodeReview
} from '../claude.js';
import { createOpenAIProvider, createOllamaProvider } from './openai.js';
import { loadConfig } from '../config.js';

export function getProviderForStage(stageName, customConfig = {}) {
  const config = { ...loadConfig(), ...customConfig };
  const providerKey = `PROVIDER_${stageName.toUpperCase()}`;
  const providerName = config[providerKey] || config.DEFAULT_PROVIDER_PRESET || 'gemini';

  switch (providerName.toLowerCase()) {
    case 'claude':
      let claudeModel = config.CLAUDE_MODEL || 'claude-sonnet-5';
      if (stageName === 'skeptic' && config.CLAUDE_SKEPTIC_MODEL) {
        claudeModel = config.CLAUDE_SKEPTIC_MODEL;
      } else if (stageName === 'coding' && config.CLAUDE_CODING_MODEL) {
        claudeModel = config.CLAUDE_CODING_MODEL;
      } else if (stageName === 'layers' && config.CLAUDE_LAYERS_MODEL) {
        claudeModel = config.CLAUDE_LAYERS_MODEL;
      }
      return {
        name: 'Claude Code CLI',
        model: claudeModel,
        type: 'claude'
      };

    case 'openai':
    case 'deepseek':
      return {
        name: 'DeepSeek / OpenAI',
        model: config.OPENAI_MODEL || 'deepseek-chat',
        instance: createOpenAIProvider(config),
        type: 'openai'
      };

    case 'ollama':
    case 'local':
      return {
        name: 'Ollama Local',
        model: config.OLLAMA_MODEL || 'qwen2.5-coder',
        instance: createOllamaProvider(config),
        type: 'ollama'
      };

    case 'gemini':
    default:
      const model = stageName === 'recon' || stageName === 'skeptic' || stageName === 'review'
        ? (config.GEMINI_PRO_MODEL || PRO_MODEL)
        : (config.GEMINI_FLASH_MODEL || FLASH_MODEL);
      return {
        name: 'Google AI Studio',
        model,
        type: 'gemini'
      };
  }
}

export async function executeStagePrompt(stageName, prompt, systemPrompt = '', options = {}) {
  const provider = getProviderForStage(stageName, options.config);

  if (provider.type === 'gemini') {
    if (stageName === 'refine') return await geminiPromptRefine(prompt);
    if (stageName === 'recon') return await geminiRecon(prompt, options.repoContext);
    if (stageName === 'skeptic') return await geminiSkeptic(prompt);
    if (stageName === 'layers') return await geminiLayerFanout(options.layerType, prompt, options.reconText);
    if (stageName === 'conformance') return await geminiPlanConformance(options.contractText, options.tasksText, options.gitDiff);
    if (stageName === 'review' || stageName === 'impact') return await geminiRepoImpactReview(prompt || options.diffText, options.repoContext);
  }

  if (provider.type === 'claude') {
    if (stageName === 'contract') return await claudeDraftContract(options.reqText, options.reconText, options.templateText, options.cwd, options.feedback);
    if (stageName === 'merge') return await claudePlanMerger(options.contractText, options.layerPlans, options.findingsText, options.cwd);
    if (stageName === 'coding') return await claudeImplementTask(options.taskText, options.contractText, options.cwd);
    if (stageName === 'review' || stageName === 'code-review') return await claudeCodeReview(options.diffText || prompt, options.reviewRulesText, options.cwd);
  }

  // Fallback to OpenAI / Ollama generic provider interface
  if (provider.instance) {
    return await provider.instance.generate(prompt, systemPrompt, options);
  }

  throw new Error(`Unsupported provider: ${provider.name} for stage ${stageName}`);
}
