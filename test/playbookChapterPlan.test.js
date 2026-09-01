import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildChapterPlan,
  getChapterEpisodeIdentity,
  validateChapterPlan
} from '../src/playbook/course/chapterPlan.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const COURSE_MANIFEST_PATH = path.join(
  ROOT,
  'docs/architecture-playbook/course/course-manifest.json'
);
const CHAPTER_PLAN_PATH = path.join(
  ROOT,
  'docs/architecture-playbook/course/chapter-plan-v1.json'
);
const EXPECTED_CHAPTERS = [
  ['foundations-tools-blocks-modularity-color', 1, 7, 6225],
  ['complete-structure', 8, 12, 4315],
  ['complete-roofs', 13, 15, 3871],
  ['complete-walls-facades', 16, 20, 5494],
  ['landscaping-terrain', 21, 29, 9062],
  ['interiors', 30, 36, 9089],
  ['advanced-architecture', 37, 42, 5830],
  ['style-specialist-cases', 43, 50, 8106]
];

test('chapter plan assigns every manifest episode exactly once', () => {
  const courseManifest = readJson(COURSE_MANIFEST_PATH);
  const plan = buildChapterPlan(courseManifest, {
    createdAt: '2026-09-01T00:00:00.000Z'
  });

  assert.deepEqual(
    plan.chapters.map((chapter) => chapter.episodes.map((episode) => episode.course_order)),
    [
      [1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12],
      [13, 14, 15],
      [16, 17, 18, 19, 20],
      [21, 22, 23, 24, 25, 26, 27, 28, 29],
      [30, 31, 32, 33, 34, 35, 36],
      [37, 38, 39, 40, 41, 42],
      [43, 44, 45, 46, 47, 48, 49, 50]
    ]
  );
  assert.deepEqual(
    plan.chapters.map((chapter) => [
      chapter.chapter_id,
      chapter.course_order_start,
      chapter.course_order_end,
      chapter.total_duration_seconds
    ]),
    EXPECTED_CHAPTERS
  );
  assert.equal(
    new Set(plan.chapters.flatMap((chapter) => chapter.episodes.map((episode) => episode.bvid))).size,
    50
  );
  assert.equal(plan.episode_count, 50);
  assert.equal(plan.total_duration_seconds, 51992);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.chapters[0].episodes[0]));
});

test('chapter validation rejects omission, duplication, reordering, and source drift', () => {
  const courseManifest = readJson(COURSE_MANIFEST_PATH);
  const validPlan = buildChapterPlan(courseManifest, {
    createdAt: '2026-09-01T00:00:00.000Z'
  });
  const corruptions = [];
  const omitted = structuredClone(validPlan);
  omitted.chapters[0].episodes.pop();
  corruptions.push(omitted);
  const duplicated = structuredClone(validPlan);
  duplicated.chapters[1].episodes[0] = structuredClone(duplicated.chapters[0].episodes[0]);
  corruptions.push(duplicated);
  const reordered = structuredClone(validPlan);
  [reordered.chapters[0].episodes[0], reordered.chapters[0].episodes[1]] =
    [reordered.chapters[0].episodes[1], reordered.chapters[0].episodes[0]];
  corruptions.push(reordered);
  const drifted = structuredClone(validPlan);
  drifted.chapters[0].episodes[0].metadata_fingerprint_sha256 = '0'.repeat(64);
  corruptions.push(drifted);

  for (const corrupted of corruptions) {
    assert.throws(() => validateChapterPlan(corrupted, courseManifest), {
      code: 'PLAYBOOK_CHAPTER_PLAN_INVALID'
    });
  }
});

test('chapter plan resolves only manifest-bound identities and rejects unknown fields', () => {
  const courseManifest = readJson(COURSE_MANIFEST_PATH);
  const checkedIn = readJson(CHAPTER_PLAN_PATH);
  const identity = getChapterEpisodeIdentity({
    chapterPlan: checkedIn,
    courseManifest,
    bvid: 'BV1iVLbzcEfG'
  });

  assert.deepEqual(identity, {
    chapter_id: 'foundations-tools-blocks-modularity-color',
    course_order: 5,
    bvid: 'BV1iVLbzcEfG',
    cid: 29565124686,
    duration_seconds: 642,
    metadata_fingerprint_sha256: '3fabe347aa237986d938e0b66790251c053b14eb05a5c40a373368fe66fd5323'
  });
  assert.ok(Object.isFrozen(identity));

  const unknownField = structuredClone(checkedIn);
  unknownField.chapters[0].unknown = true;
  assert.throws(() => validateChapterPlan(unknownField, courseManifest), {
    code: 'PLAYBOOK_CHAPTER_PLAN_INVALID'
  });
  assert.throws(() => getChapterEpisodeIdentity({
    chapterPlan: checkedIn,
    courseManifest,
    bvid: 'BV1aaaaaaaaaa'
  }), { code: 'PLAYBOOK_CHAPTER_EPISODE_INVALID' });
});

test('checked-in chapter plan is the deterministic build product', () => {
  const courseManifest = readJson(COURSE_MANIFEST_PATH);
  const checkedIn = readJson(CHAPTER_PLAN_PATH);
  const rebuilt = buildChapterPlan(courseManifest, {
    createdAt: checkedIn.created_at
  });

  assert.deepEqual(checkedIn, rebuilt);
  assert.deepEqual(validateChapterPlan(checkedIn, courseManifest), rebuilt);
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
