import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildPilotEpisodeSet,
  validatePilotEpisodeSet
} from '../src/playbook/course/pilotEpisodeSet.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const COURSE_MANIFEST_PATH = path.join(
  ROOT,
  'docs/architecture-playbook/course/course-manifest.json'
);
const PILOT_SET_PATH = path.join(
  ROOT,
  'docs/architecture-playbook/course/pilot-episodes.json'
);
const EXPECTED_BVIDS = [
  'BV1fNkgYBEyy',
  'BV1HhEuzZEyZ',
  'BV1WhkbYeE5k',
  'BV1HTCaY6EDt',
  'BV1WsZcYZEMQ',
  'BV1jbdUYCEjG'
];

test('pilot set selects the approved six episodes in curriculum order', () => {
  const pilot = buildPilotEpisodeSet(readJson(COURSE_MANIFEST_PATH), {
    createdAt: '2026-08-25T12:00:00.000Z'
  });

  assert.deepEqual(
    pilot.episodes.map((episode) => episode.bvid),
    EXPECTED_BVIDS
  );
  assert.deepEqual(
    pilot.episodes.map((episode) => episode.course_order),
    [8, 9, 13, 16, 44, 45]
  );
  assert.deepEqual(
    pilot.episodes.map((episode) => episode.pilot_role),
    [
      'structure-foundations',
      'structure-hierarchy',
      'roof-foundations',
      'facade-foundations',
      'medieval-house-structure',
      'medieval-house-case'
    ]
  );
  assert.equal(pilot.total_duration_seconds, 7381);
  assert.ok(Object.isFrozen(pilot));
  assert.ok(Object.isFrozen(pilot.episodes[0]));
});

test('pilot set rejects source fingerprint drift from the approved snapshot', () => {
  const manifest = readJson(COURSE_MANIFEST_PATH);
  const source = manifest.episodes.find(
    (episode) => episode.bvid === 'BV1fNkgYBEyy'
  );
  source.metadata_fingerprint_sha256 = '0'.repeat(64);

  assert.throws(
    () => buildPilotEpisodeSet(manifest, {
      createdAt: '2026-08-25T12:00:00.000Z'
    }),
    /PLAYBOOK_PILOT_SOURCE_DRIFT/u
  );
});

test('pilot set validator rejects reordered or cross-school documents', () => {
  const reordered = readJson(PILOT_SET_PATH);
  [reordered.episodes[0], reordered.episodes[1]] = [
    reordered.episodes[1],
    reordered.episodes[0]
  ];
  assert.throws(
    () => validatePilotEpisodeSet(reordered),
    /PLAYBOOK_PILOT_ORDER_INVALID/u
  );

  const crossSchool = readJson(PILOT_SET_PATH);
  crossSchool.school_id = 'mixed-school';
  assert.throws(
    () => validatePilotEpisodeSet(crossSchool),
    /PLAYBOOK_PILOT_SCHOOL_INVALID/u
  );
});

test('checked-in pilot set is the deterministic build product', () => {
  const checkedIn = readJson(PILOT_SET_PATH);
  const rebuilt = buildPilotEpisodeSet(readJson(COURSE_MANIFEST_PATH), {
    createdAt: checkedIn.created_at
  });

  assert.deepEqual(checkedIn, rebuilt);
  assert.deepEqual(
    validatePilotEpisodeSet(checkedIn).episodes.map((episode) => episode.bvid),
    EXPECTED_BVIDS
  );
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
