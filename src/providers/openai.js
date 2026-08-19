import { loadConfig } from '../config.js';

export class OpenAICompatibleProvider {
  constructor(options = {}) {
    this.name = options.name || 'OpenAI-Compatible';
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.apiKey = options.apiKey || '';
    this.model = options.model || 'gpt-4o';
  }

  async generate(prompt, systemInstruction = '', options = {}) {
    if (!this.apiKey) {
      throw new Error(`API key missing for provider ${this.name}. Set DEEPSEEK_API_KEY, OPENAI_API_KEY, or run \`dag config\`.`);
    }

    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature || 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${this.name} API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

export function createOpenAIProvider(customConfig = {}) {
  const config = { ...loadConfig(), ...customConfig };
  const apiKey = config.DEEPSEEK_API_KEY || config.OPENAI_API_KEY || '';
  const baseUrl = config.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
  const model = config.OPENAI_MODEL || 'deepseek-chat';

  return new OpenAICompatibleProvider({
    name: 'OpenAI/DeepSeek',
    apiKey,
    baseUrl,
    model
  });
}

export function createOllamaProvider(customConfig = {}) {
  const config = { ...loadConfig(), ...customConfig };
  const baseUrl = config.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
  const model = config.OLLAMA_MODEL || 'qwen2.5-coder:latest';

  return new OpenAICompatibleProvider({
    name: 'Ollama Local',
    apiKey: 'ollama-local', // Ollama doesn't require real key
    baseUrl,
    model
  });
}
