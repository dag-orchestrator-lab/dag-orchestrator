import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_PATH = path.join(os.homedir(), '.dag.env');

export const DEFAULT_CONFIG = {
  DEFAULT_HARNESS: 'standalone', // standalone | claude-cli | dsh | headless
  DEFAULT_PROVIDER_PRESET: 'hybrid', // hybrid | gemini | claude | deepseek | ollama
  
  // Workspace and Feature Spec Configuration
  SPECS_DIR: '', // empty = auto-detect or docs/features
  ACTIVE_FEATURE: '', // active feature folder name
  
  // Specific stage provider overrides
  PROVIDER_REFINE: 'gemini',
  PROVIDER_RECON: 'gemini',
  PROVIDER_CONTRACT: 'claude',
  PROVIDER_SKEPTIC: 'gemini',
  PROVIDER_LAYERS: 'gemini',
  PROVIDER_MERGE: 'claude',
  PROVIDER_CODING: 'claude',
  PROVIDER_CONFORMANCE: 'gemini',
  PROVIDER_REVIEW: 'gemini',

  // Model identifiers
  GEMINI_FLASH_MODEL: 'gemini-3.6-flash',
  GEMINI_PRO_MODEL: 'gemini-3.6-pro',
  CLAUDE_MODEL: 'claude-sonnet-5',
  OPENAI_MODEL: 'deepseek-chat',
  OPENAI_BASE_URL: 'https://api.deepseek.com/v1',
  OLLAMA_MODEL: 'qwen2.5-coder:latest',
  OLLAMA_BASE_URL: 'http://localhost:11434/v1'
};

export function loadConfig(cwd = process.cwd()) {
  const config = { ...DEFAULT_CONFIG };

  // 1. Read global ~/.dag.env
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const content = fs.readFileSync(CONFIG_PATH, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...rest] = trimmed.split('=');
        if (key && rest.length > 0) {
          const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
          config[key.trim()] = val;
        }
      }
    } catch (e) {}
  }

  // 2. Read local project config (.dag/config.json)
  const localConfigPath = path.join(cwd, '.dag', 'config.json');
  if (fs.existsSync(localConfigPath)) {
    try {
      const localJson = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
      Object.assign(config, localJson);
    } catch (e) {}
  }

  // 3. Merge process.env overrides
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (process.env[key]) {
      config[key] = process.env[key];
    }
  }

  // API keys from environment
  config.GEMINI_API_KEY = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY || '';
  config.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY || '';
  config.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || config.DEEPSEEK_API_KEY || '';
  config.OPENAI_API_KEY = process.env.OPENAI_API_KEY || config.OPENAI_API_KEY || '';

  return config;
}

export function saveLocalConfig(updates, cwd = process.cwd()) {
  const dagDir = path.join(cwd, '.dag');
  if (!fs.existsSync(dagDir)) {
    fs.mkdirSync(dagDir, { recursive: true });
  }
  const configPath = path.join(dagDir, 'config.json');
  let current = {};
  if (fs.existsSync(configPath)) {
    try {
      current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {}
  }
  const merged = { ...current, ...updates };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  return merged;
}

export function saveConfig(updates) {
  const current = loadConfig();
  const merged = { ...current, ...updates };

  const lines = [
    '# DAG Harness Configuration (~/.dag.env)',
    '# Auto-generated and managed via `dag config`',
    ''
  ];

  for (const [key, val] of Object.entries(merged)) {
    if (val !== undefined && val !== null) {
      lines.push(`${key}="${val}"`);
    }
  }

  const content = lines.join('\n') + '\n';

  // Try writing to ~/.dag.env, then fallback to local .env
  try {
    fs.writeFileSync(CONFIG_PATH, content);
  } catch (e) {
    try {
      const localEnv = path.join(process.cwd(), '.env');
      fs.writeFileSync(localEnv, content);
    } catch (err) {
      // Ignore if sandbox blocks write to homedir
    }
  }
}

export function listPresets(cwd = process.cwd()) {
  const builtIns = ['gemini', 'claude', 'deepseek', 'local', 'hybrid'];
  const config = loadConfig(cwd);
  const customPresets = config.CUSTOM_PRESETS ? JSON.parse(config.CUSTOM_PRESETS) : {};
  return { builtIns, custom: Object.keys(customPresets) };
}

export function saveCustomPreset(presetName, stageMapping, cwd = process.cwd()) {
  const config = loadConfig(cwd);
  let customPresets = {};
  if (config.CUSTOM_PRESETS) {
    try {
      customPresets = typeof config.CUSTOM_PRESETS === 'string' ? JSON.parse(config.CUSTOM_PRESETS) : config.CUSTOM_PRESETS;
    } catch (e) {}
  }

  customPresets[presetName.toLowerCase()] = stageMapping;
  const serialized = JSON.stringify(customPresets);
  saveConfig({ CUSTOM_PRESETS: serialized });
  saveLocalConfig({ CUSTOM_PRESETS: serialized }, cwd);
  return customPresets;
}

export function applyPreset(presetName, cwd = process.cwd()) {
  const updates = {};
  const lowerName = presetName.toLowerCase();
  const config = loadConfig(cwd);

  // Check custom presets first
  if (config.CUSTOM_PRESETS) {
    try {
      const customPresets = typeof config.CUSTOM_PRESETS === 'string' ? JSON.parse(config.CUSTOM_PRESETS) : config.CUSTOM_PRESETS;
      if (customPresets[lowerName]) {
        updates.DEFAULT_PROVIDER_PRESET = lowerName;
        Object.assign(updates, customPresets[lowerName]);
        saveConfig(updates);
        saveLocalConfig(updates, cwd);
        return updates;
      }
    } catch (e) {}
  }

  switch (lowerName) {
    case 'free':
    case 'gemini':
      updates.DEFAULT_PROVIDER_PRESET = 'gemini';
      updates.PROVIDER_REFINE = 'gemini';
      updates.PROVIDER_RECON = 'gemini';
      updates.PROVIDER_CONTRACT = 'gemini';
      updates.PROVIDER_SKEPTIC = 'gemini';
      updates.PROVIDER_LAYERS = 'gemini';
      updates.PROVIDER_MERGE = 'gemini';
      updates.PROVIDER_CODING = 'gemini';
      updates.PROVIDER_CONFORMANCE = 'gemini';
      updates.PROVIDER_REVIEW = 'gemini';
      break;

    case 'claude':
      updates.DEFAULT_PROVIDER_PRESET = 'claude';
      updates.PROVIDER_REFINE = 'claude';
      updates.PROVIDER_RECON = 'claude';
      updates.PROVIDER_CONTRACT = 'claude';
      updates.PROVIDER_SKEPTIC = 'claude';
      updates.PROVIDER_LAYERS = 'claude';
      updates.PROVIDER_MERGE = 'claude';
      updates.PROVIDER_CODING = 'claude';
      updates.PROVIDER_CONFORMANCE = 'claude';
      updates.PROVIDER_REVIEW = 'claude';
      break;

    case 'deepseek':
      updates.DEFAULT_PROVIDER_PRESET = 'deepseek';
      updates.PROVIDER_REFINE = 'openai';
      updates.PROVIDER_RECON = 'openai';
      updates.PROVIDER_CONTRACT = 'openai';
      updates.PROVIDER_SKEPTIC = 'openai';
      updates.PROVIDER_LAYERS = 'openai';
      updates.PROVIDER_MERGE = 'openai';
      updates.PROVIDER_CODING = 'openai';
      updates.PROVIDER_CONFORMANCE = 'openai';
      updates.PROVIDER_REVIEW = 'openai';
      break;

    case 'local':
    case 'ollama':
      updates.DEFAULT_PROVIDER_PRESET = 'ollama';
      updates.PROVIDER_REFINE = 'ollama';
      updates.PROVIDER_RECON = 'ollama';
      updates.PROVIDER_CONTRACT = 'ollama';
      updates.PROVIDER_SKEPTIC = 'ollama';
      updates.PROVIDER_LAYERS = 'ollama';
      updates.PROVIDER_MERGE = 'ollama';
      updates.PROVIDER_CODING = 'ollama';
      updates.PROVIDER_CONFORMANCE = 'ollama';
      updates.PROVIDER_REVIEW = 'ollama';
      break;

    case 'hybrid':
    default:
      updates.DEFAULT_PROVIDER_PRESET = 'hybrid';
      updates.PROVIDER_REFINE = 'gemini';
      updates.PROVIDER_RECON = 'gemini';
      updates.PROVIDER_CONTRACT = 'claude';
      updates.PROVIDER_SKEPTIC = 'gemini';
      updates.PROVIDER_LAYERS = 'gemini';
      updates.PROVIDER_MERGE = 'claude';
      updates.PROVIDER_CODING = 'claude';
      updates.PROVIDER_CONFORMANCE = 'gemini';
      updates.PROVIDER_REVIEW = 'gemini';
      break;
  }

  saveConfig(updates);
  saveLocalConfig(updates, cwd);
  syncDshConfig(cwd);
  return updates;
}

export function listHarnesses() {
  return [
    { name: 'standalone', desc: 'Native lightweight DAG CLI runner with ANSI status cards (Default)' },
    { name: 'dsh', desc: 'DeepSeek Harness process orchestrator & web UI runner' },
    { name: 'headless', desc: 'Zero-prompt JSON runner for CI/CD pipelines & background actions' }
  ];
}

export function setHarnessRunner(harnessName, cwd = process.cwd()) {
  const lower = harnessName.toLowerCase();
  const valid = ['standalone', 'dsh', 'headless'];
  if (!valid.includes(lower)) {
    throw new Error(`Invalid harness: "${harnessName}". Supported: ${valid.join(', ')}`);
  }
  const updates = { DEFAULT_HARNESS: lower };
  saveConfig(updates);
  saveLocalConfig(updates, cwd);
  return lower;
}

export function syncDshConfig(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const dshPath = path.join(cwd, 'dsh.config.yaml');
  
  const stageToDshModel = (provider) => {
    switch (provider) {
      case 'gemini': return 'gemini-pro';
      case 'claude': return 'claude-code';
      case 'openai': return 'deepseek-chat';
      case 'ollama': return 'ollama-local';
      default: return 'gemini-flash';
    }
  };

  const yamlContent = `# DeepSeek Harness (dsh) Multi-Agent Configuration
# Automatically synchronized with DAG config
version: "1.0"

models:
  gemini-flash:
    provider: google-ai-studio
    model: ${config.GEMINI_FLASH_MODEL || 'gemini-3.6-flash'}
  gemini-pro:
    provider: google-ai-studio
    model: ${config.GEMINI_PRO_MODEL || 'gemini-3.6-pro'}
    api_key: "\${GEMINI_API_KEY}"
    thinking_budget: 4096
  claude-code:
    provider: cli
    command: "claude -p"
  deepseek-chat:
    provider: openai-compatible
    base_url: "${config.OPENAI_BASE_URL || 'https://api.deepseek.com/v1'}"
    model: "${config.OPENAI_MODEL || 'deepseek-chat'}"
  ollama-local:
    provider: openai-compatible
    base_url: "${config.OLLAMA_BASE_URL || 'http://localhost:11434/v1'}"
    model: "${config.OLLAMA_MODEL || 'qwen2.5-coder:latest'}"

workflow:
  step_0_refine:
    model: ${stageToDshModel(config.PROVIDER_REFINE)}
    artifact: "00-requirements.md"
  step_1_contract:
    recon_model: ${stageToDshModel(config.PROVIDER_RECON)}
    spec_model: ${stageToDshModel(config.PROVIDER_CONTRACT)}
    skeptic_model: ${stageToDshModel(config.PROVIDER_SKEPTIC)}
    gate: "Gate 1 (Human Approval)"
    artifact: "02-contracts.md"
  step_2_layers:
    fanout_model: ${stageToDshModel(config.PROVIDER_LAYERS)}
    merger_model: ${stageToDshModel(config.PROVIDER_MERGE)}
    gate: "Gate 2 (Conflict Resolution)"
    artifact: "05-tasks.md"
  step_3_implement:
    coding_model: ${stageToDshModel(config.PROVIDER_CODING)}
    conformance_model: ${stageToDshModel(config.PROVIDER_CONFORMANCE)}
    artifact: "DIFF.patch"
  step_4_review:
    impact_model: ${stageToDshModel(config.PROVIDER_REVIEW)}
    review_model: ${stageToDshModel(config.PROVIDER_REVIEW)}
`;

  try {
    fs.writeFileSync(dshPath, yamlContent);
  } catch (e) {}
}
