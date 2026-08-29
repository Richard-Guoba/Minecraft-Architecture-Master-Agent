import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLlmClient,
  LLM_PROVIDERS,
  normalizeLlmProvider
} from '../src/llm/createLlmClient.js';

test('defaults to the Zhipu API channel', () => {
  const client = createLlmClient({ env: {}, cwd: process.cwd() });
  assert.equal(client.name, 'zhipu');
  assert.equal(client.isConfigured(), false);
});

test('keeps the Zhipu API channel selectable', () => {
  const client = createLlmClient({
    env: {
      LLM_PROVIDER: 'zhipu',
      ZHIPU_API_KEY: 'test-key',
      ZHIPU_BASE_URL: 'https://example.test/api/paas/v4',
      ZHIPU_MODEL: 'glm-test'
    },
    cwd: process.cwd()
  });

  assert.equal(client.name, 'zhipu');
  assert.equal(client.isConfigured(), true);
});

test('keeps the OpenAI-compatible channel selectable', () => {
  const client = createLlmClient({
    env: {
      LLM_PROVIDER: 'openai-compatible',
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://example.test/v1',
      OPENAI_MODEL: 'test-model',
      OPENAI_THINKING: 'disabled'
    },
    cwd: process.cwd()
  });

  assert.equal(client.name, 'openai-compatible');
  assert.equal(client.isConfigured(), true);
  assert.deepEqual(client.responseFormat, { type: 'json_object' });
  assert.equal(client.maxTokens, 4096);
  assert.deepEqual(client.thinking, { type: 'disabled' });
});

test('defaults DeepSeek OpenAI-compatible calls to the Pro model', () => {
  const client = createLlmClient({
    env: {
      LLM_PROVIDER: 'openai-compatible',
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://api.deepseek.com'
    },
    cwd: process.cwd()
  });

  assert.equal(client.name, 'openai-compatible');
  assert.equal(client.model, 'deepseek-v4-pro');
  assert.equal(client.isConfigured(), true);
});

test('does not switch the default away from Zhipu when OpenAI-compatible vars exist', () => {
  const client = createLlmClient({
    env: {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://example.test/v1',
      OPENAI_MODEL: 'test-model'
    },
    cwd: process.cwd()
  });

  assert.equal(client.name, 'zhipu');
});

test('request provider override wins over LLM_PROVIDER', () => {
  const client = createLlmClient({
    provider: 'codex',
    env: {
      LLM_PROVIDER: 'zhipu',
      ZHIPU_API_KEY: 'must-not-be-selected',
      CODEX_COMMAND: 'missing-codex-for-selection-test'
    },
    cwd: process.cwd()
  });

  assert.equal(client.name, 'codex');
  assert.equal('clients' in client, false);
});

test('environment-selected Codex is fail-closed', () => {
  const client = createLlmClient({
    env: {
      LLM_PROVIDER: 'codex',
      CODEX_COMMAND: 'missing-codex-for-selection-test',
      ZHIPU_API_KEY: 'must-not-be-used'
    },
    cwd: process.cwd()
  });

  assert.equal(client.name, 'codex');
  assert.equal('clients' in client, false);
});

test('auto remains the only fallback policy', () => {
  const client = createLlmClient({
    provider: 'auto',
    env: {
      ZHIPU_API_KEY: 'configured-api',
      ZHIPU_BASE_URL: 'https://example.test/api/paas/v4'
    },
    cwd: process.cwd()
  });

  assert.equal(client.name, 'codex -> zhipu');
  assert.equal(Array.isArray(client.clients), true);
});

test('normalizes provider aliases and rejects unsupported overrides', () => {
  assert.equal(normalizeLlmProvider(' OPENAI_COMPATIBLE '), 'openai-compatible');
  assert.deepEqual(LLM_PROVIDERS, [
    'auto', 'codex', 'openai', 'openai-compatible', 'zhipu'
  ]);
  assert.throws(
    () => createLlmClient({ provider: 'private-provider-value', env: {} }),
    /Unsupported LLM provider: private-provider-value/u
  );
});
