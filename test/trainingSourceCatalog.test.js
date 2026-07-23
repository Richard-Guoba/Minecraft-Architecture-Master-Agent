import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  TOKEN_NAMES,
  mapTrainingToken
} from '../src/training/tokenTaxonomy.js';
import { catalogTrainingSources } from '../src/training/sourceCatalog.js';

const ROOT = path.resolve(import.meta.dirname, '..');

test('taxonomy maps air to zero and every solid category to 1..8', () => {
  assert.deepEqual(TOKEN_NAMES, [
    'air',
    'earth',
    'rock',
    'wood',
    'glass',
    'architectural-shape',
    'detail',
    'water',
    'other'
  ]);
  assert.equal(mapTrainingToken({ air: true, category: 'air' }), 0);
  for (const category of [
    'earth',
    'rock',
    'wood',
    'glass',
    'stair',
    'decor',
    'water',
    'other'
  ]) {
    const token = mapTrainingToken({ air: false, category });
    assert.ok(token >= 1 && token <= 8, category);
  }
});

test('catalog considers every local schematic', async () => {
  const result = await catalogTrainingSources({
    sourceRoot: path.join(ROOT, 'mc_templates')
  });
  assert.equal(result.accepted.length + result.rejected.length, 64);
  assert.ok(result.accepted.length > 0);
});

test('catalog ignores unsupported files and reports corrupt, duplicate, and symlink sources', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-training-catalog-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'nested'));
  const bytes = syntheticSchematic();
  await fs.writeFile(path.join(root, 'a.schematic'), bytes);
  await fs.writeFile(path.join(root, 'nested', 'b.schem'), bytes);
  await fs.writeFile(path.join(root, 'corrupt.schematic'), Buffer.from('not nbt'));
  await fs.writeFile(path.join(root, 'ignored.txt'), 'ignored');
  await fs.symlink(
    path.join(root, 'a.schematic'),
    path.join(root, 'linked.schematic')
  );

  const result = await catalogTrainingSources({ sourceRoot: root });

  assert.equal(result.accepted.length, 2);
  assert.equal(result.rejected.length, 2);
  assert.deepEqual(
    result.rejected.map((record) => record.code).sort(),
    ['SOURCE_MALFORMED', 'SOURCE_SYMLINK']
  );
  assert.equal(result.accepted[0].content_sha256, result.accepted[1].content_sha256);
  assert.notEqual(result.accepted[0].source_id, result.accepted[1].source_id);
  assert.deepEqual(result.accepted[0].occupied_bounds.extent, {
    x: 1,
    y: 1,
    z: 1
  });
  assert.equal(result.accepted[0].token_counts[2], 1);
  assert.equal(Object.isFrozen(result.accepted[0]), true);
});

function syntheticSchematic() {
  const shortTag = (name, value) => Buffer.concat([
    Buffer.from([2, 0, name.length]),
    Buffer.from(name),
    Buffer.from([value >> 8, value & 0xff])
  ]);
  const byteArrayTag = (name, values) => {
    const length = Buffer.alloc(4);
    length.writeInt32BE(values.length);
    return Buffer.concat([
      Buffer.from([7, 0, name.length]),
      Buffer.from(name),
      length,
      Buffer.from(values)
    ]);
  };
  return Buffer.concat([
    Buffer.from([10, 0, 0]),
    shortTag('Width', 2),
    shortTag('Height', 2),
    shortTag('Length', 2),
    byteArrayTag('Blocks', [1, 0, 0, 0, 0, 0, 0, 0]),
    Buffer.from([0])
  ]);
}
