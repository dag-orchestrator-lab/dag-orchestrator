import fs from 'node:fs';
import path from 'node:path';
import { getFeatureWorkspaceDir } from './state.js';
import { loadConfig } from './config.js';

// Standard public pricing per 1M tokens (USD)
export const MODEL_PRICING = {
  // Free / Enterprise tiers
  'gemini-3.6-flash': { inputPerM: 0.00, outputPerM: 0.00, name: 'Google Gemini 3.6 Flash (Free/Enterprise)' },
  'gemini-3.6-pro': { inputPerM: 0.00, outputPerM: 0.00, name: 'Google Gemini 3.6 Pro (Free/Enterprise)' },
  
  // Claude / Anthropic Frontier Pricing
  'claude-sonnet-5': { inputPerM: 3.00, outputPerM: 15.00, name: 'Anthropic Claude Sonnet 5' },
  'claude-opus-5': { inputPerM: 15.00, outputPerM: 75.00, name: 'Anthropic Claude Opus 5' },
  
  // DeepSeek / OpenAI API Pricing
  'deepseek-chat': { inputPerM: 0.27, outputPerM: 1.10, name: 'DeepSeek-V3 API' },
  'deepseek-reasoner': { inputPerM: 0.55, outputPerM: 2.19, name: 'DeepSeek-R1 API' },
  'gpt-4o': { inputPerM: 2.50, outputPerM: 10.00, name: 'OpenAI GPT-4o' },
  
  // Local / Air-Gapped via Ollama
  'ollama': { inputPerM: 0.00, outputPerM: 0.00, name: 'Local Ollama (Self-Hosted)' }
};

export function estimateTokenCount(text) {
  if (!text) return 0;
  // 1 token ~= 3.8 to 4 characters in code/english text
  return Math.ceil(text.length / 3.8);
}

export function recordStageMetrics(stageName, providerName, modelName, inputText, outputText, cwd = process.cwd()) {
  const workspaceDir = getFeatureWorkspaceDir(cwd);
  const metricsFile = path.join(workspaceDir, '.dag-metrics.json');
  
  let metrics = { stages: [] };
  if (fs.existsSync(metricsFile)) {
    try {
      metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
    } catch (e) {}
  }

  const inputTokens = estimateTokenCount(inputText);
  const outputTokens = estimateTokenCount(outputText);
  
  // Find pricing key
  const pricingKey = Object.keys(MODEL_PRICING).find(k => modelName.toLowerCase().includes(k)) || 'ollama';
  const pricing = MODEL_PRICING[pricingKey] || { inputPerM: 0, outputPerM: 0 };
  
  const cost = (inputTokens / 1_000_000 * pricing.inputPerM) + (outputTokens / 1_000_000 * pricing.outputPerM);

  metrics.stages.push({
    timestamp: new Date().toISOString(),
    stage: stageName,
    provider: providerName,
    model: modelName,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCost: cost
  });

  try {
    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
  } catch (e) {}
}

export function getFeatureBenchmark(cwd = process.cwd()) {
  const workspaceDir = getFeatureWorkspaceDir(cwd);
  const metricsFile = path.join(workspaceDir, '.dag-metrics.json');
  const config = loadConfig(cwd);
  
  // Parse comparison models list (comma-separated, capped at max 3)
  const configuredModels = config.BENCHMARK_MODELS 
    ? config.BENCHMARK_MODELS.split(',').map(m => m.trim().toLowerCase()).filter(Boolean)
    : ['claude-sonnet-5', 'gpt-4o', 'deepseek-chat'];

  const targetModels = configuredModels.slice(0, 3); // Capped at 3 for clean display

  let stages = [];
  if (fs.existsSync(metricsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
      stages = data.stages || [];
    } catch (e) {}
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let actualCost = 0;

  for (const s of stages) {
    totalInputTokens += s.inputTokens || 0;
    totalOutputTokens += s.outputTokens || 0;
    actualCost += s.estimatedCost || 0;
  }

  const totalTokens = totalInputTokens + totalOutputTokens;

  // Calculate comparisons against all target models
  const comparisons = targetModels.map(modelKey => {
    const matchedKey = Object.keys(MODEL_PRICING).find(k => k === modelKey || modelKey.includes(k)) || 'claude-sonnet-5';
    const pricing = MODEL_PRICING[matchedKey] || MODEL_PRICING['claude-sonnet-5'];
    
    const baselineCost = (totalInputTokens / 1_000_000 * pricing.inputPerM) + 
                         (totalOutputTokens / 1_000_000 * pricing.outputPerM);
    
    const savingsUSD = Math.max(0, baselineCost - actualCost);
    const savingsPct = baselineCost > 0 ? ((savingsUSD / baselineCost) * 100).toFixed(1) : '0.0';

    return {
      modelKey: matchedKey,
      name: pricing.name,
      baselineCost: Number(baselineCost.toFixed(4)),
      savingsUSD: Number(savingsUSD.toFixed(4)),
      savingsPct: `${savingsPct}%`
    };
  });

  return {
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    actualCost: Number(actualCost.toFixed(4)),
    comparisons,
    stageCount: stages.length
  };
}
