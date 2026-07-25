import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSourceBatchManifest
} from '../src/training/residential/contracts/index.js';

function read(relative) {
  return fs.readFileSync(relative, 'utf8');
}

test('project docs describe the active construction and training-first paths', () => {
  const readme = read('README.md');
  const architecture = read('docs/architecture.md');
  const training = read('docs/training.md');
  assert.match(readme, /construction_method_v1/u);
  assert.match(readme, /training:prepare/u);
  assert.match(architecture, /deterministic geometry/iu);
  assert.match(training, /local training/iu);
});

test('project docs describe the exact local-only R2 residential boundary', () => {
  const readme = read('README.md');
  const architecture = read('docs/architecture.md');
  const residential = read('docs/residential-model/README.md');
  const currentResidentialDocs = [readme, architecture, residential].join('\n');
  assert.match(readme, /Residential learned renderer/iu);
  for (const current of [readme, architecture]) {
    assert.match(
      current,
      /R1 contracts\/workspace and R2 local source intake are implemented\./u
    );
    assert.match(
      current,
      /R3 canonical extraction, annotation, datasets, models, training, and production integration are not implemented\./u
    );
    assert.match(current, /R2(?: intake)? is local-only/iu);
  }
  assert.match(architecture, /does not change production generation/iu);
  assert.match(
    residential,
    /R1 contracts\/workspace and R2 local source intake are implemented\./u
  );
  assert.match(
    residential,
    /R3 canonical extraction, annotation, datasets, models, training, and production integration are not implemented\./u
  );
  assert.match(residential, /R2 source data remains local-only/iu);
  assert.ok(residential.includes([
    'npm run residential:workspace -- batch-init \\',
    '  --batch-id 2026-07-24-planetminecraft-001 \\',
    '  --source-project planetminecraft'
  ].join('\n')));
  assert.ok(residential.includes([
    'npm run residential:workspace -- intake \\',
    '  --batch-id 2026-07-24-planetminecraft-001'
  ].join('\n')));
  assert.match(residential, /npm run residential:workspace -- legacy-audit/u);
  assert.match(residential, /not a trained model/iu);
  assert.match(residential, /houses\//u);
  assert.match(residential, /other-architecture\//u);
  const manifest = validateSourceBatchManifest(readManifestExample(residential));
  assert.equal(manifest.candidates.length, 2);
  assert.deepEqual(
    manifest.candidates.map((candidate) => candidate.lane),
    ['houses', 'other-architecture']
  );
  assert.doesNotMatch(
    currentResidentialDocs,
    /\bresidential (?:dataset|checkpoint)\s+(?:exists|is (?:available|present|ready)|has been (?:created|produced|trained))\b/iu
  );
  assert.equal(fs.existsSync('docs/superpowers'), false);
});

function readManifestExample(markdown) {
  const match = markdown.match(/```json\n(\{[\s\S]*?\})\n```/u);
  assert.ok(match, 'residential curator guide needs a JSON manifest example');
  return JSON.parse(match[1]);
}
