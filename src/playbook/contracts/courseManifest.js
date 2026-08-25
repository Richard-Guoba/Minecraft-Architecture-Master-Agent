import { failPlaybookContract } from './playbookContractError.js';

export const PLAYBOOK_COURSE_MANIFEST_VERSION = 1;

const TOP_LEVEL_FIELDS = [
  'schema_version',
  'manifest_id',
  'captured_at',
  'source_snapshot_sha256',
  'course',
  'rights',
  'episodes'
];
const COURSE_FIELDS = [
  'platform',
  'season_id',
  'title',
  'primary_school',
  'canonical_url',
  'author',
  'declared_episode_count'
];
const EPISODE_FIELDS = [
  'order',
  'episode_id',
  'bvid',
  'aid',
  'cid',
  'season_episode_id',
  'curriculum_title',
  'published_title',
  'duration_seconds',
  'published_at',
  'canonical_url',
  'source_status',
  'rights',
  'metadata_fingerprint_sha256',
  'processing'
];
const SHA256 = /^[a-f0-9]{64}$/u;
const BVID = /^BV[1-9A-Za-z]{10}$/u;

export function validateCourseManifest(value) {
  const manifest = cloneDocument(value);
  assertExactObject(manifest, 'CourseManifest', TOP_LEVEL_FIELDS);
  if (manifest.schema_version !== PLAYBOOK_COURSE_MANIFEST_VERSION) {
    failPlaybookContract(
      'PLAYBOOK_MANIFEST_VERSION_INVALID',
      'CourseManifest.schema_version',
      manifest.schema_version
    );
  }
  assertEqual(
    manifest.manifest_id,
    'bilibili-ugc-season-4369851',
    'PLAYBOOK_MANIFEST_ID_INVALID',
    'CourseManifest.manifest_id'
  );
  assertTimestamp(manifest.captured_at, 'CourseManifest.captured_at');
  assertSha256(
    manifest.source_snapshot_sha256,
    'CourseManifest.source_snapshot_sha256'
  );
  validateCourse(manifest.course);
  validateTopLevelRights(manifest.rights);
  validateEpisodes(manifest.episodes, manifest.course.declared_episode_count);
  return deepFreeze(manifest);
}

function validateCourse(course) {
  assertExactObject(course, 'CourseManifest.course', COURSE_FIELDS);
  assertEqual(
    course.platform,
    'bilibili',
    'PLAYBOOK_PLATFORM_INVALID',
    'CourseManifest.course.platform'
  );
  assertEqual(
    course.season_id,
    4369851,
    'PLAYBOOK_SEASON_INVALID',
    'CourseManifest.course.season_id'
  );
  assertNonemptyString(course.title, 'CourseManifest.course.title');
  assertEqual(
    course.primary_school,
    'heihui-jileniao',
    'PLAYBOOK_PRIMARY_SCHOOL_INVALID',
    'CourseManifest.course.primary_school'
  );
  assertHttpsUrl(course.canonical_url, 'CourseManifest.course.canonical_url');
  assertExactObject(course.author, 'CourseManifest.course.author', [
    'platform_user_id',
    'name'
  ]);
  if (course.author.platform_user_id !== 351448296) {
    failPlaybookContract(
      'PLAYBOOK_PRIMARY_AUTHOR_INVALID',
      'CourseManifest.course.author.platform_user_id',
      course.author.platform_user_id
    );
  }
  assertEqual(
    course.author.name,
    '黑辉极乐鸟',
    'PLAYBOOK_PRIMARY_AUTHOR_INVALID',
    'CourseManifest.course.author.name'
  );
  assertPositiveInteger(
    course.declared_episode_count,
    'CourseManifest.course.declared_episode_count'
  );
}

function validateTopLevelRights(rights) {
  assertExactObject(rights, 'CourseManifest.rights', [
    'public_access_observed',
    'local_analysis_status',
    'training_status',
    'external_release_status'
  ]);
  assertBoolean(
    rights.public_access_observed,
    'CourseManifest.rights.public_access_observed'
  );
  assertEqual(
    rights.local_analysis_status,
    'project-authorized',
    'PLAYBOOK_LOCAL_ANALYSIS_STATUS_INVALID',
    'CourseManifest.rights.local_analysis_status'
  );
  assertEnum(
    rights.training_status,
    ['not-reviewed', 'restricted', 'authorized'],
    'CourseManifest.rights.training_status'
  );
  if (rights.external_release_status !== 'not-authorized') {
    failPlaybookContract(
      'PLAYBOOK_EXTERNAL_RELEASE_INVALID',
      'CourseManifest.rights.external_release_status',
      rights.external_release_status
    );
  }
}

function validateEpisodes(episodes, declaredCount) {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    failPlaybookContract(
      'PLAYBOOK_EPISODES_INVALID',
      'CourseManifest.episodes',
      'expected non-empty array'
    );
  }
  if (episodes.length !== declaredCount) {
    failPlaybookContract(
      'PLAYBOOK_EPISODE_COUNT_MISMATCH',
      'CourseManifest.episodes',
      `${episodes.length} != ${declaredCount}`
    );
  }
  const identities = {
    bvid: new Set(),
    episode_id: new Set(),
    aid: new Set(),
    cid: new Set(),
    season_episode_id: new Set()
  };
  let probeCount = 0;
  for (let index = 0; index < episodes.length; index += 1) {
    const episode = episodes[index];
    const episodePath = `CourseManifest.episodes[${index}]`;
    assertExactObject(episode, episodePath, EPISODE_FIELDS);
    if (episode.order !== index + 1) {
      failPlaybookContract(
        'PLAYBOOK_EPISODE_ORDER_INVALID',
        `${episodePath}.order`,
        `${episode.order} != ${index + 1}`
      );
    }
    assertBvid(episode.bvid, `${episodePath}.bvid`);
    assertEqual(
      episode.episode_id,
      `bilibili:${episode.bvid}`,
      'PLAYBOOK_EPISODE_ID_INVALID',
      `${episodePath}.episode_id`
    );
    for (const field of Object.keys(identities)) {
      if (identities[field].has(episode[field])) {
        const code = field === 'bvid'
          ? 'PLAYBOOK_EPISODE_BVID_DUPLICATE'
          : 'PLAYBOOK_EPISODE_IDENTITY_DUPLICATE';
        failPlaybookContract(code, `${episodePath}.${field}`, episode[field]);
      }
      identities[field].add(episode[field]);
    }
    for (const field of ['aid', 'cid', 'season_episode_id']) {
      assertPositiveInteger(episode[field], `${episodePath}.${field}`);
    }
    assertNonemptyString(
      episode.curriculum_title,
      `${episodePath}.curriculum_title`
    );
    assertNonemptyString(
      episode.published_title,
      `${episodePath}.published_title`
    );
    assertPositiveInteger(
      episode.duration_seconds,
      `${episodePath}.duration_seconds`
    );
    assertTimestamp(episode.published_at, `${episodePath}.published_at`);
    assertEqual(
      episode.canonical_url,
      `https://www.bilibili.com/video/${episode.bvid}/`,
      'PLAYBOOK_EPISODE_URL_INVALID',
      `${episodePath}.canonical_url`
    );
    assertEnum(
      episode.source_status,
      ['public', 'source-unavailable', 'unknown'],
      `${episodePath}.source_status`
    );
    validateEpisodeRights(episode.rights, `${episodePath}.rights`);
    assertSha256(
      episode.metadata_fingerprint_sha256,
      `${episodePath}.metadata_fingerprint_sha256`
    );
    validateProcessing(episode.processing, `${episodePath}.processing`);
    if (episode.processing.role === 'technical-probe') {
      probeCount += 1;
      if (episode.bvid !== 'BV1HhEuzZEyZ') {
        failPlaybookContract(
          'PLAYBOOK_TECHNICAL_PROBE_INVALID',
          `${episodePath}.bvid`,
          episode.bvid
        );
      }
    }
  }
  if (probeCount !== 1) {
    failPlaybookContract(
      'PLAYBOOK_TECHNICAL_PROBE_INVALID',
      'CourseManifest.episodes',
      `expected one technical probe, received ${probeCount}`
    );
  }
}

function validateEpisodeRights(rights, rightsPath) {
  assertExactObject(rights, rightsPath, [
    'api_download_flag',
    'no_reprint_flag'
  ]);
  assertBoolean(rights.api_download_flag, `${rightsPath}.api_download_flag`);
  assertBoolean(rights.no_reprint_flag, `${rightsPath}.no_reprint_flag`);
}

function validateProcessing(processing, processingPath) {
  assertExactObject(processing, processingPath, ['role', 'status']);
  assertEnum(
    processing.role,
    ['course', 'technical-probe'],
    `${processingPath}.role`
  );
  assertEnum(
    processing.status,
    ['not-started', 'metadata-ready', 'source-unavailable'],
    `${processingPath}.status`
  );
}

function cloneDocument(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_DOCUMENT_UNCLONEABLE',
      'CourseManifest',
      error?.message || 'structured clone failed'
    );
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertExactObject(value, objectPath, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failPlaybookContract(
      'PLAYBOOK_OBJECT_INVALID',
      objectPath,
      'expected object'
    );
  }
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      failPlaybookContract(
        'PLAYBOOK_FIELD_UNKNOWN',
        `${objectPath}.${field}`,
        'unknown field'
      );
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      failPlaybookContract(
        'PLAYBOOK_FIELD_REQUIRED',
        `${objectPath}.${field}`,
        'missing field'
      );
    }
  }
}

function assertEqual(value, expected, code, valuePath) {
  if (value !== expected) {
    failPlaybookContract(code, valuePath, `${value} != ${expected}`);
  }
}

function assertEnum(value, allowed, valuePath) {
  if (!allowed.includes(value)) {
    failPlaybookContract(
      'PLAYBOOK_ENUM_INVALID',
      valuePath,
      `expected one of ${allowed.join(',')}`
    );
  }
}

function assertNonemptyString(value, valuePath) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    failPlaybookContract(
      'PLAYBOOK_STRING_INVALID',
      valuePath,
      'expected non-empty string up to 4096 characters'
    );
  }
}

function assertBoolean(value, valuePath) {
  if (typeof value !== 'boolean') {
    failPlaybookContract(
      'PLAYBOOK_BOOLEAN_INVALID',
      valuePath,
      'expected boolean'
    );
  }
}

function assertPositiveInteger(value, valuePath) {
  if (!Number.isSafeInteger(value) || value < 1) {
    failPlaybookContract(
      'PLAYBOOK_INTEGER_INVALID',
      valuePath,
      'expected positive safe integer'
    );
  }
}

function assertBvid(value, valuePath) {
  if (typeof value !== 'string' || !BVID.test(value)) {
    failPlaybookContract(
      'PLAYBOOK_BVID_INVALID',
      valuePath,
      String(value)
    );
  }
}

function assertSha256(value, valuePath) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    failPlaybookContract(
      'PLAYBOOK_SHA256_INVALID',
      valuePath,
      'expected lowercase SHA-256'
    );
  }
}

function assertTimestamp(value, valuePath) {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    failPlaybookContract(
      'PLAYBOOK_TIMESTAMP_INVALID',
      valuePath,
      String(value)
    );
  }
}

function assertHttpsUrl(value, valuePath) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    failPlaybookContract('PLAYBOOK_URL_INVALID', valuePath, String(value));
  }
  if (parsed.protocol !== 'https:') {
    failPlaybookContract('PLAYBOOK_URL_INVALID', valuePath, parsed.protocol);
  }
}
