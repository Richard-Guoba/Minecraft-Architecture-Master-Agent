import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmClient } from '../src/llm/createLlmClient.js';

test('defaults to the Zhipu API channel', () => {
  const client = createLlmClient({ env: {}, cwd: process.cwd() });
  assert.equal(client.name, 'zhipu');
  assert.equal(client.isConfigured(), false);
});

test('keeps the legacy Zhipu channel selectable', () => {
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

test('keeps the legacy OpenAI-compatible channel selectable', () => {
  const client = createLlmClient({
    env: {
      LLM_PROVIDER: 'openai-compatible',
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: 'https://example.test/v1',
      OPENAI_MODEL: 'test-model'
    },
    cwd: process.cwd()
  });

  assert.equal(client.name, 'openai-compatible');
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
