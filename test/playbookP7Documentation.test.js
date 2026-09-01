import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

test('root README describes portable player-chosen relative placement', async () => {
  const text = await read('README.md');

  assert.match(text, /portable.*relative-coordinate|relative-coordinate.*portable/isu);
  assert.match(
    text,
    /stand at (?:the|your) chosen (?:build )?origin[\s\S]*?\/reload[\s\S]*?\/function architect:run/iu
  );
  assert.doesNotMatch(text, /P6.*prerequisite before.*P7|P7 is not allowed/isu);
});

test('architecture playbook README exposes the lightweight chapter gate and status-next workflow', async () => {
  const text = await read('docs/architecture-playbook/README.md');

  assert.match(text, /lightweight P7 chapter gate/iu);
  assert.match(
    text,
    /npm run playbook:chapter -- init[\s\S]*npm run playbook:chapter -- status[\s\S]*npm run playbook:chapter -- next --chapter foundations-tools-blocks-modularity-color/u
  );
  assert.match(text, /status[\s\S]*next[\s\S]*(?:read-only|只读)/iu);
  assert.match(text, /formal P6.*optional.*does not block P7/isu);
  assert.doesNotMatch(text, /P7 is not allowed|P6.*prerequisite before.*P7/isu);
});

test('P6 report preserves incomplete evidence while making formal comparison optional for P7', async () => {
  const text = await read(
    'docs/architecture-playbook/reports/p6-fixed-view-blind-comparison.md'
  );

  assert.match(text, /formal (?:P6 )?(?:capture|comparison).*incomplete/iu);
  assert.match(text, /P6.*optional.*does not block P7/isu);
  assert.match(text, /Eventual evidence SHA-256 inventory/u);
  assert.match(text, /Formal captures: pending/u);
  assert.match(text, /Blind comparisons: pending/u);
  assert.doesNotMatch(text, /P7 is not allowed|P6.*prerequisite before.*P7/isu);
});

test('P7 foundation report records exact public authority, verification, and next action', async () => {
  const text = await read(
    'docs/architecture-playbook/reports/p7-knowledge-expansion-foundation.md'
  );

  assert.match(
    text,
    /c7b1ff6c8fb3d4a6d0003c224c51fe0531a0854a2efe149bcee26daecf9a2e84/u
  );
  assert.match(text, /schema_version[^\n]*1/iu);
  assert.match(
    text,
    /pending[\s\S]*media-verified[\s\S]*asr-complete[\s\S]*events-indexed[\s\S]*visual-reviewed[\s\S]*evidence-packed[\s\S]*notes-reviewed[\s\S]*rules-reviewed/u
  );
  assert.match(text, /remaining non-pilot (?:episode )?count[^\n]*44/iu);
  assert.match(text, /foundations-tools-blocks-modularity-color/u);
  assert.match(
    text,
    /npm run playbook:chapter -- init[\s\S]*npm run playbook:chapter -- status[\s\S]*npm run playbook:chapter -- next --chapter foundations-tools-blocks-modularity-color/u
  );
  assert.match(text, /status[\s\S]*next[\s\S]*(?:read-only|只读)/iu);
  assert.match(text, /12\/12[\s\S]*19\/19[\s\S]*17\/17[\s\S]*25\/25/u);
  assert.match(text, /foundation only|does not (?:complete|claim|promote)/iu);
  assert.match(
    text,
    /npm run playbook:evidence -- media --bvid BV1guoPYkExk/u
  );
  assert.doesNotMatch(text, /\.local|https?:\/\/|transcripts?|frames?/iu);
});
