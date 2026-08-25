import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const EPISODE = Object.freeze({
  bvid: 'BV1fNkgYBEyy',
  cid: 27418560409,
  duration_seconds: 587,
  metadata_fingerprint_sha256: 'ce0e4cc091e393333317e882c614569e5fdc0283f7e170a0d14b9055304e2c6a'
});
const MEDIA_BYTES = Buffer.from('fixture-mp4-bytes');
const OBSERVED_AT = '2026-08-25T13:00:00.000Z';

test('evidence CLI accepts media only for the approved pilot set', () => {
  const parsed = parseArchitecturePlaybookEvidenceArgs([
    'media',
    '--bvid',
    EPISODE.bvid
  ], { projectRoot: '/tmp/playbook-cli-fixture' });

  assert.equal(parsed.command, 'media');
  assert.equal(parsed.bvid, EPISODE.bvid);
  assert.equal(parsed.replace, false);

  assert.throws(
    () => parseArchitecturePlaybookEvidenceArgs([
      'media',
      '--bvid',
      'BV1SN9xBWEmF'
    ], { projectRoot: '/tmp/playbook-cli-fixture' }),
    /PLAYBOOK_PILOT_BVID_INVALID/u
  );
});

test('evidence CLI routes local processor commands without media replacement', () => {
  const transcribe = parseArchitecturePlaybookEvidenceArgs([
    'transcribe',
    '--bvid',
    EPISODE.bvid
  ], { projectRoot: '/tmp/playbook-cli-fixture' });
  const frames = parseArchitecturePlaybookEvidenceArgs([
    'frames',
    '--bvid',
    EPISODE.bvid
  ], { projectRoot: '/tmp/playbook-cli-fixture' });

  assert.equal(transcribe.command, 'transcribe');
  assert.equal(frames.command, 'frames');
  assert.throws(
    () => parseArchitecturePlaybookEvidenceArgs([
      'transcribe',
      '--bvid',
      EPISODE.bvid,
      '--replace'
    ], { projectRoot: '/tmp/playbook-cli-fixture' }),
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

function playbackFetch({ directBvid = EPISODE.bvid } = {}) {
  return async (url) => {
    if (url.includes('/x/web-interface/view')) {
      return Response.json({
        code: 0,
        data: {
          bvid: directBvid,
          cid: EPISODE.cid,
          duration: EPISODE.duration_seconds
        }
      });
    }
    if (url.includes('/x/player/playurl')) {
      return Response.json({
        code: 0,
        data: {
          quality: 16,
          format: 'mp4',
          timelength: EPISODE.duration_seconds * 1000,
          durl: [{
            order: 1,
            length: EPISODE.duration_seconds * 1000,
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
