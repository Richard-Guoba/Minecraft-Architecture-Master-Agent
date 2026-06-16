import { CodexClient } from './CodexClient.js';
import { ZhipuClient } from './ZhipuClient.js';

export function createLlmClient({ env = process.env, cwd = process.cwd() } = {}) {
  const provider = normalizeProvider(env.LLM_PROVIDER || 'zhipu');

  if (provider === 'zhipu') {
    return createZhipuClient(env);
  }
  if (provider === 'openai' || provider === 'openai-compatible') {
    return createOpenAiCompatibleClient(env);
  }
  if (provider === 'legacy') {
    return createLegacyCompatibleClient(env);
  }
  if (provider === 'auto') {
    return new FallbackLlmClient([
      createCodexClient(env, cwd),
      createLegacyCompatibleClient(env)
    ]);
  }
  if (provider === 'codex') {
    return new FallbackLlmClient([
      createCodexClient(env, cwd),
      createLegacyCompatibleClient(env)
    ]);
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${env.LLM_PROVIDER}`);
}

class FallbackLlmClient {
  constructor(clients) {
    this.clients = clients.filter(Boolean);
    this.name = this.clients
      .filter((client) => client.isConfigured())
      .map((client) => client.name)
      .join(' -> ') || 'unconfigured';
  }

  isConfigured() {
    return this.clients.some((client) => client.isConfigured());
  }

  async chatJson(input) {
    const errors = [];
    for (const client of this.clients) {
      if (!client.isConfigured()) continue;
      try {
        return await client.chatJson(input);
      } catch (error) {
        errors.push(`${client.name}: ${error.message}`);
      }
    }
    throw new Error(errors.length ? errors.join(' | ') : 'No LLM provider is configured.');
  }
}

function createCodexClient(env, cwd) {
  return new CodexClient({
    command: env.CODEX_COMMAND || 'codex',
    args: env.CODEX_ARGS,
    timeoutMs: env.CODEX_TIMEOUT_MS,
    cwd
  });
}

function createLegacyCompatibleClient(env) {
  if (env.ZHIPU_API_KEY || env.ZHIPU_BASE_URL || env.ZHIPU_MODEL) {
    return createZhipuClient(env);
  }
  return createOpenAiCompatibleClient(env);
}

function createZhipuClient(env) {
  return new ZhipuClient({
    name: 'zhipu',
    apiKey: env.ZHIPU_API_KEY,
    baseUrl: env.ZHIPU_BASE_URL,
    model: env.ZHIPU_MODEL || 'glm-4-flash'
  });
}

function createOpenAiCompatibleClient(env) {
  return new ZhipuClient({
    name: 'openai-compatible',
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL
  });
}

function normalizeProvider(provider) {
  return String(provider).trim().toLowerCase().replace(/_/g, '-');
}
