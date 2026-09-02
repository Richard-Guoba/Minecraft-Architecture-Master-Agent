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

test('P7 Chapter 5 report records subtitle completion without claiming human review', async () => {
  const [readme, report] = await Promise.all([
    read('docs/architecture-playbook/README.md'),
    read('docs/architecture-playbook/reports/p7-chapter-5-subtitle-expansion.md')
  ]);

  assert.match(readme, /order 21–29[^\n]*3,584/u);
  assert.match(report, /9 个课次[\s\S]*3,584 个字幕段/u);
  assert.match(report, /5 个章节、24 个有效来源和 69 条有界意图/u);
  assert.match(report, /b468c71273bac643f4a83425defe13391bbb7143b9a188e95d719c036b94082f/u);
  assert.match(report, /未声称完成人工视觉证据或规则晋级/u);
  assert.match(report, /正式 `events-indexed` 需要人工审核/u);
  assert.match(report, /npm run playbook:evidence -- media --bvid BV1DkPVexESz/u);
  assert.doesNotMatch(report, /visual-reviewed.*(?:已完成|complete)/iu);
});

test('P7 Chapter 6 report records subtitle completion without claiming human review', async () => {
  const [readme, report] = await Promise.all([
    read('docs/architecture-playbook/README.md'),
    read('docs/architecture-playbook/reports/p7-chapter-6-subtitle-expansion.md')
  ]);

  assert.match(readme, /order 30–36[^\n]*4,094[^\n]*87 条/u);
  assert.match(readme, /第六章 order 30–36[^\n]*87 条有界意图/u);
  assert.match(report, /7 个课次[\s\S]*4,094 个字幕段/u);
  assert.match(report, /6 个章节、31 个有效来源和 87 条有界意图/u);
  assert.match(report, /886114bf308d600d1ee5edd351b3b28dfab7f912d7dab6816bda30efcf8fd9dd/u);
  assert.match(report, /未声称完成人工视觉证据或规则晋级/u);
  assert.match(report, /正式 `events-indexed` 需要人工审核/u);
  assert.match(report, /npm run playbook:evidence -- media --bvid BV1JcQ3YYEg5/u);
  assert.doesNotMatch(report, /visual-reviewed.*(?:已完成|complete)/iu);
});

test('P7 Chapter 7 report records subtitle completion without claiming human review', async () => {
  const [readme, report] = await Promise.all([
    read('docs/architecture-playbook/README.md'),
    read('docs/architecture-playbook/reports/p7-chapter-7-subtitle-expansion.md')
  ]);

  assert.match(readme, /order 37–42[^\n]*2,426[^\n]*105 条/u);
  assert.match(readme, /第七章 order 37–42[^\n]*105 条有界意图/u);
  assert.match(report, /6 个课次[\s\S]*2,426 个字幕段/u);
  assert.match(report, /7 个章节、37 个有效来源和 105 条有界意图/u);
  assert.match(report, /3838f55384a6c23ea4eb946a5b26b77e43ac83e6e604b994826fb677420fb0b3/u);
  assert.match(report, /未声称完成人工视觉证据或规则晋级/u);
  assert.match(report, /正式 `events-indexed` 需要人工审核/u);
  assert.match(report, /npm run playbook:evidence -- media --bvid BV1K1oXYGEm2/u);
  assert.doesNotMatch(report, /visual-reviewed.*(?:已完成|complete)/iu);
});

test('P7 Chapter 8 report records full subtitle coverage without claiming human review', async () => {
  const [readme, report] = await Promise.all([
    read('docs/architecture-playbook/README.md'),
    read('docs/architecture-playbook/reports/p7-chapter-8-subtitle-expansion.md')
  ]);

  assert.match(readme, /order 43–50[^\n]*2,301[^\n]*123 条/u);
  assert.match(readme, /已处理课次聚合为 123 条 `subtitle-derived-advisory`/u);
  assert.match(report, /8 个课次[\s\S]*2,301 个字幕段/u);
  assert.match(report, /6 个新课次[\s\S]*1,885 个字幕段/u);
  assert.match(report, /8 个章节、43 个有效来源和 123 条有界意图/u);
  assert.match(report, /98a09b14c5a29fc76b93f61be016b82edb4a9a8c94cdcf76777533f0c1631c35/u);
  assert.match(report, /未声称完成人工视觉证据或规则晋级/u);
  assert.match(report, /正式 `events-indexed` 需要人工审核/u);
  assert.match(report, /50 集[\s\S]*字幕优先/u);
  assert.doesNotMatch(report, /visual-reviewed.*(?:已完成|complete)/iu);
});
