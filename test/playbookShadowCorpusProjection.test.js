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
const REVIEWED_RULES_PATH = SHADOW_CORPUS_PATHS[0];
const ADMISSION_PATH =
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json';
const COVERAGE_PATH = SHADOW_CORPUS_PATHS[2];

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

test('corpus loader rejects reviewed-card authority metadata drift', async (t) => {
  for (const [name, mutate] of [
    ['schema version', (card) => { card.schema_version = 2; }],
    ['playbook version', (card) => { card.playbook_version = '0.1.1'; }],
    ['rule version', (card) => { card.rule_version = 2; }],
    ['maturity', (card) => { card.maturity = 'unreviewed-drift'; }],
    ['authority', (card) => { card.authority = 'runtime'; }],
    ['effect status', (card) => { card.effect_validation_status = 'validated'; }]
  ]) {
    await t.test(name, async () => {
      const files = await loadCorpusBytes(ROOT);
      const cards = parseReviewedCards(files);
      mutate(cards[0]);
      writeReviewedCards(files, cards);

      await assertCorpusRejected(files);
    });
  }
});

test('corpus loader rejects admission and coverage documents with different coverage', async () => {
  const files = await loadCorpusBytes(ROOT);
  const admission = JSON.parse(files.get(ADMISSION_PATH));
  admission.coverage[0].unknown_ids.reverse();
  files.set(ADMISSION_PATH, Buffer.from(`${JSON.stringify(admission)}\n`));

  await assertCorpusRejected(files);
});

test('corpus loader rejects coordinated drift from the authoritative unknown-ID set', async () => {
  const files = await loadCorpusBytes(ROOT);
  const admission = JSON.parse(files.get(ADMISSION_PATH));
  const coverage = JSON.parse(files.get(COVERAGE_PATH));
  admission.coverage[0].unknown_ids.push('unknown:invented');
  coverage.layers[0].unknown_ids.push('unknown:invented');
  files.set(ADMISSION_PATH, Buffer.from(`${JSON.stringify(admission)}\n`));
  files.set(COVERAGE_PATH, Buffer.from(`${JSON.stringify(coverage)}\n`));

  await assertCorpusRejected(files);
});

test('corpus loader rejects a non-string per-layer unknown ID', async () => {
  const files = await loadCorpusBytes(ROOT);

  mutateBothCoverageDocuments(files, (layers) => {
    layers[0].unknown_ids.push(null);
  });

  await assertCorpusRejected(files);
});

test('corpus loader rejects a duplicate unknown ID within one layer', async () => {
  const files = await loadCorpusBytes(ROOT);

  mutateBothCoverageDocuments(files, (layers) => {
    layers[0].unknown_ids.push('unknown:aesthetic-evaluator');
  });

  await assertCorpusRejected(files);
});

test('corpus loader rejects a reviewed repeated unknown ID in an unapproved layer', async () => {
  const files = await loadCorpusBytes(ROOT);

  mutateBothCoverageDocuments(files, (layers) => {
    layers[2].unknown_ids.push('unknown:cross-author-validity');
  });

  await assertCorpusRejected(files);
});

test('corpus loader rejects coordinated unknown-ID reassignment between layers', async () => {
  const files = await loadCorpusBytes(ROOT);

  mutateBothCoverageDocuments(files, (layers) => {
    const [reassigned] = layers[1].unknown_ids.splice(0, 1);
    layers[2].unknown_ids.push(reassigned);
  });

  await assertCorpusRejected(files);
});

test('corpus loader rejects reordered per-layer unknown IDs', async () => {
  const files = await loadCorpusBytes(ROOT);

  mutateBothCoverageDocuments(files, (layers) => {
    layers[0].unknown_ids.reverse();
  });

  await assertCorpusRejected(files);
});

test('corpus loader rejects a missing per-layer unknown ID', async () => {
  const files = await loadCorpusBytes(ROOT);

  mutateBothCoverageDocuments(files, (layers) => {
    layers[1].unknown_ids.pop();
  });

  await assertCorpusRejected(files);
});

test('corpus loader rejects an extra known unknown ID in one layer', async () => {
  const files = await loadCorpusBytes(ROOT);

  mutateBothCoverageDocuments(files, (layers) => {
    layers[1].unknown_ids.push('unknown:roof-slope-table');
  });

  await assertCorpusRejected(files);
});

test('corpus loader rejects every exact per-layer rule-ID authority mutation', async (t) => {
  for (const [name, mutate] of [
    ['coordinated cross-layer move', (layers) => {
      [layers[0].rule_ids[0], layers[1].rule_ids[0]] = [
        layers[1].rule_ids[0], layers[0].rule_ids[0]
      ];
    }],
    ['within-layer reorder', (layers) => {
      layers[1].rule_ids.reverse();
    }],
    ['missing ID', (layers) => {
      layers[1].rule_ids.pop();
    }],
    ['extra ID', (layers) => {
      layers[1].rule_ids.push('rule:invented');
    }],
    ['duplicate ID', (layers) => {
      layers[1].rule_ids[1] = layers[1].rule_ids[0];
    }],
    ['non-string ID', (layers) => {
      layers[1].rule_ids[0] = null;
    }]
  ]) {
    await t.test(name, async () => {
      const files = await loadCorpusBytes(ROOT);
      mutateBothCoverageDocuments(files, mutate);
      await assertCorpusRejected(files);
    });
  }
});

test('corpus loader rejects invalid teaching-role and coverage-status relationships', async (t) => {
  for (const [name, mutate] of [
    ['core procedure marked manual-only', (card, admission) => {
      card.runtime_projection.coverage_status = 'manual-example-only';
      admission.runtime_projection.coverage_status = 'manual-example-only';
    }],
    ['case pattern marked advisory-partial', (card, admission) => {
      card.teaching_role = 'case-pattern';
      admission.teaching_role = 'case-pattern';
    }],
    ['unreviewed admission decision', (card, admission) => {
      card.admission_status = 'manual-example-only';
      admission.decision = 'manual-example-only';
    }]
  ]) {
    await t.test(name, async () => {
      const files = await loadCorpusBytes(ROOT);
      const cards = parseReviewedCards(files);
      const admissionDocument = JSON.parse(files.get(ADMISSION_PATH));
      mutate(cards[0], admissionDocument.rule_admissions[0]);
      writeReviewedCards(files, cards);
      files.set(ADMISSION_PATH, Buffer.from(`${JSON.stringify(admissionDocument)}\n`));

      await assertCorpusRejected(files);
    });
  }
});

test('corpus loader rejects coordinated rule reordering outside registry authority', async () => {
  const files = await loadCorpusBytes(ROOT);
  const cards = parseReviewedCards(files);
  [cards[0], cards[1]] = [cards[1], cards[0]];
  writeReviewedCards(files, cards);
  const admission = JSON.parse(files.get(ADMISSION_PATH));
  [admission.rule_admissions[0], admission.rule_admissions[1]] = [
    admission.rule_admissions[1], admission.rule_admissions[0]
  ];
  files.set(ADMISSION_PATH, Buffer.from(`${JSON.stringify(admission)}\n`));

  await assertCorpusRejected(files);
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

test('projection treats object facts with hidden own properties as unavailable JSON facts', () => {
  const blueprint = minimalBlueprintFixture();
  const symbolBackedBounds = { valid: true, [Symbol('private')]: true };
  const nonEnumerableFoundation = { valid: true };
  const accessorBackedMaterials = { valid: true };
  Object.defineProperty(nonEnumerableFoundation, 'private', {
    value: true,
    enumerable: false
  });
  Object.defineProperty(accessorBackedMaterials, 'private', {
    enumerable: true,
    get: () => true
  });
  blueprint.bounds = symbolBackedBounds;
  blueprint.structure.foundation = nonEnumerableFoundation;
  blueprint.roof.materials = accessorBackedMaterials;

  const projected = projectBlueprint(blueprint);

  assert.equal(projected.massing.bounds, null);
  assert.equal(projected.structure.foundation, null);
  assert.equal(projected.roof.materials, null);
});

test('projection treats unclonable object facts as unavailable JSON facts', () => {
  const blueprint = minimalBlueprintFixture();
  blueprint.bounds = new Proxy({ valid: true }, {});

  const projected = projectBlueprint(blueprint);

  assert.equal(projected.massing.bounds, null);
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

function parseReviewedCards(files) {
  return files.get(REVIEWED_RULES_PATH).toString('utf8').trim().split('\n').map(JSON.parse);
}

function writeReviewedCards(files, cards) {
  files.set(REVIEWED_RULES_PATH, Buffer.from(`${cards.map(JSON.stringify).join('\n')}\n`));
}

function mutateBothCoverageDocuments(files, mutate) {
  const admission = JSON.parse(files.get(ADMISSION_PATH));
  const coverage = JSON.parse(files.get(COVERAGE_PATH));
  mutate(admission.coverage);
  mutate(coverage.layers);
  files.set(ADMISSION_PATH, Buffer.from(`${JSON.stringify(admission)}\n`));
  files.set(COVERAGE_PATH, Buffer.from(`${JSON.stringify(coverage)}\n`));
}

async function assertCorpusRejected(files) {
  await assert.rejects(
    loadShadowCorpus({ projectRoot: ROOT, readFile: mapReader(files) }),
    (error) => {
      assert.equal(error.code, 'PLAYBOOK_CORPUS_INVALID');
      assert.equal(error.message, 'PLAYBOOK_CORPUS_INVALID');
      return true;
    }
  );
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
