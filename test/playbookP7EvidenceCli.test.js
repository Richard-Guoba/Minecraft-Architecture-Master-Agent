import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  parseArchitecturePlaybookEvidenceArgs
} from '../src/runArchitecturePlaybookEvidence.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const COURSE_MANIFEST = readJson(path.join(
  PROJECT_ROOT,
  'docs/architecture-playbook/course/course-manifest.json'
));
const CHAPTER_PLAN = readJson(path.join(
  PROJECT_ROOT,
  'docs/architecture-playbook/course/chapter-plan-v1.json'
));

test('evidence CLI admits a manifest-bound non-pilot episode', () => {
  const parsed = parseArchitecturePlaybookEvidenceArgs([
    'media',
    '--bvid',
    'BV1iVLbzcEfG'
  ], {
    projectRoot: PROJECT_ROOT,
    courseManifest: COURSE_MANIFEST,
    chapterPlan: CHAPTER_PLAN
  });

  assert.deepEqual(parsed.episode, {
    chapter_id: 'foundations-tools-blocks-modularity-color',
    course_order: 5,
    bvid: 'BV1iVLbzcEfG',
    cid: 29565124686,
    duration_seconds: 642,
    metadata_fingerprint_sha256:
      '3fabe347aa237986d938e0b66790251c053b14eb05a5c40a373368fe66fd5323'
  });
});

test('evidence CLI distinguishes an unknown BVID from manifest fingerprint drift', () => {
  assert.throws(() => parseArchitecturePlaybookEvidenceArgs([
    'media',
    '--bvid',
    'BV1aaaaaaaaaa'
  ], {
    projectRoot: PROJECT_ROOT,
    courseManifest: COURSE_MANIFEST,
    chapterPlan: CHAPTER_PLAN
  }), {
    code: 'PLAYBOOK_CHAPTER_EPISODE_INVALID'
  });

  const drifted = structuredClone(COURSE_MANIFEST);
  drifted.episodes[4].metadata_fingerprint_sha256 = '0'.repeat(64);
  assert.throws(() => parseArchitecturePlaybookEvidenceArgs([
    'media',
    '--bvid',
    'BV1iVLbzcEfG'
  ], {
    projectRoot: PROJECT_ROOT,
    courseManifest: drifted,
    chapterPlan: CHAPTER_PLAN
  }), {
    code: 'PLAYBOOK_CHAPTER_SOURCE_DRIFT'
  });
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
