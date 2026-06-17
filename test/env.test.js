import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvFile } from '../src/lib/env.js';

test('loadEnvFile lets project .env override inherited provider variables', async () => {
  const root = path.resolve('.tmp', `env-test-${Date.now()}`);
  const envPath = path.join(root, '.env');
  const previous = process.env.OPENAI_API_KEY;
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(envPath, 'OPENAI_API_KEY=project-key\n', 'utf8');
    process.env.OPENAI_API_KEY = 'inherited-key';

    loadEnvFile(envPath);

    assert.equal(process.env.OPENAI_API_KEY, 'project-key');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('loadEnvFile can preserve inherited variables when override is disabled', async () => {
  const root = path.resolve('.tmp', `env-no-override-test-${Date.now()}`);
  const envPath = path.join(root, '.env');
  const previous = process.env.OPENAI_API_KEY;
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(envPath, 'OPENAI_API_KEY=project-key\n', 'utf8');
    process.env.OPENAI_API_KEY = 'inherited-key';

    loadEnvFile(envPath, { override: false });

    assert.equal(process.env.OPENAI_API_KEY, 'inherited-key');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
