import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  loadShadowCorpus,
  SHADOW_CORPUS_PATHS
} from '../src/playbook/shadow/corpus.js';
import { projectBlueprint } from '../src/playbook/shadow/blueprintProjection.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ADMISSION_PATH =
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json';

test('loads exactly 21 ordered reviewed rules and binds all three corpus files', async () => {
  const corpus = await loadShadowCorpus({ projectRoot: ROOT });

  assert.equal(corpus.cards.length, 21);
  assert.equal(corpus.cards[0].rule_id, 'rule:structure.compose-three-volumes');
  assert.equal(corpus.cards.filter((card) => card.teaching_role === 'core-procedure').length, 15);
  assert.equal(corpus.cards.filter(
    (card) => card.runtime_projection.coverage_status === 'manual-example-only'
  ).length, 6);
  assert.equal(corpus.corpus_sha256.length, 64);
  assert.equal(Object.isFrozen(corpus.cards[0]), true);
  assert.equal(Object.isFrozen(corpus.coverage[0]), true);
});

test('corpus loader rejects policy/card drift', async () => {
  const files = await loadCorpusBytes(ROOT);
  const policy = JSON.parse(files.get(ADMISSION_PATH));
  policy.rule_admissions[0].runtime_projection.observable_checks[0] = 'check:massing:drift';
  files.set(ADMISSION_PATH, Buffer.from(`${JSON.stringify(policy)}\n`));

  await assert.rejects(
    loadShadowCorpus({ projectRoot: ROOT, readFile: mapReader(files) }),
    /PLAYBOOK_CORPUS_INVALID/u
  );
});

test('corpus loader rejects coverage authority drift even when row counts match', async () => {
  const files = await loadCorpusBytes(ROOT);
  const coverage = JSON.parse(files.get(SHADOW_CORPUS_PATHS[2]));
  coverage.layers[0].status = 'not-covered';
  coverage.layers[2].status = 'advisory-partial';
  files.set(SHADOW_CORPUS_PATHS[2], Buffer.from(`${JSON.stringify(coverage)}\n`));

  await assert.rejects(
    loadShadowCorpus({ projectRoot: ROOT, readFile: mapReader(files) }),
    /PLAYBOOK_CORPUS_INVALID/u
  );
});

test('projection copies only the approved five-layer whitelist', () => {
  const blueprint = minimalBlueprintFixture();
  blueprint.operations = [{ block: 'minecraft:diamond_block' }];
  blueprint.interior = { secret: true };

  const projected = projectBlueprint(blueprint);

  assert.equal(projected.brief.prompt, blueprint.prompt);
  assert.deepEqual(projected.massing.volumes, blueprint.architecture.volumes);
  assert.equal(JSON.stringify(projected).includes('diamond_block'), false);
  assert.equal(JSON.stringify(projected).includes('secret'), false);
  assert.equal(projected.pointers.massing.volumes, '/architecture/volumes');
  assert.equal(projected.pointers.structure.load_paths, '/structure/load_paths');
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(Object.isFrozen(projected.massing.volumes), true);
});

test('projection turns malformed whitelist facts into null without repairing them', () => {
  const blueprint = minimalBlueprintFixture();
  blueprint.architecture.volumes = { repaired: false };
  blueprint.shell.volumeBoxes = ['valid', undefined];
  blueprint.bounds = [];
  blueprint.roof.overhang = Number.POSITIVE_INFINITY;
  blueprint.facade.window_system = new Date();

  const projected = projectBlueprint(blueprint);

  assert.equal(projected.massing.volumes, null);
  assert.equal(projected.massing.volume_boxes, null);
  assert.equal(projected.massing.bounds, null);
  assert.equal(projected.roof.overhang, null);
  assert.equal(projected.facade.window_system, null);
});

test('projection treats circular whitelist data as unavailable JSON facts', () => {
  const blueprint = minimalBlueprintFixture();
  const circularVolume = [];
  circularVolume.push(circularVolume);
  blueprint.architecture.volumes = circularVolume;

  const projected = projectBlueprint(blueprint);

  assert.equal(projected.massing.volumes, null);
});

test('projection rejects a non-construction blueprint with a stable error', () => {
  assert.throws(
    () => projectBlueprint({ workflow: 'other' }),
    /BLUEPRINT_INVALID/u
  );
});

async function loadCorpusBytes(projectRoot) {
  return new Map(await Promise.all(SHADOW_CORPUS_PATHS.map(async (relativePath) => [
    relativePath,
    await fs.readFile(path.join(projectRoot, relativePath))
  ])));
}

function mapReader(files) {
  return async (relativePath) => {
    const value = files.get(relativePath);
    if (!value) throw new Error('missing test corpus file');
    return Buffer.from(value);
  };
}

function minimalBlueprintFixture() {
  return {
    workflow: 'construction_method_v1',
    prompt: 'A compact timber house',
    architecture: {
      style: 'medieval',
      style_family: 'timber-frame',
      typology: 'house',
      volumes: [{ id: 'main', role: 'primary' }]
    },
    shell: { volumeBoxes: [{ min: [0, 0, 0], max: [4, 4, 4] }] },
    bounds: { min: [0, 0, 0], max: [4, 4, 4] },
    structure: {
      system: 'timber-frame',
      structural_intent: { visible: true },
      foundation: { material: 'stone' },
      load_paths: [{ from: 'roof', to: 'base' }],
      support_elements: [{ kind: 'post' }]
    },
    roof: {
      style: 'gable',
      profile: 'steep',
      materials: { main: 'dark_oak' },
      elements: [{ kind: 'ridge' }],
      overhang: 1
    },
    facade: {
      composition_strategy: { framing: 'first' },
      facade_depth_layers: [{ depth: 1 }],
      facade_elements: [{ kind: 'window' }],
      window_system: { rhythm: 'alternating' }
    }
  };
}
