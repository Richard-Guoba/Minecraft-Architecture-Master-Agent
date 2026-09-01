import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildDesignEnvelopePrompt,
  createFrozenDesignEnvelope
} from '../src/playbook/execute/designEnvelope.js';
import { runExecutablePlaybookPipeline } from '../src/playbook/execute/orchestrator.js';
import { buildPlaybookGuidedPrompt } from '../src/construction/designStages.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import {
  P7_ADVISORY_OVERLAY_PATH,
  loadP7AdvisoryOverlay
} from '../src/playbook/knowledge/p7AdvisoryOverlay.js';

const ROOT = path.resolve(import.meta.dirname, '..');

test('loads a bounded Chapter 1 subtitle advisory without changing reviewed-rule authority', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });

  assert.equal(P7_ADVISORY_OVERLAY_PATH,
    'docs/architecture-playbook/rules/schools/heihui-jileniao/p7-advisory-v0.2.json');
  assert.equal(overlay.school_id, 'heihui-jileniao');
  assert.equal(overlay.status, 'subtitle-derived-advisory');
  assert.equal(overlay.chapter_id, 'foundations-tools-blocks-modularity-color');
  assert.equal(overlay.source_bvids.length, 6);
  assert.equal(overlay.entries.length, 12);
  assert.equal(overlay.overlay_sha256.length, 64);
  assert.ok(overlay.entries.every((entry) => !entry.knowledge_id.startsWith('rule:')));
  assert.ok(overlay.entries.every((entry) => entry.intent.length <= 240));
  assert.ok(overlay.entries.every((entry) => entry.evidence_refs.length > 0));
  assert.ok(overlay.entries.every((entry) =>
    ['author_claim', 'inference', 'contrast'].includes(entry.classification)));
  assert.ok(Object.isFrozen(overlay));
  assert.ok(Object.isFrozen(overlay.entries));
});

test('rejects a symlink at the committed advisory path', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p7-advisory-symlink-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const managedPath = path.join(root, P7_ADVISORY_OVERLAY_PATH);
  const target = path.join(root, 'outside.json');
  await fs.mkdir(path.dirname(managedPath), { recursive: true });
  await fs.writeFile(target, '{}\n');
  await fs.symlink(target, managedPath);
  await assert.rejects(loadP7AdvisoryOverlay({ projectRoot: root }), {
    code: 'P7_ADVISORY_INVALID'
  });
});

test('execute loads the validated advisory and passes it to candidate design', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p7-advisory-execute-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });
  const calls = [];

  await assert.rejects(runExecutablePlaybookPipeline({
    playbook: 'execute',
    prompt: 'Build a medieval residence.',
    mode: 'llm',
    seed: 424242,
    outRoot,
    cwd: ROOT
  }, {
    createClient: () => ({ name: 'test-client' }),
    loadAdvisory: async ({ projectRoot }) => {
      assert.equal(projectRoot, ROOT);
      return overlay;
    },
    createEnvelope: async (input) => {
      calls.push(input.advisoryOverlay);
      const error = new Error('stop after observing design input');
      error.code = 'P5_AUTHORITY_INVALID';
      throw error;
    }
  }), { code: 'P5_AUTHORITY_INVALID' });

  assert.deepEqual(calls, [overlay]);
});

test('mock execute never loads the advisory and retains its original candidate input', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p7-advisory-mock-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  let loadCalls = 0;
  const candidateInputs = [];
  await assert.rejects(runExecutablePlaybookPipeline({
    playbook: 'execute', prompt: 'Build a medieval residence.', mode: 'mock',
    seed: 424242, outRoot, cwd: ROOT
  }, {
    loadAdvisory: async () => { loadCalls += 1; throw new Error('must not load'); },
    createEnvelope: async (input) => {
      candidateInputs.push(input);
      const error = new Error('stop'); error.code = 'P5_AUTHORITY_INVALID'; throw error;
    }
  }), { code: 'P5_AUTHORITY_INVALID' });
  assert.equal(loadCalls, 0);
  assert.equal(candidateInputs.length, 1);
  assert.equal(Object.hasOwn(candidateInputs[0], 'advisoryOverlay'), false);
});

test('execute rejects an injected advisory drift before creating any candidate', async (t) => {
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p7-advisory-drift-'));
  t.after(() => fs.rm(outRoot, { recursive: true, force: true }));
  const overlay = structuredClone(await loadP7AdvisoryOverlay({ projectRoot: ROOT }));
  delete overlay.overlay_sha256;
  overlay.entries[0].intent = 'Different but structurally valid bounded intent.';
  overlay.overlay_sha256 = sha256(stableJson(overlay));
  let candidateCalls = 0;

  await assert.rejects(runExecutablePlaybookPipeline({
    playbook: 'execute', prompt: 'Build a medieval residence.', mode: 'llm',
    seed: 424242, outRoot, cwd: ROOT
  }, {
    createClient: () => ({ name: 'test-client' }),
    loadAdvisory: async () => overlay,
    createEnvelope: async () => {
      candidateCalls += 1;
      const error = new Error('candidate should not start');
      error.code = 'P5_AUTHORITY_INVALID';
      throw error;
    }
  }), { code: 'P5_AUTHORITY_INVALID' });

  assert.equal(candidateCalls, 0);
});

test('projects the advisory into design intent input but never into reviewed rule authority', async () => {
  const [overlay, corpus] = await Promise.all([
    loadP7AdvisoryOverlay({ projectRoot: ROOT }),
    (await import('../src/playbook/shadow/corpus.js')).loadShadowCorpus({ projectRoot: ROOT })
  ]);

  const packet = buildDesignEnvelopePrompt({
    candidateId: 'candidate-01',
    seed: 1432164,
    prompt: 'Build a medieval residence.',
    cards: corpus.cards,
    advisoryOverlay: overlay
  });

  assert.deepEqual(packet.advisory_knowledge, {
    overlay_version: '0.2.0',
    overlay_sha256: overlay.overlay_sha256,
    status: 'subtitle-derived-advisory',
    authority: 'intent-guidance-only-not-reviewed-rules',
    entries: overlay.entries.map(({ knowledge_id, design_layers, intent }) => ({
      knowledge_id, design_layers, intent
    }))
  });
  assert.equal(packet.reviewed_rules.length, 21);
  assert.ok(packet.reviewed_rules.every(({ rule_id }) => rule_id.startsWith('rule:')));
  assert.ok(packet.advisory_knowledge.entries.every(({ knowledge_id }) =>
    !packet.output_contract.rule_id_order.includes(knowledge_id)));
  assert.ok(Object.isFrozen(packet.advisory_knowledge));
  assert.ok(packet.output_contract.fields.includes('advisory_overlay_sha256'));
});

test('binds the exact advisory hash into frozen LLM design and construction guidance', async () => {
  const [overlay, corpus] = await Promise.all([
    loadP7AdvisoryOverlay({ projectRoot: ROOT }),
    (await import('../src/playbook/shadow/corpus.js')).loadShadowCorpus({ projectRoot: ROOT })
  ]);
  const response = {
    schema_version: 1,
    candidate_id: 'candidate-01',
    seed: 1432164,
    brief_intent: 'medieval-residence',
    layer_intents: [
      { layer: 'brief', intent: 'check close and distant context' },
      { layer: 'massing', intent: 'use validated source modules' },
      { layer: 'structure', intent: 'repair transformed module seams' },
      { layer: 'roof', intent: 'match shape inventory to scale' },
      { layer: 'facade', intent: 'keep structural value hierarchy readable' }
    ],
    selected_rule_ids: ['rule:structure.compose-three-volumes'],
    rejected_rule_ids: [],
    repair_variant_preferences: [],
    advisory_overlay_sha256: overlay.overlay_sha256
  };
  const envelope = await createFrozenDesignEnvelope({
    mode: 'llm', candidateId: 'candidate-01', seed: 1432164,
    prompt: 'Build a medieval residence.', cards: corpus.cards, advisoryOverlay: overlay,
    client: { isConfigured: () => true, chatJson: async () => response }
  });
  assert.equal(envelope.advisory_overlay_sha256, overlay.overlay_sha256);
  const guided = buildPlaybookGuidedPrompt({
    prompt: 'Build a medieval residence.', mode: 'llm', frozenDesign: envelope
  });
  assert.match(guided, /repair transformed module seams/u);
  assert.match(guided, new RegExp(overlay.overlay_sha256, 'u'));
  assert.equal(buildPlaybookGuidedPrompt({
    prompt: 'Build a medieval residence.', mode: 'mock', frozenDesign: envelope
  }), 'Build a medieval residence.');
});

test('rejects school, status, source, and entry drift instead of treating it as reviewed knowledge', async (t) => {
  const original = JSON.parse(await (await import('node:fs/promises')).readFile(
    path.join(ROOT, P7_ADVISORY_OVERLAY_PATH), 'utf8'
  ));
  for (const [name, mutate] of [
    ['school', (value) => { value.school_id = 'mixed-school'; }],
    ['status', (value) => { value.status = 'rules-reviewed'; }],
    ['source', (value) => { value.source_bvids.push('BV1invented'); }],
    ['entry id', (value) => { value.entries[0].knowledge_id = 'rule:invented'; }],
    ['semantic intent', (value) => { value.entries[0].intent = 'Different but valid bounded intent.'; }]
  ]) {
    await t.test(name, async () => {
      const changed = structuredClone(original);
      mutate(changed);
      await assert.rejects(loadP7AdvisoryOverlay({
        projectRoot: ROOT,
        readFile: async () => JSON.stringify(changed)
      }), { code: 'P7_ADVISORY_INVALID' });
    });
  }
});
