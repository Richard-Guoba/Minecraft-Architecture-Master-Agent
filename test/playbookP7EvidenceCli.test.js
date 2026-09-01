import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  parseArchitecturePlaybookEvidenceArgs
} from '../src/runArchitecturePlaybookEvidence.js';
import { buildChapterPlan } from '../src/playbook/course/chapterPlan.js';

const execFileAsync = promisify(execFile);
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

test('process CLI keeps checked-in authority fixed while an alternate root stores private media', async (t) => {
  const privateRoot = await fs.mkdtemp(path.join(
    os.tmpdir(),
    'playbook-evidence-private-root-'
  ));
  t.after(() => fs.rm(privateRoot, { recursive: true, force: true }));

  const forgedBvid = 'BV1aaaaaaaaa';
  const forgedManifest = structuredClone(COURSE_MANIFEST);
  forgedManifest.source_snapshot_sha256 = '9'.repeat(64);
  forgedManifest.episodes[0].bvid = forgedBvid;
  forgedManifest.episodes[0].episode_id = `bilibili:${forgedBvid}`;
  forgedManifest.episodes[0].canonical_url =
    `https://www.bilibili.com/video/${forgedBvid}/`;
  const forgedPlan = buildChapterPlan(forgedManifest, {
    createdAt: CHAPTER_PLAN.created_at
  });
  const forgedAuthorityRoot = path.join(
    privateRoot,
    'docs/architecture-playbook/course'
  );
  await fs.mkdir(forgedAuthorityRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(forgedAuthorityRoot, 'course-manifest.json'),
      JSON.stringify(forgedManifest)
    ),
    fs.writeFile(
      path.join(forgedAuthorityRoot, 'chapter-plan-v1.json'),
      JSON.stringify(forgedPlan)
    )
  ]);

  const approved = COURSE_MANIFEST.episodes[7];
  const mediaBytes = Buffer.from('alternate-private-root-media');
  const mediaSha256 = createHash('sha256').update(mediaBytes).digest('hex');
  const mediaRoot = path.join(
    privateRoot,
    `.local/architecture-playbook/sources/${approved.bvid}`
  );
  await fs.mkdir(mediaRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(mediaRoot, 'source-360p.mp4'), mediaBytes),
    fs.writeFile(path.join(mediaRoot, 'media-index.json'), JSON.stringify({
      schema_version: 1,
      bvid: approved.bvid,
      cid: approved.cid,
      source_metadata_fingerprint_sha256:
        approved.metadata_fingerprint_sha256,
      byte_size: mediaBytes.length,
      sha256: mediaSha256
    }))
  ]);

  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  delete childEnvironment.NODE_TEST_WORKER_ID;
  const approvedResult = await execFileAsync(process.execPath, [
    path.join(PROJECT_ROOT, 'src/runArchitecturePlaybookEvidence.js'),
    'media',
    '--bvid',
    approved.bvid
  ], {
    cwd: PROJECT_ROOT,
    env: {
      ...childEnvironment,
      PLAYBOOK_PROJECT_ROOT: privateRoot
    },
    encoding: 'utf8'
  });
  assert.equal(approvedResult.stderr, '');
  assert.match(approvedResult.stdout, /media_status=unchanged/u);
  assert.match(approvedResult.stdout, new RegExp(`bvid=${approved.bvid}`, 'u'));
  assert.match(approvedResult.stdout, new RegExp(`sha256=${mediaSha256}`, 'u'));

  await assert.rejects(execFileAsync(process.execPath, [
    path.join(PROJECT_ROOT, 'src/runArchitecturePlaybookEvidence.js'),
    'media',
    '--bvid',
    forgedBvid
  ], {
    cwd: PROJECT_ROOT,
    env: {
      ...childEnvironment,
      PLAYBOOK_PROJECT_ROOT: privateRoot
    },
    encoding: 'utf8'
  }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /^PLAYBOOK_CHAPTER_EPISODE_INVALID:/u);
    assert.doesNotMatch(error.stderr, /PLAYBOOK_PILOT_BVID_INVALID/u);
    return true;
  });
  await assert.rejects(fs.access(path.join(
    privateRoot,
    `.local/architecture-playbook/sources/${forgedBvid}`
  )));
});

function readJson(filePath) {
  return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
}
