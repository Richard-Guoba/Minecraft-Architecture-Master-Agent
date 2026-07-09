import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('project docs surface the completed Stage 6 status', async () => {
  const [home, readme, roadmap] = await Promise.all([
    fs.readFile('docs/index.html', 'utf8'),
    fs.readFile('README.md', 'utf8'),
    fs.readFile('docs/roadmap.md', 'utf8')
  ]);

  assert.match(home, /Stage 6 Semantic Patch Completion/);
  assert.match(home, /291 \/ 291/);
  assert.match(home, /Semantic patch dataset/);
  assert.match(home, /query:patches/);
  assert.match(home, /Stage 5 - Neural Retrieval[\s\S]*Completed/);
  assert.match(home, /Stage 6 - Semantic Patch Completion[\s\S]*Completed/);

  assert.match(readme, /Active stage: Stage 6 semantic patch completion/);
  assert.match(readme, /Semantic patch layer:/);
  assert.match(readme, /npm run query:patches/);

  assert.match(roadmap, /当前 MVP 状态：Stage 6/);
  assert.match(roadmap, /semantic_patch_dataset\.json/);
  assert.match(roadmap, /query:patches/);
});
