import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCourseManifestFromBilibiliSnapshot
} from '../src/playbook/course/bilibiliCourseSnapshot.js';
import {
  bilibiliCourseSnapshotFixture
} from './fixtures/bilibiliCourseSnapshotFixture.js';

const OPTIONS = Object.freeze({
  capturedAt: '2026-08-25T00:00:00.000Z',
  sourceUrl: 'https://www.bilibili.com/video/BV1HhEuzZEyZ/',
  expectedEpisodeCount: 2
});

test('Bilibili snapshot maps curriculum and published titles in source order', () => {
  const manifest = buildCourseManifestFromBilibiliSnapshot(
    bilibiliCourseSnapshotFixture(),
    OPTIONS
  );

  assert.equal(manifest.course.season_id, 4369851);
  assert.equal(manifest.course.author.platform_user_id, 351448296);
  assert.equal(manifest.episodes[0].order, 1);
  assert.equal(manifest.episodes[0].curriculum_title, '1.1结构入门');
  assert.equal(
    manifest.episodes[0].published_title,
    '结构为王【萌新也能学会的建筑教程01】'
  );
  assert.equal(
    manifest.episodes[0].canonical_url,
    'https://www.bilibili.com/video/BV1fNkgYBEyy/'
  );
  assert.equal(manifest.episodes[1].processing.role, 'technical-probe');
  assert.equal(manifest.episodes[1].published_at, '2025-05-11T06:27:45.000Z');
  assert.deepEqual(manifest.episodes[1].rights, {
    api_download_flag: true,
    no_reprint_flag: true,
    observation_source: 'direct-view'
  });
  assert.deepEqual(manifest.episodes[0].rights, {
    api_download_flag: null,
    no_reprint_flag: null,
    observation_source: 'season-summary-unverified'
  });
});

test('Bilibili snapshot conversion is byte-stable and ignores engagement stats', () => {
  const firstSnapshot = bilibiliCourseSnapshotFixture();
  const first = buildCourseManifestFromBilibiliSnapshot(firstSnapshot, OPTIONS);
  const second = buildCourseManifestFromBilibiliSnapshot(firstSnapshot, OPTIONS);
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  const statsChanged = bilibiliCourseSnapshotFixture();
  statsChanged.data.ugc_season.sections[0].episodes[0].arc.stat.view = 999999999;
  const changed = buildCourseManifestFromBilibiliSnapshot(statsChanged, OPTIONS);
  assert.equal(
    changed.episodes[0].metadata_fingerprint_sha256,
    first.episodes[0].metadata_fingerprint_sha256
  );
});

test('Bilibili snapshot conversion rejects count and author drift', () => {
  assert.throws(
    () => buildCourseManifestFromBilibiliSnapshot(
      bilibiliCourseSnapshotFixture(),
      { ...OPTIONS, expectedEpisodeCount: 50 }
    ),
    /PLAYBOOK_SNAPSHOT_EPISODE_COUNT_INVALID/u
  );

  const author = bilibiliCourseSnapshotFixture();
  author.data.ugc_season.mid = 7;
  assert.throws(
    () => buildCourseManifestFromBilibiliSnapshot(author, OPTIONS),
    /PLAYBOOK_SNAPSHOT_AUTHOR_INVALID/u
  );
});
