import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  parseArchitecturePlaybookEvidenceArgs
} from '../src/runArchitecturePlaybookEvidence.js';
import {
  acquireEpisodeMedia,
  resolveEpisodePlayback
} from '../src/playbook/course/episodeMedia.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI_CONTEXT = Object.freeze({
  projectRoot: '/tmp/playbook-cli-fixture',
  courseManifest: readJson(path.join(
    ROOT,
    'docs/architecture-playbook/course/course-manifest.json'
  )),
  chapterPlan: readJson(path.join(
    ROOT,
    'docs/architecture-playbook/course/chapter-plan-v1.json'
  ))
});
const PILOT_EPISODE_IDENTITIES = Object.freeze([
  Object.freeze({
    course_order: 8,
    bvid: 'BV1fNkgYBEyy',
    cid: 27418560409,
    duration_seconds: 587,
    metadata_fingerprint_sha256:
      'ce0e4cc091e393333317e882c614569e5fdc0283f7e170a0d14b9055304e2c6a'
  }),
  Object.freeze({
    course_order: 9,
    bvid: 'BV1HhEuzZEyZ',
    cid: 29903029909,
    duration_seconds: 781,
    metadata_fingerprint_sha256:
      '7b5c63d1b2ab64f4a61782ed9c24565302ea6c26242ed9c34e381e121b85b42e'
  }),
  Object.freeze({
    course_order: 13,
    bvid: 'BV1WhkbYeE5k',
    cid: 27454801403,
    duration_seconds: 1239,
    metadata_fingerprint_sha256:
      '1e8e082b7f627bc9d925d3b0f8b1d47192675ecc5767d5af637822fabfe5022f'
  }),
  Object.freeze({
    course_order: 16,
    bvid: 'BV1HTCaY6EDt',
    cid: 27575124287,
    duration_seconds: 1067,
    metadata_fingerprint_sha256:
      'df381dd8db5478abe93fc52984dc80d8411e9f02a5765cdbd427292883e59c49'
  }),
  Object.freeze({
    course_order: 44,
    bvid: 'BV1WsZcYZEMQ',
    cid: 29129180211,
    duration_seconds: 1073,
    metadata_fingerprint_sha256:
      '0bb5faf8eb4974e1afebd1eae27b2b69be24af8a3e005f406ee60dd48cbb8a0e'
  }),
  Object.freeze({
    course_order: 45,
    bvid: 'BV1jbdUYCEjG',
    cid: 29354033993,
    duration_seconds: 2634,
    metadata_fingerprint_sha256:
      '76af2f78176f1fae1c79bc73039ba02b4671cf92f38b3bc2121a4e32254ab95e'
  })
]);
const EPISODE = PILOT_EPISODE_IDENTITIES[0];
const CHAPTER_EPISODE = Object.freeze({
  chapter_id: 'foundations-tools-blocks-modularity-color',
  course_order: 1,
  bvid: 'BV1guoPYkExk',
  cid: 29440478157,
  duration_seconds: 205,
  metadata_fingerprint_sha256:
    'f6e8fbeae57aacbf478dff3484ebdd163deec9bc5fcf0c7dddbec9ec45d2600b'
});
const MEDIA_BYTES = Buffer.from('fixture-mp4-bytes');
const OBSERVED_AT = '2026-08-25T13:00:00.000Z';

test('evidence CLI preserves all six pilot media identities', () => {
  for (const expected of PILOT_EPISODE_IDENTITIES) {
    const parsed = parseArchitecturePlaybookEvidenceArgs([
      'media',
      '--bvid',
      expected.bvid
    ], CLI_CONTEXT);

    assert.equal(parsed.command, 'media');
    assert.equal(parsed.bvid, expected.bvid);
    assert.equal(parsed.replace, false);
    assert.deepEqual(pickAcquisitionIdentity(parsed.episode), expected);
  }
});

test('evidence CLI rejects a chapter-plan BVID redirect', () => {
  const redirected = structuredClone(CLI_CONTEXT.chapterPlan);
  redirected.chapters[1].episodes[0].bvid =
    redirected.chapters[1].episodes[1].bvid;

  assert.throws(() => parseArchitecturePlaybookEvidenceArgs([
    'media',
    '--bvid',
    EPISODE.bvid
  ], {
    ...CLI_CONTEXT,
    chapterPlan: redirected
  }), {
    code: 'PLAYBOOK_CHAPTER_SOURCE_DRIFT'
  });
});

test('evidence CLI routes local processor commands without media replacement', () => {
  const transcribe = parseArchitecturePlaybookEvidenceArgs([
    'transcribe',
    '--bvid',
    EPISODE.bvid
  ], CLI_CONTEXT);
  const frames = parseArchitecturePlaybookEvidenceArgs([
    'frames',
    '--bvid',
    EPISODE.bvid
  ], CLI_CONTEXT);
  const pack = parseArchitecturePlaybookEvidenceArgs([
    'pack',
    '--bvid',
    EPISODE.bvid
  ], CLI_CONTEXT);

  assert.equal(transcribe.command, 'transcribe');
  assert.equal(frames.command, 'frames');
  assert.equal(pack.command, 'pack');
  assert.throws(
    () => parseArchitecturePlaybookEvidenceArgs([
      'transcribe',
      '--bvid',
      EPISODE.bvid,
      '--replace'
    ], CLI_CONTEXT),
    /PLAYBOOK_EVIDENCE_ARGUMENT_INVALID_FOR_COMMAND/u
  );
});

test('playback resolution rejects direct-view identity drift', async () => {
  const fetchImpl = playbackFetch({ directBvid: 'BV1HhEuzZEyZ' });

  await assert.rejects(
    resolveEpisodePlayback({ episode: EPISODE, fetchImpl }),
    /PLAYBOOK_MEDIA_IDENTITY_DRIFT/u
  );
});

test('media acquisition writes exact bytes and a URL-free hash index', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-media-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));

  const result = await acquireEpisodeMedia({
    episode: EPISODE,
    projectRoot,
    fetchImpl: playbackFetch(),
    observedAt: OBSERVED_AT
  });
  const mediaPath = path.join(
    projectRoot,
    `.local/architecture-playbook/sources/${EPISODE.bvid}/source-360p.mp4`
  );
  const indexPath = path.join(path.dirname(mediaPath), 'media-index.json');
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));

  assert.equal(result.status, 'created');
  assert.deepEqual(await fs.readFile(mediaPath), MEDIA_BYTES);
  assert.equal(
    index.sha256,
    createHash('sha256').update(MEDIA_BYTES).digest('hex')
  );
  assert.equal(index.byte_size, MEDIA_BYTES.length);
  assert.equal(index.bvid, EPISODE.bvid);
  assert.equal(index.cid, EPISODE.cid);
  assert.equal(index.observed_at, OBSERVED_AT);
  assert.doesNotMatch(JSON.stringify(index), /fixture\.invalid|https?:\/\//u);
});

test('media acquisition accepts an exact manifest-bound non-pilot identity', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-media-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));

  const result = await acquireEpisodeMedia({
    episode: CHAPTER_EPISODE,
    projectRoot,
    fetchImpl: playbackFetch({ episode: CHAPTER_EPISODE }),
    observedAt: OBSERVED_AT
  });

  assert.equal(result.media_index.bvid, CHAPTER_EPISODE.bvid);
  assert.equal(result.media_index.cid, CHAPTER_EPISODE.cid);
  assert.equal(result.media_index.source_metadata_fingerprint_sha256,
    CHAPTER_EPISODE.metadata_fingerprint_sha256);
});

test('media acquisition reuses a verified index without network access', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-media-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await acquireEpisodeMedia({
    episode: EPISODE,
    projectRoot,
    fetchImpl: playbackFetch(),
    observedAt: OBSERVED_AT
  });

  const result = await acquireEpisodeMedia({
    episode: EPISODE,
    projectRoot,
    fetchImpl: async () => {
      throw new Error('network must not be used for a verified local artifact');
    },
    observedAt: '2026-08-25T14:00:00.000Z'
  });

  assert.equal(result.status, 'unchanged');
  assert.equal(result.media_index.observed_at, OBSERVED_AT);
});

test('media acquisition refuses to replace different existing bytes', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-media-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const mediaRoot = path.join(
    projectRoot,
    `.local/architecture-playbook/sources/${EPISODE.bvid}`
  );
  await fs.mkdir(mediaRoot, { recursive: true });
  await fs.writeFile(path.join(mediaRoot, 'source-360p.mp4'), 'different');

  await assert.rejects(
    acquireEpisodeMedia({
      episode: EPISODE,
      projectRoot,
      fetchImpl: playbackFetch(),
      observedAt: OBSERVED_AT
    }),
    /PLAYBOOK_MEDIA_CONFLICT/u
  );
  assert.equal(
    await fs.readFile(path.join(mediaRoot, 'source-360p.mp4'), 'utf8'),
    'different'
  );
});

function playbackFetch({ episode = EPISODE, directBvid = episode.bvid } = {}) {
  return async (url) => {
    if (url.includes('/x/web-interface/view')) {
      return Response.json({
        code: 0,
        data: {
          bvid: directBvid,
          cid: episode.cid,
          duration: episode.duration_seconds
        }
      });
    }
    if (url.includes('/x/player/playurl')) {
      return Response.json({
        code: 0,
        data: {
          quality: 16,
          format: 'mp4',
          timelength: episode.duration_seconds * 1000,
          durl: [{
            order: 1,
            length: episode.duration_seconds * 1000,
            size: MEDIA_BYTES.length,
            url: 'https://media.fixture.invalid/source.mp4'
          }]
        }
      });
    }
    if (url === 'https://media.fixture.invalid/source.mp4') {
      return new Response(MEDIA_BYTES, {
        status: 200,
        headers: { 'content-length': String(MEDIA_BYTES.length) }
      });
    }
    return new Response('not found', { status: 404 });
  };
}

function pickAcquisitionIdentity(episode) {
  return {
    course_order: episode.course_order,
    bvid: episode.bvid,
    cid: episode.cid,
    duration_seconds: episode.duration_seconds,
    metadata_fingerprint_sha256: episode.metadata_fingerprint_sha256
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}
