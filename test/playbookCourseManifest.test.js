import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAYBOOK_COURSE_MANIFEST_VERSION,
  validateCourseManifest
} from '../src/playbook/contracts/index.js';

test('CourseManifest validates and deeply freezes stable episode order', () => {
  const input = validManifestFixture();
  const result = validateCourseManifest(input);

  assert.equal(PLAYBOOK_COURSE_MANIFEST_VERSION, 1);
  assert.notEqual(result, input);
  assert.deepEqual(result.episodes.map((episode) => episode.bvid), [
    'BV1fNkgYBEyy',
    'BV1HhEuzZEyZ'
  ]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.course.author));
  assert.ok(Object.isFrozen(result.episodes[0].rights));
});

test('CourseManifest rejects duplicate BV identities and count drift', () => {
  const duplicate = validManifestFixture();
  duplicate.episodes[1].bvid = duplicate.episodes[0].bvid;
  duplicate.episodes[1].episode_id = duplicate.episodes[0].episode_id;
  assert.throws(
    () => validateCourseManifest(duplicate),
    /PLAYBOOK_EPISODE_BVID_DUPLICATE/u
  );

  const count = validManifestFixture();
  count.course.declared_episode_count = 50;
  assert.throws(
    () => validateCourseManifest(count),
    /PLAYBOOK_EPISODE_COUNT_MISMATCH/u
  );
});

test('CourseManifest rejects author drift and rights escalation', () => {
  const author = validManifestFixture();
  author.course.author.platform_user_id = 1;
  assert.throws(
    () => validateCourseManifest(author),
    /PLAYBOOK_PRIMARY_AUTHOR_INVALID/u
  );

  const rights = validManifestFixture();
  rights.rights.external_release_status = 'authorized';
  assert.throws(
    () => validateCourseManifest(rights),
    /PLAYBOOK_EXTERNAL_RELEASE_INVALID/u
  );
});

test('CourseManifest pins the technical probe to structure hierarchy', () => {
  const input = validManifestFixture();
  input.episodes[0].processing.role = 'technical-probe';
  input.episodes[1].processing.role = 'course';
  assert.throws(
    () => validateCourseManifest(input),
    /PLAYBOOK_TECHNICAL_PROBE_INVALID/u
  );
});

function validManifestFixture() {
  return {
    schema_version: 1,
    manifest_id: 'bilibili-ugc-season-4369851',
    captured_at: '2026-08-25T00:00:00.000Z',
    source_snapshot_sha256: 'a'.repeat(64),
    course: {
      platform: 'bilibili',
      season_id: 4369851,
      title: '极乐鸟的建筑课堂',
      primary_school: 'heihui-jileniao',
      canonical_url: 'https://www.bilibili.com/video/BV1HhEuzZEyZ/',
      author: {
        platform_user_id: 351448296,
        name: '黑辉极乐鸟'
      },
      declared_episode_count: 2
    },
    rights: {
      public_access_observed: true,
      local_analysis_status: 'project-authorized',
      training_status: 'not-reviewed',
      external_release_status: 'not-authorized'
    },
    episodes: [
      episodeFixture({
        order: 1,
        bvid: 'BV1fNkgYBEyy',
        aid: 113678489818718,
        cid: 27418560409,
        seasonEpisodeId: 98652025,
        curriculumTitle: '1.1结构入门',
        publishedTitle: '结构为王【萌新也能学会的建筑教程01】',
        durationSeconds: 587,
        publishedAt: '2024-12-19T09:37:52.000Z',
        role: 'course'
      }),
      episodeFixture({
        order: 2,
        bvid: 'BV1HhEuzZEyZ',
        aid: 114487721991793,
        cid: 29903029909,
        seasonEpisodeId: 124086363,
        curriculumTitle: '1.2结构主次',
        publishedTitle: '还在做这样的火柴盒？结构主次很重要！',
        durationSeconds: 781,
        publishedAt: '2025-05-11T06:27:45.000Z',
        role: 'technical-probe'
      })
    ]
  };
}

function episodeFixture({
  order,
  bvid,
  aid,
  cid,
  seasonEpisodeId,
  curriculumTitle,
  publishedTitle,
  durationSeconds,
  publishedAt,
  role
}) {
  return {
    order,
    episode_id: `bilibili:${bvid}`,
    bvid,
    aid,
    cid,
    season_episode_id: seasonEpisodeId,
    curriculum_title: curriculumTitle,
    published_title: publishedTitle,
    duration_seconds: durationSeconds,
    published_at: publishedAt,
    canonical_url: `https://www.bilibili.com/video/${bvid}/`,
    source_status: 'public',
    rights: {
      api_download_flag: role === 'technical-probe' ? true : null,
      no_reprint_flag: role === 'technical-probe' ? true : null,
      observation_source: role === 'technical-probe'
        ? 'direct-view'
        : 'season-summary-unverified'
    },
    metadata_fingerprint_sha256: order === 1 ? 'b'.repeat(64) : 'c'.repeat(64),
    processing: {
      role,
      status: 'not-started'
    }
  };
}
