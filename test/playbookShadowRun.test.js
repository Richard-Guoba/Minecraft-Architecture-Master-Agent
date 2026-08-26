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

test('report does not turn accepted LLM prose into a new report claim', async () => {
  const files = await buildShadowArtifacts({
    projectRoot: ROOT,
    blueprintBytes: blueprintBytesFor('A compact medieval timber house.'),
    blueprintRelativePath: 'blueprint.json',
    mode: 'llm',
    createClient: () => explanatoryClient()
  });

  assert.equal(JSON.parse(files['explanation.json']).status, 'available');
  assert.doesNotMatch(files['report.md'].toString('utf8'), /UNTRUSTEDTEXT/u);
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

function explanatoryClient() {
  return {
    name: 'fixture-llm',
    isConfigured: () => true,
    chatJson: async ({ user }) => ({
      review_hash: user.review_hash,
      layer_explanations: user.allowed_layers.map((layer) => ({
        layer,
        explanation: 'UNTRUSTEDTEXT'
      })),
      rule_explanations: user.rules.map((rule) => ({
        rule_id: rule.rule_id,
        status: rule.status,
        repair_operation_id: rule.repair_operation_id,
        explanation: 'UNTRUSTEDTEXT'
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
