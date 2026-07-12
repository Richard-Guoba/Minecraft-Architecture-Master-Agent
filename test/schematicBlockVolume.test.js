import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readSchematicBlockVolume, decodeSchematicBlockVolume } from '../src/construction/templates/schematicBlockVolume.js';

const FIXTURE = path.resolve('mc_templates/House/A Small Modern House - (mcbuild_org).schematic');

test('schematic block volume exposes stable hash, dimensions, and bounded block access', async () => {
  const bytes = await fs.readFile(FIXTURE);
  const volume = await readSchematicBlockVolume(FIXTURE);
  assert.equal(volume.source_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.ok(volume.width > 0 && volume.height > 0 && volume.length > 0);
  assert.equal(volume.block_count, volume.width * volume.height * volume.length);
  assert.deepEqual(volume.blockAt(-1, 0, 0), { state: 'minecraft:air', name: 'air', category: 'air', air: true });
  assert.deepEqual(volume.blockAt(volume.width, 0, 0), { state: 'minecraft:air', name: 'air', category: 'air', air: true });
  assert.equal(typeof volume.blockAtIndex(0).state, 'string');
});

test('schematic block volume rejects malformed NBT without partial output', () => {
  assert.throws(() => decodeSchematicBlockVolume(Buffer.from('not nbt')), /NBT|schematic|Unexpected end/);
});
