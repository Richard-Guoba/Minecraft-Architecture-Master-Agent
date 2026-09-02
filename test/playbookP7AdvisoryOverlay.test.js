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

test('loads the bounded represented-chapter subtitle advisory without changing reviewed-rule authority', async () => {
  const overlay = await loadP7AdvisoryOverlay({ projectRoot: ROOT });

  assert.equal(P7_ADVISORY_OVERLAY_PATH,
    'docs/architecture-playbook/rules/schools/heihui-jileniao/p7-advisory-v0.2.json');
  assert.equal(overlay.school_id, 'heihui-jileniao');
  assert.equal(overlay.status, 'subtitle-derived-advisory');
  assert.deepEqual(overlay.chapter_ids, [
    'foundations-tools-blocks-modularity-color',
    'complete-structure',
    'complete-roofs',
    'complete-walls-facades',
    'landscaping-terrain'
  ]);
  assert.equal(overlay.source_bvids.length, 24);
  assert.equal(overlay.source_bvids.at(-1), 'BV1a5TDzhE9M');
  assert.equal(overlay.entries.length, 69);
  assert.equal(overlay.overlay_sha256.length, 64);
  assert.ok(overlay.entries.every((entry) => !entry.knowledge_id.startsWith('rule:')));
  assert.ok(overlay.entries.every((entry) => entry.intent.length <= 240));
  assert.ok(overlay.entries.every((entry) => entry.evidence_refs.length > 0));
  assert.ok(overlay.entries.every((entry) =>
    ['author_claim', 'inference', 'contrast'].includes(entry.classification)));
  assert.deepEqual(
    overlay.entries.slice(-3).map(({ knowledge_id }) => knowledge_id),
    [
      'knowledge:p7:scale-matched-outdoor-fixtures',
      'knowledge:p7:beach-functional-zoning',
      'knowledge:p7:contrasting-beach-surface-patches'
    ]
  );
  assert.deepEqual(
    overlay.entries.find(({ knowledge_id }) =>
      knowledge_id === 'knowledge:p7:purposeful-volume-subtraction').evidence_refs,
    [
      'BV1Mp7UzyE3P@19-100',
      'BV1Mp7UzyE3P@174-329',
      'BV1Mp7UzyE3P@330-538',
      'BV1Mp7UzyE3P@559-650'
    ]
  );
  assert.deepEqual(
    overlay.entries.find(({ knowledge_id }) =>
      knowledge_id === 'knowledge:p7:close-distant-evaluation').evidence_refs,
    [
      'BV1SwdfBHEx5@51-94',
      'BV1SwdfBHEx5@202-250',
      'BV1SwdfBHEx5@338-362',
      'BV1h1keYbEMd@1159-1189'
    ]
  );
  const evenSpanRoof = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:even-span-roof-closure');
  assert.deepEqual(evenSpanRoof.evidence_refs, ['BV1h1keYbEMd@852-970']);
  assert.match(evenSpanRoof.intent, /even-width spans/iu);
  assert.match(evenSpanRoof.intent, /offsetting the ridge/iu);
  assert.deepEqual(
    overlay.entries.find(({ knowledge_id }) =>
      knowledge_id === 'knowledge:p7:compound-roof-seam-cleanup').evidence_refs,
    [
      'BV1h1keYbEMd@277-316',
      'BV1h1keYbEMd@341-425',
      'BV1h1keYbEMd@427-488'
    ]
  );
  assert.deepEqual(
    overlay.entries.find(({ knowledge_id }) =>
      knowledge_id === 'knowledge:p7:adaptive-roof-profile').evidence_refs,
    [
      'BV1h1keYbEMd@78-221',
      'BV1h1keYbEMd@575-830',
      'BV1unj9z4EnW@675-779'
    ]
  );
  const largeRoofSurface = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:large-roof-full-block-surface');
  assert.deepEqual(largeRoofSurface.evidence_refs,
    ['BV1unj9z4EnW@91-228', 'BV1unj9z4EnW@262-410']);
  assert.match(largeRoofSurface.intent, /full blocks/iu);
  assert.match(largeRoofSurface.intent, /distance/iu);
  const flatRoof = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:modern-flat-roof-option');
  assert.deepEqual(flatRoof.evidence_refs, ['BV1unj9z4EnW@1200-1334']);
  assert.match(flatRoof.intent, /flat or terrace roof/iu);
  assert.match(flatRoof.intent, /instead of forcing a pitched profile/iu);
  const scaleSensitiveMaterial = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:scale-sensitive-material');
  assert.deepEqual(scaleSensitiveMaterial.source_bvids,
    ['BV1iVLbzcEfG', 'BV14XMtzFEzb', 'BV1ZJTLzgEdm']);
  assert.deepEqual(scaleSensitiveMaterial.evidence_refs, [
    'BV1iVLbzcEfG@597-629',
    'BV14XMtzFEzb@390-464',
    'BV14XMtzFEzb@917-974',
    'BV1ZJTLzgEdm@90-177',
    'BV1ZJTLzgEdm@255-327'
  ]);
  const facadeDepth = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:facade-depth-hierarchy');
  assert.deepEqual(facadeDepth.evidence_refs,
    ['BV1ZJTLzgEdm@0-37', 'BV1ZJTLzgEdm@329-411']);
  assert.match(facadeDepth.intent, /recess/iu);
  assert.match(facadeDepth.intent, /depth layers/iu);
  const supportLedOrnament = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:support-led-facade-ornament');
  assert.deepEqual(supportLedOrnament.evidence_refs, [
    'BV1ZJTLzgEdm@133-165',
    'BV1ZJTLzgEdm@414-468',
    'BV1ZJTLzgEdm@565-583',
    'BV1ZJTLzgEdm@645-685'
  ]);
  assert.match(supportLedOrnament.intent, /support/iu);
  assert.match(supportLedOrnament.intent, /blank/iu);
  const visualMaterialRole = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:visual-material-role');
  assert.deepEqual(visualMaterialRole.source_bvids,
    ['BV1iVLbzcEfG', 'BV1XtGvzPEFR']);
  assert.deepEqual(visualMaterialRole.evidence_refs,
    ['BV1iVLbzcEfG@17-53', 'BV1iVLbzcEfG@321-540', 'BV1XtGvzPEFR@1126-1137']);
  const structuralValue = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:structural-value-hierarchy');
  assert.deepEqual(structuralValue.source_bvids,
    ['BV14XMtzFEzb', 'BV1XtGvzPEFR']);
  assert.deepEqual(structuralValue.evidence_refs,
    ['BV14XMtzFEzb@79-124', 'BV14XMtzFEzb@127-179', 'BV1XtGvzPEFR@513-564']);
  const integratedBays = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:integrated-facade-bay-layering');
  assert.deepEqual(integratedBays.source_bvids,
    ['BV1ZJTLzgEdm', 'BV1XtGvzPEFR']);
  assert.deepEqual(integratedBays.evidence_refs,
    ['BV1ZJTLzgEdm@1183-1310', 'BV1XtGvzPEFR@1043-1122']);
  assert.match(integratedBays.intent, /vertical bays/iu);
  assert.match(integratedBays.intent, /horizontal layers/iu);
  const openingAssembly = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:facade-opening-assembly');
  assert.deepEqual(openingAssembly.evidence_refs,
    ['BV1XtGvzPEFR@276-411', 'BV1XtGvzPEFR@467-503']);
  assert.match(openingAssembly.intent, /weather hood/iu);
  assert.match(openingAssembly.intent, /sill/iu);
  const columnArticulation = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:scale-matched-column-articulation');
  assert.deepEqual(columnArticulation.evidence_refs, ['BV1XtGvzPEFR@565-754']);
  assert.match(columnArticulation.intent, /base, shaft and capital/iu);
  assert.match(columnArticulation.intent, /simplify ornament/iu);
  const constrainedRelief = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:constrained-depth-facade-relief');
  assert.deepEqual(constrainedRelief.evidence_refs, ['BV1XtGvzPEFR@885-1023']);
  assert.match(constrainedRelief.intent, /one block of depth/iu);
  assert.match(constrainedRelief.intent, /building scale/iu);
  const doorContinuity = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:door-frame-material-continuity');
  assert.deepEqual(doorContinuity.evidence_refs,
    ['BV1nCJJzWEHH@8-37', 'BV1nCJJzWEHH@85-175', 'BV1nCJJzWEHH@298-345']);
  assert.match(doorContinuity.intent, /texture continuity/iu);
  assert.match(doorContinuity.intent, /connection states/iu);
  const entryScale = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:scale-appropriate-entry-opening');
  assert.deepEqual(entryScale.evidence_refs,
    ['BV1nCJJzWEHH@258-297', 'BV1nCJJzWEHH@399-463', 'BV1nCJJzWEHH@631-653']);
  assert.match(entryScale.intent, /omit a literal door panel/iu);
  const weatherEntry = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:weather-sheltered-entrance-transition');
  assert.deepEqual(weatherEntry.evidence_refs, ['BV1nCJJzWEHH@183-256', 'BV1nCJJzWEHH@597-630']);
  assert.match(weatherEntry.intent, /threshold/iu);
  assert.match(weatherEntry.intent, /rain/iu);
  const layeredEntry = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:layered-entry-sequence');
  assert.deepEqual(layeredEntry.evidence_refs, ['BV1nCJJzWEHH@749-843']);
  assert.match(layeredEntry.intent, /vestibule/iu);
  assert.match(layeredEntry.intent, /visible from outside/iu);
  const materialConnectivity = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:facade-material-connectivity-scale');
  assert.deepEqual(materialConnectivity.evidence_refs,
    ['BV1FrPazJEFD@47-169', 'BV1FrPazJEFD@227-335']);
  assert.match(materialConnectivity.intent, /continuous fields/iu);
  assert.match(materialConnectivity.intent, /distinctive/iu);
  const patternVocabulary = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:bounded-facade-pattern-vocabulary');
  assert.deepEqual(patternVocabulary.evidence_refs, ['BV1FrPazJEFD@374-512']);
  assert.match(patternVocabulary.intent, /limited vocabulary/iu);
  assert.match(patternVocabulary.intent, /repeat rhythms/iu);
  const depthExpansion = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:large-facade-depth-expansion');
  assert.deepEqual(depthExpansion.evidence_refs, ['BV1FrPazJEFD@512-578']);
  assert.match(depthExpansion.intent, /increase facade volume/iu);
  const facadePartition = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:iterative-facade-partition-hierarchy');
  assert.deepEqual(facadePartition.evidence_refs,
    ['BV1FrPazJEFD@664-911', 'BV1FrPazJEFD@914-1046']);
  assert.match(facadePartition.intent, /primary partition/iu);
  assert.match(facadePartition.intent, /outlier/iu);
  const roadWear = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:traffic-wear-road-zoning');
  assert.deepEqual(roadWear.evidence_refs, ['BV1rx6yYNEYr@251-307']);
  assert.match(roadWear.intent, /traffic/iu);
  const treeCanopy = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:branch-supported-canopy');
  assert.deepEqual(treeCanopy.evidence_refs, ['BV1KN91Y1ELG@242-328']);
  assert.match(treeCanopy.intent, /branches/iu);
  const canopyVariation = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:varied-canopy-silhouette');
  assert.deepEqual(canopyVariation.evidence_refs,
    ['BV1KN91Y1ELG@181-211', 'BV1KN91Y1ELG@511-630',
      'BV1KN91Y1ELG@925-1027', 'BV1KN91Y1ELG@1385-1410']);
  assert.doesNotMatch(canopyVariation.intent, /height/iu);
  const bridgeSupports = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:clearance-aware-bridge-supports');
  assert.deepEqual(bridgeSupports.evidence_refs, ['BV1xtXKYYEF2@31-151']);
  assert.match(bridgeSupports.intent, /clearance/iu);
  const shoreline = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:cross-boundary-shoreline-gradient');
  assert.deepEqual(shoreline.evidence_refs, ['BV1Hy5pzQE5n@512-660']);
  assert.match(shoreline.intent, /water and land/iu);
  const terrainEnvelope = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:nonrectilinear-terrain-envelope');
  assert.deepEqual(terrainEnvelope.evidence_refs, ['BV1oFJPzqE9k@20-210']);
  assert.match(terrainEnvelope.intent, /right-angle/iu);
  const viewScreen = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:porous-or-opaque-view-screen');
  assert.deepEqual(viewScreen.evidence_refs, ['BV1i2JBzPE8m@240-330']);
  assert.match(viewScreen.intent, /porous/iu);
  const valleyRoutes = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:route-first-landscape-parcels');
  assert.deepEqual(valleyRoutes.evidence_refs,
    ['BV1Cm7VzzEXd@390-510', 'BV1Cm7VzzEXd@540-631']);
  assert.match(valleyRoutes.intent, /route hierarchy/iu);
  const beachZoning = overlay.entries.find(({ knowledge_id }) =>
    knowledge_id === 'knowledge:p7:beach-functional-zoning');
  assert.deepEqual(beachZoning.evidence_refs,
    ['BV1a5TDzhE9M@541-600', 'BV1a5TDzhE9M@691-812']);
  assert.deepEqual(overlay.entries.at(-1).evidence_refs,
    ['BV1a5TDzhE9M@662-750']);
  assert.match(overlay.entries.at(-1).intent, /contrast/iu);
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
