import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { failPlaybookContract } from '../contracts/playbookContractError.js';
import { getPilotEpisodeIdentity } from './pilotEpisodeSet.js';
import {
  assertPrivatePlaybookStorage,
  resolvePrivatePlaybookPath
} from '../storage/privatePlaybookPath.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const PRIVATE_TOOLCHAIN_PYTHON = 'python3.12';
const SELECTION_REASONS = [
  'topic-transition',
  'comparison',
  'construction-step',
  'counterexample',
  'conclusion'
];

export function buildTranscriptionCommand({ bvid, projectRoot }) {
  getPilotEpisodeIdentity(bvid);
  const root = path.resolve(projectRoot);
  return Object.freeze({
    command: PRIVATE_TOOLCHAIN_PYTHON,
    args: Object.freeze([
      path.join(root, 'scripts/architecture-playbook/transcribe_episode.py'),
      '--project-root', root,
      '--bvid', bvid,
      '--model', 'small',
      '--device', 'cpu',
      '--compute-type', 'int8',
      '--language', 'zh',
      '--beam-size', '5',
      '--word-timestamps', 'true'
    ]),
    env: Object.freeze({
      ...process.env,
      PYTHONPATH: path.join(root, '.local/architecture-playbook/tools/python')
    })
  });
}

export function buildFrameExtractionCommand({ bvid, projectRoot }) {
  getPilotEpisodeIdentity(bvid);
  const root = path.resolve(projectRoot);
  return Object.freeze({
    command: PRIVATE_TOOLCHAIN_PYTHON,
    args: Object.freeze([
      path.join(root, 'scripts/architecture-playbook/extract_event_frames.py'),
      '--project-root', root,
      '--bvid', bvid,
      '--event-candidates',
      path.join(
        root,
        `.local/architecture-playbook/evidence/${bvid}/event-candidates.json`
      )
    ]),
    env: Object.freeze({
      ...process.env,
      PYTHONPATH: path.join(root, '.local/architecture-playbook/tools/python')
    })
  });
}

export function validateEventCandidates(value, { episode, transcript }) {
  const approved = getPilotEpisodeIdentity(episode?.bvid);
  assertEpisodeIdentity(episode, approved);
  validateTranscriptIdentity(transcript, approved);
  const document = cloneDocument(value);
  assertExactObject(document, 'EventCandidates', [
    'schema_version',
    'bvid',
    'source_segment_index_sha256',
    'selection_method',
    'review_status',
    'candidates'
  ]);
  assertEqual(
    document.schema_version,
    1,
    'PLAYBOOK_EVENT_VERSION_INVALID',
    'EventCandidates.schema_version'
  );
  assertEqual(
    document.bvid,
    approved.bvid,
    'PLAYBOOK_EVENT_EPISODE_INVALID',
    'EventCandidates.bvid'
  );
  if (document.source_segment_index_sha256 !== transcript.segment_index_sha256) {
    failPlaybookContract(
      'PLAYBOOK_EVENT_TRANSCRIPT_DRIFT',
      'EventCandidates.source_segment_index_sha256',
      String(document.source_segment_index_sha256)
    );
  }
  if (document.selection_method !== 'transcript-teaching-events-v1') {
    failPlaybookContract(
      'PLAYBOOK_EVENT_SELECTION_METHOD_INVALID',
      'EventCandidates.selection_method',
      String(document.selection_method)
    );
  }
  if (document.review_status !== 'reviewed') {
    failPlaybookContract(
      'PLAYBOOK_EVENT_CANDIDATES_NOT_REVIEWED',
      'EventCandidates.review_status',
      String(document.review_status)
    );
  }
  if (
    !Array.isArray(document.candidates)
    || document.candidates.length === 0
    || document.candidates.length > 64
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVENT_CANDIDATES_INVALID',
      'EventCandidates.candidates',
      'expected 1..64 reviewed teaching events'
    );
  }
  const segmentById = new Map(
    transcript.segments.map((segment) => [segment.id, segment])
  );
  const candidateIds = new Set();
  for (const [index, candidate] of document.candidates.entries()) {
    validateCandidate(candidate, {
      index,
      bvid: approved.bvid,
      segmentById,
      candidateIds
    });
  }
  return deepFreeze(document);
}

export async function runTranscription({ bvid, projectRoot }) {
  const approved = getPilotEpisodeIdentity(bvid);
  const sourcePath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/sources/${bvid}/source-360p.mp4`,
    { projectRoot }
  );
  const outputPath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/transcripts/${bvid}/draft-transcript.json`,
    { projectRoot }
  );
  await assertPrivatePlaybookStorage(sourcePath, {
    projectRoot,
    createParent: false
  });
  await assertPrivatePlaybookStorage(outputPath, {
    projectRoot,
    createParent: true
  });
  const command = buildTranscriptionCommand({ bvid, projectRoot });
  await execute(command, projectRoot);
  const transcript = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  validateTranscriptIdentity(transcript, approved);
  return Object.freeze({
    status: 'created',
    bvid,
    segment_count: transcript.segment_count,
    duration_ms: transcript.duration_ms,
    segment_index_sha256: transcript.segment_index_sha256
  });
}

export async function runFrameExtraction({
  bvid,
  projectRoot,
  executeImpl = execute
}) {
  const approved = getPilotEpisodeIdentity(bvid);
  const transcriptPath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/transcripts/${bvid}/draft-transcript.json`,
    { projectRoot }
  );
  const candidatesPath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/evidence/${bvid}/event-candidates.json`,
    { projectRoot }
  );
  const frameIndexPath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/frames/${bvid}/event-frame-index.json`,
    { projectRoot }
  );
  const frameStorageProbe = resolvePrivatePlaybookPath(
    '.local/architecture-playbook/frames/.storage-probe',
    { projectRoot }
  );
  for (const target of [transcriptPath, candidatesPath]) {
    await assertPrivatePlaybookStorage(target, {
      projectRoot,
      createParent: false
    });
  }
  await assertPrivatePlaybookStorage(frameStorageProbe, {
    projectRoot,
    createParent: true
  });
  const transcript = JSON.parse(await fs.readFile(transcriptPath, 'utf8'));
  const candidates = JSON.parse(await fs.readFile(candidatesPath, 'utf8'));
  validateEventCandidates(candidates, { episode: approved, transcript });
  const command = buildFrameExtractionCommand({ bvid, projectRoot });
  await executeImpl(command, projectRoot);
  const frameIndex = JSON.parse(await fs.readFile(frameIndexPath, 'utf8'));
  return Object.freeze({
    status: 'created',
    bvid,
    frame_count: frameIndex.frame_count,
    frame_index_sha256: frameIndex.frame_index_sha256
  });
}

function validateCandidate(candidate, {
  index,
  bvid,
  segmentById,
  candidateIds
}) {
  const candidatePath = `EventCandidates.candidates[${index}]`;
  assertExactObject(candidate, candidatePath, [
    'candidate_id',
    'transcript_segment_ids',
    'start_ms',
    'end_ms',
    'target_ms',
    'event_label',
    'selection_reason',
    'review_status'
  ]);
  if (
    typeof candidate.candidate_id !== 'string'
    || !candidate.candidate_id.startsWith(`${bvid}:event:`)
    || candidateIds.has(candidate.candidate_id)
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVENT_ID_INVALID',
      `${candidatePath}.candidate_id`,
      String(candidate.candidate_id)
    );
  }
  candidateIds.add(candidate.candidate_id);
  if (
    !Array.isArray(candidate.transcript_segment_ids)
    || candidate.transcript_segment_ids.length === 0
    || candidate.transcript_segment_ids.length > 256
    || new Set(candidate.transcript_segment_ids).size
      !== candidate.transcript_segment_ids.length
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVENT_SEGMENTS_INVALID',
      `${candidatePath}.transcript_segment_ids`,
      'expected unique transcript segment ids'
    );
  }
  const segments = candidate.transcript_segment_ids.map((id) => {
    const segment = segmentById.get(id);
    if (!segment) {
      failPlaybookContract(
        'PLAYBOOK_EVENT_SEGMENT_UNKNOWN',
        `${candidatePath}.transcript_segment_ids`,
        String(id)
      );
    }
    return segment;
  });
  const expectedStart = Math.min(...segments.map((segment) => segment.start_ms));
  const expectedEnd = Math.max(...segments.map((segment) => segment.end_ms));
  if (
    candidate.start_ms !== expectedStart
    || candidate.end_ms !== expectedEnd
    || !Number.isSafeInteger(candidate.target_ms)
    || candidate.target_ms < candidate.start_ms
    || candidate.target_ms > candidate.end_ms
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVENT_RANGE_INVALID',
      candidatePath,
      'event range must equal its transcript lineage and contain target_ms'
    );
  }
  if (
    typeof candidate.event_label !== 'string'
    || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(candidate.event_label)
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVENT_LABEL_INVALID',
      `${candidatePath}.event_label`,
      String(candidate.event_label)
    );
  }
  if (!SELECTION_REASONS.includes(candidate.selection_reason)) {
    failPlaybookContract(
      'PLAYBOOK_EVENT_REASON_INVALID',
      `${candidatePath}.selection_reason`,
      String(candidate.selection_reason)
    );
  }
  if (candidate.review_status !== 'reviewed') {
    failPlaybookContract(
      'PLAYBOOK_EVENT_CANDIDATES_NOT_REVIEWED',
      `${candidatePath}.review_status`,
      String(candidate.review_status)
    );
  }
}

function validateTranscriptIdentity(transcript, episode) {
  if (
    !transcript
    || transcript.schema_version !== 1
    || transcript.bvid !== episode.bvid
    || transcript.segment_index_version !== 2
    || typeof transcript.segment_index_sha256 !== 'string'
    || !SHA256.test(transcript.segment_index_sha256)
    || !Array.isArray(transcript.segments)
    || transcript.segments.length === 0
  ) {
    failPlaybookContract(
      'PLAYBOOK_TRANSCRIPT_IDENTITY_INVALID',
      'transcript',
      'expected timestamped transcript for the pilot episode'
    );
  }
  const ids = new Set();
  let previousEnd = 0;
  for (const [index, segment] of transcript.segments.entries()) {
    if (
      !Number.isSafeInteger(segment?.id)
      || ids.has(segment.id)
      || !Number.isSafeInteger(segment.start_ms)
      || !Number.isSafeInteger(segment.end_ms)
      || segment.start_ms < 0
      || segment.end_ms <= segment.start_ms
      || segment.start_ms < previousEnd - 2000
    ) {
      failPlaybookContract(
        'PLAYBOOK_TRANSCRIPT_SEGMENT_INVALID',
        `transcript.segments[${index}]`,
        'invalid id or timestamp order'
      );
    }
    ids.add(segment.id);
    previousEnd = Math.max(previousEnd, segment.end_ms);
  }
}

function assertEpisodeIdentity(value, expected) {
  for (const field of [
    'bvid',
    'cid',
    'duration_seconds',
    'metadata_fingerprint_sha256'
  ]) {
    if (value?.[field] !== expected[field]) {
      failPlaybookContract(
        'PLAYBOOK_EVENT_EPISODE_INVALID',
        `episode.${field}`,
        `${value?.[field]} != ${expected[field]}`
      );
    }
  }
}

function execute(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd,
      env: command.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(
        `local evidence processor failed: code=${code} signal=${signal}`
      ));
    });
  });
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

function assertEqual(value, expected, code, valuePath) {
  if (value !== expected) {
    failPlaybookContract(code, valuePath, `${value} != ${expected}`);
  }
}

function cloneDocument(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_DOCUMENT_UNCLONEABLE',
      'EventCandidates',
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
