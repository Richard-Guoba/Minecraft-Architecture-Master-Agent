import { validateCourseManifest } from '../contracts/courseManifest.js';
import { failPlaybookContract } from '../contracts/playbookContractError.js';

const CHAPTER_PLAN_ID = 'heihui-jileniao-course-chapters-v1';
const SHA256 = /^[a-f0-9]{64}$/u;
const BVID = /^BV[0-9A-Za-z]{10}$/u;
const TOP_LEVEL_FIELDS = [
  'schema_version',
  'chapter_plan_id',
  'created_at',
  'source_manifest_id',
  'source_snapshot_sha256',
  'chapter_count',
  'episode_count',
  'total_duration_seconds',
  'chapters'
];
const CHAPTER_FIELDS = [
  'chapter_order',
  'chapter_id',
  'course_order_start',
  'course_order_end',
  'episode_count',
  'total_duration_seconds',
  'episodes'
];
const EPISODE_FIELDS = [
  'course_order',
  'bvid',
  'cid',
  'duration_seconds',
  'metadata_fingerprint_sha256'
];

const CHAPTERS = Object.freeze([
  Object.freeze(['foundations-tools-blocks-modularity-color', 1, 7]),
  Object.freeze(['complete-structure', 8, 12]),
  Object.freeze(['complete-roofs', 13, 15]),
  Object.freeze(['complete-walls-facades', 16, 20]),
  Object.freeze(['landscaping-terrain', 21, 29]),
  Object.freeze(['interiors', 30, 36]),
  Object.freeze(['advanced-architecture', 37, 42]),
  Object.freeze(['style-specialist-cases', 43, 50])
]);

export function buildChapterPlan(courseManifest, { createdAt }) {
  const manifest = validateCourseManifest(courseManifest);
  assertTimestamp(createdAt, 'ChapterPlan.created_at');
  assertManifestEpisodeCount(manifest);

  const chapters = CHAPTERS.map(([chapterId, start, end], index) => {
    const episodes = manifest.episodes.slice(start - 1, end).map(toPlanEpisode);
    return {
      chapter_order: index + 1,
      chapter_id: chapterId,
      course_order_start: start,
      course_order_end: end,
      episode_count: episodes.length,
      total_duration_seconds: sumDuration(episodes),
      episodes
    };
  });

  return validateChapterPlan({
    schema_version: 1,
    chapter_plan_id: CHAPTER_PLAN_ID,
    created_at: createdAt,
    source_manifest_id: manifest.manifest_id,
    source_snapshot_sha256: manifest.source_snapshot_sha256,
    chapter_count: chapters.length,
    episode_count: manifest.episodes.length,
    total_duration_seconds: sumDuration(manifest.episodes),
    chapters
  }, manifest);
}

export function validateChapterPlan(value, courseManifest) {
  const manifest = validateCourseManifest(courseManifest);
  assertManifestEpisodeCount(manifest);
  const plan = cloneDocument(value);
  assertExactObject(plan, 'ChapterPlan', TOP_LEVEL_FIELDS);
  assertEqual(plan.schema_version, 1, 'ChapterPlan.schema_version');
  assertEqual(plan.chapter_plan_id, CHAPTER_PLAN_ID, 'ChapterPlan.chapter_plan_id');
  assertTimestamp(plan.created_at, 'ChapterPlan.created_at');
  assertEqual(
    plan.source_manifest_id,
    manifest.manifest_id,
    'ChapterPlan.source_manifest_id'
  );
  assertSha256(plan.source_snapshot_sha256, 'ChapterPlan.source_snapshot_sha256');
  assertEqual(
    plan.source_snapshot_sha256,
    manifest.source_snapshot_sha256,
    'ChapterPlan.source_snapshot_sha256'
  );
  assertEqual(plan.chapter_count, CHAPTERS.length, 'ChapterPlan.chapter_count');
  assertEqual(plan.episode_count, manifest.episodes.length, 'ChapterPlan.episode_count');
  assertEqual(
    plan.total_duration_seconds,
    sumDuration(manifest.episodes),
    'ChapterPlan.total_duration_seconds'
  );
  if (!Array.isArray(plan.chapters) || plan.chapters.length !== CHAPTERS.length) {
    invalid('ChapterPlan.chapters', 'expected all eight chapters');
  }

  const assignedBvids = new Set();
  let assignedCount = 0;
  let assignedDuration = 0;
  for (const [index, chapter] of plan.chapters.entries()) {
    const [chapterId, start, end] = CHAPTERS[index];
    const chapterPath = `ChapterPlan.chapters[${index}]`;
    assertExactObject(chapter, chapterPath, CHAPTER_FIELDS);
    assertEqual(chapter.chapter_order, index + 1, `${chapterPath}.chapter_order`);
    assertEqual(chapter.chapter_id, chapterId, `${chapterPath}.chapter_id`);
    assertEqual(chapter.course_order_start, start, `${chapterPath}.course_order_start`);
    assertEqual(chapter.course_order_end, end, `${chapterPath}.course_order_end`);

    const expectedEpisodes = manifest.episodes.slice(start - 1, end);
    assertEqual(
      chapter.episode_count,
      expectedEpisodes.length,
      `${chapterPath}.episode_count`
    );
    if (!Array.isArray(chapter.episodes) || chapter.episodes.length !== expectedEpisodes.length) {
      invalid(`${chapterPath}.episodes`, 'episode count does not match chapter range');
    }
    assertEqual(
      chapter.total_duration_seconds,
      sumDuration(expectedEpisodes),
      `${chapterPath}.total_duration_seconds`
    );

    let chapterDuration = 0;
    for (const [episodeIndex, episode] of chapter.episodes.entries()) {
      const episodePath = `${chapterPath}.episodes[${episodeIndex}]`;
      assertExactObject(episode, episodePath, EPISODE_FIELDS);
      const expected = expectedEpisodes[episodeIndex];
      for (const field of EPISODE_FIELDS) {
        const sourceField = field === 'course_order' ? 'order' : field;
        assertEqual(episode[field], expected[sourceField], `${episodePath}.${field}`);
      }
      if (assignedBvids.has(episode.bvid)) {
        invalid(`${episodePath}.bvid`, 'episode assigned more than once');
      }
      assignedBvids.add(episode.bvid);
      assignedCount += 1;
      chapterDuration += episode.duration_seconds;
    }
    assertEqual(
      chapterDuration,
      chapter.total_duration_seconds,
      `${chapterPath}.episodes`
    );
    assignedDuration += chapterDuration;
  }
  assertEqual(assignedCount, plan.episode_count, 'ChapterPlan.chapters');
  assertEqual(assignedBvids.size, manifest.episodes.length, 'ChapterPlan.chapters');
  assertEqual(assignedDuration, plan.total_duration_seconds, 'ChapterPlan.chapters');
  return deepFreeze(plan);
}

export function getChapterEpisodeIdentity({ chapterPlan, courseManifest, bvid }) {
  const manifest = validateCourseManifest(courseManifest);
  if (hasSourceDrift(chapterPlan, manifest)) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_SOURCE_DRIFT',
      'ChapterPlan',
      'chapter assignment no longer matches the supplied course manifest'
    );
  }
  const plan = validateChapterPlan(chapterPlan, manifest);
  const chapter = plan.chapters.find((candidate) => candidate.episodes.some(
    (episode) => episode.bvid === bvid
  ));
  const episode = chapter?.episodes.find((candidate) => candidate.bvid === bvid);
  if (!episode) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_EPISODE_INVALID',
      'bvid',
      String(bvid)
    );
  }
  return deepFreeze({
    chapter_id: chapter.chapter_id,
    ...structuredClone(episode)
  });
}

export function validateChapterEpisodeIdentity(value) {
  const episode = cloneDocument(value);
  assertExactObject(episode, 'ChapterEpisodeIdentity', [
    'chapter_id',
    'course_order',
    'bvid',
    'cid',
    'duration_seconds',
    'metadata_fingerprint_sha256'
  ]);
  const chapter = CHAPTERS.find(([chapterId]) => chapterId === episode.chapter_id);
  if (
    !chapter
    || !Number.isSafeInteger(episode.course_order)
    || episode.course_order < chapter[1]
    || episode.course_order > chapter[2]
    || typeof episode.bvid !== 'string'
    || !BVID.test(episode.bvid)
    || !Number.isSafeInteger(episode.cid)
    || episode.cid < 1
    || !Number.isSafeInteger(episode.duration_seconds)
    || episode.duration_seconds < 1
    || typeof episode.metadata_fingerprint_sha256 !== 'string'
    || !SHA256.test(episode.metadata_fingerprint_sha256)
  ) {
    invalid('ChapterEpisodeIdentity', 'invalid manifest-bound episode identity');
  }
  return deepFreeze(episode);
}

function hasSourceDrift(chapterPlan, manifest) {
  if (!chapterPlan || typeof chapterPlan !== 'object' || Array.isArray(chapterPlan)) {
    return false;
  }
  if (
    chapterPlan.source_manifest_id !== manifest.manifest_id
    || chapterPlan.source_snapshot_sha256 !== manifest.source_snapshot_sha256
  ) {
    return true;
  }
  if (!Array.isArray(chapterPlan.chapters)) return false;
  const sourceByBvid = new Map(manifest.episodes.map((episode) => [episode.bvid, episode]));
  return chapterPlan.chapters.some((chapter) => Array.isArray(chapter?.episodes)
    && chapter.episodes.some((episode) => {
      const source = sourceByBvid.get(episode?.bvid);
      return Boolean(source) && !sameEpisodeIdentity(episode, source);
    }));
}

function sameEpisodeIdentity(episode, source) {
  return episode.course_order === source.order
    && episode.bvid === source.bvid
    && episode.cid === source.cid
    && episode.duration_seconds === source.duration_seconds
    && episode.metadata_fingerprint_sha256 === source.metadata_fingerprint_sha256;
}

function toPlanEpisode(episode) {
  return {
    course_order: episode.order,
    bvid: episode.bvid,
    cid: episode.cid,
    duration_seconds: episode.duration_seconds,
    metadata_fingerprint_sha256: episode.metadata_fingerprint_sha256
  };
}

function assertManifestEpisodeCount(manifest) {
  if (manifest.episodes.length !== 50) {
    invalid('CourseManifest.episodes', 'chapter authority requires exactly 50 episodes');
  }
}

function sumDuration(episodes) {
  return episodes.reduce((total, episode) => total + episode.duration_seconds, 0);
}

function cloneDocument(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    invalid('ChapterPlan', error?.message || 'structured clone failed');
  }
}

function assertExactObject(value, objectPath, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(objectPath, 'expected object');
  }
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) invalid(`${objectPath}.${field}`, 'unknown field');
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) invalid(`${objectPath}.${field}`, 'missing field');
  }
}

function assertTimestamp(value, valuePath) {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    invalid(valuePath, 'expected ISO timestamp');
  }
}

function assertSha256(value, valuePath) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    invalid(valuePath, 'expected lowercase SHA-256');
  }
}

function assertEqual(value, expected, valuePath) {
  if (value !== expected) invalid(valuePath, `${value} != ${expected}`);
}

function invalid(path, detail) {
  failPlaybookContract('PLAYBOOK_CHAPTER_PLAN_INVALID', path, detail);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
