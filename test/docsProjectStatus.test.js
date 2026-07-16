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

test('project docs surface Stage 7 M2.5 trusted-data readiness as work in progress', async () => {
  const [home, readme, roadmap, agent] = await Promise.all([
    fs.readFile('docs/index.html', 'utf8'), fs.readFile('README.md', 'utf8'),
    fs.readFile('docs/roadmap.md', 'utf8'), fs.readFile('AGENT.md', 'utf8')
  ]);
  assert.match(home, /Stage 7 M2\.5 Trusted Data/);
  assert.match(home, /Full Node Suite/);
  assert.match(home, /Stage 6 - Semantic Patch Completion[\s\S]*Completed/);
  assert.match(home, /Stage 7 - Coarse Semantic Voxels[\s\S]*In Progress/);
  assert.match(home, /review|governance/i);
  assert.match(readme, /Active stage: Stage 7 Milestone 2\.5/);
  assert.match(readme, /--coarse-voxel-mode shadow/);
  assert.match(readme, /stage7_coarse_semantic_plan\.repaired\.json/);
  assert.match(readme, /does not change primary geometry/i);
  assert.match(readme, /npm run dataset:stage7/);
  assert.match(readme, /npm run review-pack:stage7/);
  assert.match(roadmap, /当前 M2\.5 状态：Stage 7/);
  assert.match(roadmap, /shadow mode/);
  assert.match(roadmap, /stage7-template-\*/);
  assert.match(agent, /当前阶段：Stage 7 Milestone 2\.5/);
  for (const text of [home,readme,roadmap,agent]) assert.match(text,/0[^\n]*(?:reviewed|审核结果)|(?:reviewed|审核结果)[^\n]*0/i);
  for (const text of [home,readme,roadmap,agent]) {
    assert.match(text,/review|审核/i);
    assert.match(text,/license|许可/i);
    assert.doesNotMatch(text,/Stage 7[^\n]*(?:<em>Completed|状态：已完成)/i);
  }
  assert.doesNotMatch(agent, /下一阶段：Stage 3 Concept Studio/);
});

test('Stage 7 private training documents interruptible local operation', async () => {
  const [packageText, stage7Readme] = await Promise.all([
    fs.readFile('package.json', 'utf8'),
    fs.readFile('training/stage7/README.md', 'utf8'),
  ]);
  const pkg = JSON.parse(packageText);
  assert.equal(
    pkg.scripts['pause:stage7:private-research'],
    'conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.pause_private_research',
  );
  assert.equal(
    pkg.scripts['resume:stage7:private-research'],
    'conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.resume_private_research',
  );
  assert.equal(
    pkg.scripts['monitor:stage7:private-research'],
    'conda run -n mcagent-stage7 --cwd training/stage7 python -m mcagent_stage7.monitor_private_research',
  );
  assert.match(stage7Readme, /--show-private-loss/);
  assert.match(stage7Readme, /five active minutes/i);
  assert.match(stage7Readme, /two overwritten slots/i);
  assert.match(stage7Readme, /1\.5 GiB/);
  assert.match(stage7Readme, /device=cpu,steps=185946/);
});
