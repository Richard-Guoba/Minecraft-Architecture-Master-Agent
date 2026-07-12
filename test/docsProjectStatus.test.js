import fs from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('project docs retain completed Stage 5 and Stage 6 capabilities', async () => {
  const [home, readme, roadmap] = await Promise.all([
    fs.readFile('docs/index.html', 'utf8'),
    fs.readFile('README.md', 'utf8'),
    fs.readFile('docs/roadmap.md', 'utf8')
  ]);
  assert.match(home, /Full Node Suite/);
  assert.match(home, /Semantic patch dataset/);
  assert.match(home, /query:patches/);
  assert.match(home, /Stage 5 - Neural Retrieval[\s\S]*Completed/);
  assert.match(home, /Stage 6 - Semantic Patch Completion[\s\S]*Completed/);
  assert.match(readme, /Semantic patch layer:/);
  assert.match(readme, /npm run query:patches/);
  assert.match(roadmap, /当前 MVP 状态：Stage 6/);
  assert.match(roadmap, /semantic_patch_dataset\.json/);
  assert.match(roadmap, /query:patches/);
});

test('project docs surface Stage 7 M2 dataset governance as work in progress', async () => {
  const [home, readme, roadmap, agent] = await Promise.all([
    fs.readFile('docs/index.html', 'utf8'), fs.readFile('README.md', 'utf8'),
    fs.readFile('docs/roadmap.md', 'utf8'), fs.readFile('AGENT.md', 'utf8')
  ]);
  assert.match(home, /Stage 7 M2 Whole-Building Dataset/);
  assert.match(home, /Full Node Suite/);
  assert.match(home, /Stage 6 - Semantic Patch Completion[\s\S]*Completed/);
  assert.match(home, /Stage 7 - Coarse Semantic Voxels[\s\S]*In Progress/);
  assert.match(home, /review|governance/i);
  assert.match(readme, /Active stage: Stage 7 Milestone 2/);
  assert.match(readme, /--coarse-voxel-mode shadow/);
  assert.match(readme, /stage7_coarse_semantic_plan\.repaired\.json/);
  assert.match(readme, /does not change primary geometry/i);
  assert.match(readme, /npm run dataset:stage7/);
  assert.match(roadmap, /当前 M2 状态：Stage 7/);
  assert.match(roadmap, /shadow mode/);
  assert.match(roadmap, /stage7-template-\*/);
  assert.match(agent, /当前阶段：Stage 7 Milestone 2/);
  for (const text of [home,readme,roadmap,agent]) {
    assert.match(text,/review|审核/i);
    assert.match(text,/license|许可/i);
    assert.doesNotMatch(text,/Stage 7[^\n]*(?:<em>Completed|状态：已完成)/i);
  }
  assert.doesNotMatch(agent, /下一阶段：Stage 3 Concept Studio/);
});
