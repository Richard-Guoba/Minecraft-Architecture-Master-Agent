import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SHADOW_OUTPUT_FILES } from '../src/playbook/shadow/constants.js';
import { validateManifest } from '../src/playbook/shadow/contracts.js';
import { buildShadowArtifacts, runShadowReview } from '../src/playbook/shadow/runShadowReview.js';

const ROOT = path.resolve(import.meta.dirname, '..');

test('mock orchestration produces exactly five stable artifacts', async () => {
  const blueprintBytes = blueprintBytesFor('A compact medieval timber house.');
  const first = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes,
    blueprintRelativePath: 'blueprint.json',
    mode: 'mock'
  });
  const second = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes,
    blueprintRelativePath: 'blueprint.json',
    mode: 'mock'
  });

  assert.deepEqual(Object.keys(first), SHADOW_OUTPUT_FILES);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(JSON.parse(first['review.json']).assessments.length, 21);
  assert.equal(validateManifest(JSON.parse(first['manifest.json'])).mode, 'mock');
  const report = first['report.md'].toString('utf8');
  for (const section of [
    '# 建筑秘籍 P4 影子审查', '## 边界声明', '## 输入身份', '## 九层覆盖',
    '## 分层结论', '## 逐规则记录', '## 缺失证据', '## 解释状态'
  ]) assert.match(report, new RegExp(section, 'u'));
  assert.match(report, /没有视觉输入/u);
  assert.match(report, /没有修改建筑/u);
  assert.doesNotMatch(report, /评分：|获胜/u);
});

test('LLM failure changes no authoritative review or prompt bytes', async () => {
  const blueprintBytes = blueprintBytesFor('A compact medieval timber house.');
  const mock = await buildShadowArtifacts({
    projectRoot: ROOT, blueprintBytes, blueprintRelativePath: 'blueprint.json', mode: 'mock'
  });
  const failed = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes,
    blueprintRelativePath: 'blueprint.json',
    mode: 'llm',
    createClient: () => rejectingClient()
  });

  assert.deepEqual(failed['review.json'], mock['review.json']);
  assert.deepEqual(failed['prompt-packet.json'], mock['prompt-packet.json']);
  assert.equal(JSON.parse(failed['explanation.json']).error_code, 'LLM_REQUEST_FAILED');
  assert.match(failed['report.md'].toString('utf8'), /LLM_REQUEST_FAILED/u);
  assert.doesNotMatch(failed['report.md'].toString('utf8'), /provider failure secret/u);
});

test('invalid LLM prose candidates preserve authority artifacts and persist none of their text', async () => {
  const blueprintBytes = blueprintBytesFor('A compact medieval timber house.');
  const mock = await buildShadowArtifacts({
    projectRoot: ROOT, blueprintBytes, blueprintRelativePath: 'blueprint.json', mode: 'mock'
  });
  for (const prose of [
    '12, 64, -3',
    'Replace /architecture/volumes/0 with a wider mass.',
    'rate this 9 out of 10',
    'wider than 12 blocks',
    'arbitrary invented natural-language prose',
    'minecraft:diamond_block at /architecture/invented/path'
  ]) {
    const failed = await buildShadowArtifacts({
      projectRoot: ROOT,
      blueprintBytes,
      blueprintRelativePath: 'blueprint.json',
      mode: 'llm',
      createClient: () => proseClient(prose)
    });
    const explanation = JSON.parse(failed['explanation.json']);

    assert.deepEqual(failed['review.json'], mock['review.json']);
    assert.deepEqual(failed['prompt-packet.json'], mock['prompt-packet.json']);
    assert.equal(explanation.status, 'unavailable');
    assert.equal(explanation.error_code, 'LLM_OUTPUT_INVALID');
    assert.equal(failed['explanation.json'].includes(prose), false);
  }
});

test('report does not promote accepted LLM reference selections into a new report claim', async () => {
  const files = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes: blueprintBytesFor('A compact medieval timber house.'),
    blueprintRelativePath: 'blueprint.json',
    mode: 'llm',
    createClient: () => selectingClient()
  });

  const explanation = JSON.parse(files['explanation.json']);
  assert.equal(explanation.status, 'available');
  assert.match(explanation.rule_explanations[0].explanation, /reference_indexes=/u);
  assert.doesNotMatch(files['explanation.json'].toString('utf8'), /A compact medieval timber house/u);
  assert.doesNotMatch(files['report.md'].toString('utf8'), /reference_indexes=/u);
});

test('orchestration rejects malformed blueprint bytes before producing artifacts', async () => {
  await assert.rejects(
    buildShadowArtifacts({
      projectRoot: ROOT,
      blueprintBytes: Buffer.from('{not-json', 'utf8'),
      blueprintRelativePath: 'blueprint.json',
      mode: 'mock'
    }),
    (error) => error?.code === 'BLUEPRINT_INVALID'
  );
});

test('admitted orchestration installs an immutable summary under the run only', async (t) => {
  const fixture = await runFixture(t);
  const result = await runShadowReview({
    projectRoot: fixture.root,
    runArg: 'out/run',
    mode: 'mock',
    fsImpl: fs
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.status, 'created');
  assert.equal(result.mode, 'mock');
  assert.equal(result.run_relative_path, 'out/run');
  assert.equal(result.assessment_count, 21);
  assert.equal(result.explanation_status, 'available');
  assert.deepEqual(Object.keys(result.artifact_hashes), SHADOW_OUTPUT_FILES);
  assert.deepEqual(
    (await fs.readdir(path.join(fixture.runPath, 'playbook-shadow'))).sort(),
    [...SHADOW_OUTPUT_FILES].sort()
  );
  assert.equal(await fs.readFile(path.join(fixture.runPath, 'blueprint.json'), 'utf8'), fixture.blueprintBytes.toString('utf8'));
});

test('admitted orchestration reviews a generator-compatible negative seed', async (t) => {
  const fixture = await runFixture(t, -7);

  const result = await runShadowReview({
    projectRoot: fixture.root,
    runArg: 'out/run',
    mode: 'mock',
    fsImpl: fs
  });
  const review = JSON.parse(await fs.readFile(
    path.join(fixture.runPath, 'playbook-shadow', 'review.json'),
    'utf8'
  ));

  assert.equal(result.status, 'created');
  assert.equal(review.input.seed, -7);
  assert.equal(await fs.readFile(path.join(fixture.runPath, 'blueprint.json'), 'utf8'), fixture.blueprintBytes.toString('utf8'));
});

function blueprintBytesFor(prompt, seed = 7) {
  return Buffer.from(JSON.stringify({
    workflow: 'construction_method_v1',
    seed,
    prompt,
    architecture: {
      style: 'medieval',
      style_family: 'timber-frame',
      typology: 'house',
      volumes: [
        volume('main', [1, 1, 1], { relation: 'center' }, ['primary-mass'], 'main-building-envelope'),
        volume('left', [0.4, 0.6, 0.5], { relation: 'attached-west', attach_to: 'main' }, ['secondary-mass']),
        volume('right', [0.5, 0.7, 0.4], { relation: 'attached-east', attach_to: 'main' }, ['secondary-mass'])
      ]
    },
    structure: {
      structural_intent: { floor_count: 2 },
      load_paths: [{ from: 'roof', through: 'post', to: 'foundation' }]
    },
    roof: { overhang: 1 },
    facade: {}
  }));
}

function volume(id, scale, placement, tags, purpose) {
  return { id, shape: 'box', scale, placement, tags, purpose };
}

function rejectingClient() {
  return {
    name: 'fixture-llm',
    isConfigured: () => true,
    chatJson: async () => { throw new Error('provider failure secret'); }
  };
}

function selectingClient() {
  return {
    name: 'fixture-llm',
    isConfigured: () => true,
    chatJson: async ({ user }) => ({
      review_hash: user.review_hash,
      layer_selections: user.allowed_layers.map((layer) => ({
        layer,
        selected_rule_ids: user.rules
          .filter((rule) => rule.design_layer === layer)
          .slice(0, 1)
          .map((rule) => rule.rule_id)
      })),
      rule_selections: user.rules.map((rule) => ({
        rule_id: rule.rule_id,
        status: rule.status,
        repair_operation_id: rule.repair_operation_id,
        selected_observations: rule.observations.slice(0, 1),
        selected_missing_signals: rule.observations.length === 0
          ? rule.missing_signals.slice(0, 1)
          : [],
        selected_unknown_ids: []
      })),
      overall_unknown_references: []
    })
  };
}

function proseClient(prose) {
  return {
    name: 'fixture-llm',
    isConfigured: () => true,
    chatJson: async ({ user }) => ({
      review_hash: user.review_hash,
      layer_explanations: user.allowed_layers.map((layer) => ({ layer, explanation: prose })),
      rule_explanations: user.rules.map((rule) => ({
        rule_id: rule.rule_id,
        status: rule.status,
        repair_operation_id: rule.repair_operation_id,
        explanation: prose
      })),
      overall_unknowns: []
    })
  };
}

async function runFixture(t, seed = 7) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-shadow-run-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runPath = path.join(root, 'out', 'run');
  await fs.mkdir(runPath, { recursive: true });
  const blueprintBytes = blueprintBytesFor('A compact medieval timber house.', seed);
  await fs.writeFile(path.join(runPath, 'blueprint.json'), blueprintBytes);
  for (const relativePath of [
    'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl',
    'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json',
    'docs/architecture-playbook/manual/coverage-v0.1.json'
  ]) {
    const destination = path.join(root, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(ROOT, relativePath), destination);
  }
  return { root, runPath, blueprintBytes };
}
