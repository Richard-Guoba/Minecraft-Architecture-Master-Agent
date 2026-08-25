import { validateCourseManifest } from '../contracts/courseManifest.js';
import { failPlaybookContract } from '../contracts/playbookContractError.js';

const PILOT_ID = 'heihui-jileniao-six-episode-v0.1';
const SCHOOL_ID = 'heihui-jileniao';
const EXPECTED_TOTAL_DURATION_SECONDS = 7381;
const SHA256 = /^[a-f0-9]{64}$/u;
const TOP_LEVEL_FIELDS = [
  'schema_version',
  'pilot_id',
  'created_at',
  'school_id',
  'source_manifest_id',
  'source_snapshot_sha256',
  'episode_count',
  'total_duration_seconds',
  'episodes'
];
const EPISODE_FIELDS = [
  'pilot_order',
  'course_order',
  'bvid',
  'cid',
  'curriculum_title',
  'duration_seconds',
  'metadata_fingerprint_sha256',
  'pilot_role'
];

const PILOT_EPISODES = Object.freeze([
  Object.freeze({
    course_order: 8,
    bvid: 'BV1fNkgYBEyy',
    cid: 27418560409,
    curriculum_title: '1.1结构入门',
    duration_seconds: 587,
    metadata_fingerprint_sha256: 'ce0e4cc091e393333317e882c614569e5fdc0283f7e170a0d14b9055304e2c6a',
    pilot_role: 'structure-foundations'
  }),
  Object.freeze({
    course_order: 9,
    bvid: 'BV1HhEuzZEyZ',
    cid: 29903029909,
    curriculum_title: '1.2结构主次',
    duration_seconds: 781,
    metadata_fingerprint_sha256: '7b5c63d1b2ab64f4a61782ed9c24565302ea6c26242ed9c34e381e121b85b42e',
    pilot_role: 'structure-hierarchy'
  }),
  Object.freeze({
    course_order: 13,
    bvid: 'BV1WhkbYeE5k',
    cid: 27454801403,
    curriculum_title: '2.1屋顶入门',
    duration_seconds: 1239,
    metadata_fingerprint_sha256: '1e8e082b7f627bc9d925d3b0f8b1d47192675ecc5767d5af637822fabfe5022f',
    pilot_role: 'roof-foundations'
  }),
  Object.freeze({
    course_order: 16,
    bvid: 'BV1HTCaY6EDt',
    cid: 27575124287,
    curriculum_title: '3.1墙面入门',
    duration_seconds: 1067,
    metadata_fingerprint_sha256: 'df381dd8db5478abe93fc52984dc80d8411e9f02a5765cdbd427292883e59c49',
    pilot_role: 'facade-foundations'
  }),
  Object.freeze({
    course_order: 44,
    bvid: 'BV1WsZcYZEMQ',
    cid: 29129180211,
    curriculum_title: '【中世纪1.1】民居结构',
    duration_seconds: 1073,
    metadata_fingerprint_sha256: '0bb5faf8eb4974e1afebd1eae27b2b69be24af8a3e005f406ee60dd48cbb8a0e',
    pilot_role: 'medieval-house-structure'
  }),
  Object.freeze({
    course_order: 45,
    bvid: 'BV1jbdUYCEjG',
    cid: 29354033993,
    curriculum_title: '【中世纪1.2】民居范例',
    duration_seconds: 2634,
    metadata_fingerprint_sha256: '76af2f78176f1fae1c79bc73039ba02b4671cf92f38b3bc2121a4e32254ab95e',
    pilot_role: 'medieval-house-case'
  })
]);

export function buildPilotEpisodeSet(courseManifest, { createdAt }) {
  const manifest = validateCourseManifest(courseManifest);
  assertTimestamp(createdAt, 'PilotEpisodeSet.created_at');
  const episodes = PILOT_EPISODES.map((expected, index) => {
    const source = manifest.episodes.find(
      (episode) => episode.bvid === expected.bvid
    );
    if (!source || !matchesExpectedSource(source, expected)) {
      failPlaybookContract(
        'PLAYBOOK_PILOT_SOURCE_DRIFT',
        `CourseManifest.episodes[${expected.bvid}]`,
        'approved pilot identity no longer matches the captured source'
      );
    }
    return {
      pilot_order: index + 1,
      ...structuredClone(expected)
    };
  });
  return validatePilotEpisodeSet({
    schema_version: 1,
    pilot_id: PILOT_ID,
    created_at: createdAt,
    school_id: SCHOOL_ID,
    source_manifest_id: manifest.manifest_id,
    source_snapshot_sha256: manifest.source_snapshot_sha256,
    episode_count: episodes.length,
    total_duration_seconds: episodes.reduce(
      (total, episode) => total + episode.duration_seconds,
      0
    ),
    episodes
  });
}

export function validatePilotEpisodeSet(value) {
  const pilot = cloneDocument(value);
  assertExactObject(pilot, 'PilotEpisodeSet', TOP_LEVEL_FIELDS);
  assertEqual(
    pilot.schema_version,
    1,
    'PLAYBOOK_PILOT_VERSION_INVALID',
    'PilotEpisodeSet.schema_version'
  );
  assertEqual(
    pilot.pilot_id,
    PILOT_ID,
    'PLAYBOOK_PILOT_ID_INVALID',
    'PilotEpisodeSet.pilot_id'
  );
  assertTimestamp(pilot.created_at, 'PilotEpisodeSet.created_at');
  assertEqual(
    pilot.school_id,
    SCHOOL_ID,
    'PLAYBOOK_PILOT_SCHOOL_INVALID',
    'PilotEpisodeSet.school_id'
  );
  assertEqual(
    pilot.source_manifest_id,
    'bilibili-ugc-season-4369851',
    'PLAYBOOK_PILOT_SOURCE_INVALID',
    'PilotEpisodeSet.source_manifest_id'
  );
  assertSha256(
    pilot.source_snapshot_sha256,
    'PilotEpisodeSet.source_snapshot_sha256'
  );
  assertEqual(
    pilot.episode_count,
    PILOT_EPISODES.length,
    'PLAYBOOK_PILOT_COUNT_INVALID',
    'PilotEpisodeSet.episode_count'
  );
  assertEqual(
    pilot.total_duration_seconds,
    EXPECTED_TOTAL_DURATION_SECONDS,
    'PLAYBOOK_PILOT_DURATION_INVALID',
    'PilotEpisodeSet.total_duration_seconds'
  );
  if (!Array.isArray(pilot.episodes) || pilot.episodes.length !== pilot.episode_count) {
    failPlaybookContract(
      'PLAYBOOK_PILOT_COUNT_INVALID',
      'PilotEpisodeSet.episodes',
      `expected ${pilot.episode_count} episodes`
    );
  }
  let calculatedDuration = 0;
  for (const [index, episode] of pilot.episodes.entries()) {
    const expected = PILOT_EPISODES[index];
    const episodePath = `PilotEpisodeSet.episodes[${index}]`;
    assertExactObject(episode, episodePath, EPISODE_FIELDS);
    if (episode.pilot_order !== index + 1 || episode.bvid !== expected.bvid) {
      failPlaybookContract(
        'PLAYBOOK_PILOT_ORDER_INVALID',
        episodePath,
        `expected ${index + 1}/${expected.bvid}`
      );
    }
    if (!matchesExpectedSource(episode, expected)) {
      failPlaybookContract(
        'PLAYBOOK_PILOT_SOURCE_DRIFT',
        episodePath,
        'episode identity differs from the approved pilot snapshot'
      );
    }
    calculatedDuration += episode.duration_seconds;
  }
  assertEqual(
    calculatedDuration,
    pilot.total_duration_seconds,
    'PLAYBOOK_PILOT_DURATION_INVALID',
    'PilotEpisodeSet.episodes'
  );
  return deepFreeze(pilot);
}

function matchesExpectedSource(source, expected) {
  return [
    'course_order',
    'bvid',
    'cid',
    'curriculum_title',
    'duration_seconds',
    'metadata_fingerprint_sha256',
    'pilot_role'
  ].every((field) => {
    if (field === 'course_order') return source.order === expected[field]
      || source[field] === expected[field];
    if (field === 'pilot_role') return source[field] === undefined
      || source[field] === expected[field];
    return source[field] === expected[field];
  });
}

function cloneDocument(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_DOCUMENT_UNCLONEABLE',
      'PilotEpisodeSet',
      error?.message || 'structured clone failed'
    );
  }
}

function assertExactObject(value, objectPath, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failPlaybookContract('PLAYBOOK_OBJECT_INVALID', objectPath, 'expected object');
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

function assertSha256(value, valuePath) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    failPlaybookContract(
      'PLAYBOOK_SHA256_INVALID',
      valuePath,
      'expected lowercase SHA-256'
    );
  }
}

function assertEqual(value, expected, code, valuePath) {
  if (value !== expected) {
    failPlaybookContract(code, valuePath, `${value} != ${expected}`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
