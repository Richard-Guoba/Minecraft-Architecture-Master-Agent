import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';

import { failPlaybookContract } from '../contracts/playbookContractError.js';
import {
  assertPrivatePlaybookStorage,
  resolvePrivatePlaybookPath
} from '../storage/privatePlaybookPath.js';
import { buildEvidencePack } from '../knowledge/evidencePack.js';
import {
  advanceEpisodeStage,
  readChapterLedger
} from './chapterLedger.js';
import { validateChapterEpisodeIdentity } from './chapterPlan.js';
import { validateEventCandidates } from './localEvidenceProcessor.js';

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const SHA256 = /^[a-f0-9]{64}$/u;

export async function verifyAndAdvanceEpisode({
  projectRoot,
  episode,
  expectedCurrentStage
}) {
  const approved = validateChapterEpisodeIdentity(episode);
  const adapter = {
    pending: verifyMediaArtifact,
    'media-verified': verifyTranscriptArtifact,
    'asr-complete': verifyEventArtifact,
    'events-indexed': verifyVisualArtifact,
    'visual-reviewed': verifyEvidencePackArtifact
  }[expectedCurrentStage];
  if (!adapter) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_ARTIFACT_STAGE_UNSUPPORTED',
      'expectedCurrentStage',
      String(expectedCurrentStage)
    );
  }
  const verified = await adapter({ projectRoot, episode: approved });
  const current = await readChapterLedger({ projectRoot });
  const ledgerEpisode = current.ledger.episodes[approved.bvid];
  if (ledgerEpisode?.stage !== expectedCurrentStage) {
    failPlaybookContract(
      'PLAYBOOK_CHAPTER_STAGE_INVALID',
      'expectedCurrentStage',
      'ledger stage changed before artifact publication'
    );
  }
  for (const [field, value] of Object.entries(verified.priorEvidence || {})) {
    if (ledgerEpisode.evidence[field] !== value) artifactInvalid();
  }
  return advanceEpisodeStage({
    projectRoot,
    bvid: approved.bvid,
    expectedLedgerSha256: current.ledger_sha256,
    expectedStage: expectedCurrentStage,
    nextStage: verified.nextStage,
    evidence: verified.evidence
  });
}

async function verifyMediaArtifact({ projectRoot, episode }) {
  const sourcePath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/sources/${episode.bvid}/source-360p.mp4`,
    { projectRoot }
  );
  const indexPath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/sources/${episode.bvid}/media-index.json`,
    { projectRoot }
  );
  try {
    for (const target of [sourcePath, indexPath]) {
      await assertPrivatePlaybookStorage(target, {
        projectRoot,
        createParent: false
      });
    }
    const index = JSON.parse((await readBoundFile(indexPath)).toString('utf8'));
    assertExactFields(index, [
      'schema_version',
      'bvid',
      'cid',
      'source_metadata_fingerprint_sha256',
      'observed_at',
      'quality',
      'format',
      'declared_duration_ms',
      'duration_ms',
      'declared_size',
      'byte_size',
      'sha256'
    ]);
    if (
      index.schema_version !== 1
      || index.bvid !== episode.bvid
      || index.cid !== episode.cid
      || index.source_metadata_fingerprint_sha256
        !== episode.metadata_fingerprint_sha256
      || index.quality !== 16
      || index.format !== 'mp4'
      || !Number.isSafeInteger(index.duration_ms)
      || Math.abs(index.duration_ms - episode.duration_seconds * 1000) > 3000
      || !Number.isSafeInteger(index.declared_duration_ms)
      || index.declared_duration_ms !== index.duration_ms
      || !Number.isSafeInteger(index.byte_size)
      || index.byte_size < 1
      || index.declared_size !== index.byte_size
      || !SHA256.test(index.sha256 || '')
    ) artifactInvalid();
    const actual = await hashBoundFile(sourcePath);
    if (
      actual.sha256 !== index.sha256
      || actual.byteSize !== index.byte_size
    ) artifactInvalid();
    return Object.freeze({
      nextStage: 'media-verified',
      evidence: Object.freeze({
        media_sha256: actual.sha256,
        byte_size: actual.byteSize
      })
    });
  } catch (error) {
    if (error?.code?.startsWith?.('PLAYBOOK_')) throw error;
    artifactInvalid();
  }
}

async function verifyTranscriptArtifact({ projectRoot, episode }) {
  const transcriptPath = privatePath(
    projectRoot,
    `transcripts/${episode.bvid}/draft-transcript.json`
  );
  try {
    await assertPrivatePlaybookStorage(transcriptPath, {
      projectRoot,
      createParent: false
    });
    const transcript = JSON.parse(
      (await readBoundFile(transcriptPath)).toString('utf8')
    );
    validateTranscript(transcript, episode);
    return Object.freeze({
      nextStage: 'asr-complete',
      priorEvidence: Object.freeze({ media_sha256: transcript.source_sha256 }),
      evidence: Object.freeze({
        segment_index_sha256: transcript.segment_index_sha256,
        segment_count: transcript.segment_count
      })
    });
  } catch (error) {
    if (error?.code?.startsWith?.('PLAYBOOK_')) throw error;
    artifactInvalid();
  }
}

async function verifyEventArtifact({ projectRoot, episode }) {
  const transcript = await readValidatedTranscript({ projectRoot, episode });
  const eventPath = privatePath(
    projectRoot,
    `evidence/${episode.bvid}/event-candidates.json`
  );
  try {
    await assertPrivatePlaybookStorage(eventPath, {
      projectRoot,
      createParent: false
    });
    const bytes = await readBoundFile(eventPath);
    const events = JSON.parse(bytes.toString('utf8'));
    const validated = validateEventCandidates(events, { episode, transcript });
    return Object.freeze({
      nextStage: 'events-indexed',
      priorEvidence: Object.freeze({
        segment_index_sha256: transcript.segment_index_sha256
      }),
      evidence: Object.freeze({
        event_index_sha256: sha256(bytes),
        event_count: validated.candidates.length
      })
    });
  } catch (error) {
    if (error?.code?.startsWith?.('PLAYBOOK_')) throw error;
    artifactInvalid();
  }
}

async function verifyVisualArtifact({ projectRoot, episode }) {
  const transcript = await readValidatedTranscript({ projectRoot, episode });
  const eventPath = privatePath(
    projectRoot,
    `evidence/${episode.bvid}/event-candidates.json`
  );
  const indexPath = privatePath(
    projectRoot,
    `frames/${episode.bvid}/event-frame-index.json`
  );
  try {
    for (const target of [eventPath, indexPath]) {
      await assertPrivatePlaybookStorage(target, {
        projectRoot,
        createParent: false
      });
    }
    const eventBytes = await readBoundFile(eventPath);
    const events = validateEventCandidates(
      JSON.parse(eventBytes.toString('utf8')),
      { episode, transcript }
    );
    const indexBytes = await readBoundFile(indexPath);
    const frameIndex = JSON.parse(indexBytes.toString('utf8'));
    validateFrameIndex(frameIndex, { episode, transcript, events });
    for (const frame of frameIndex.frames) {
      const framePath = privatePath(
        projectRoot,
        `frames/${episode.bvid}/${frame.filename}`
      );
      await assertPrivatePlaybookStorage(framePath, {
        projectRoot,
        createParent: false
      });
      const actual = await hashBoundFile(framePath);
      if (actual.sha256 !== frame.sha256 || actual.byteSize < 1) artifactInvalid();
    }
    return Object.freeze({
      nextStage: 'visual-reviewed',
      priorEvidence: Object.freeze({
        segment_index_sha256: transcript.segment_index_sha256,
        event_index_sha256: sha256(eventBytes)
      }),
      evidence: Object.freeze({
        visual_review_sha256: sha256(indexBytes),
        reviewed_frame_count: frameIndex.frames.length
      })
    });
  } catch (error) {
    if (error?.code?.startsWith?.('PLAYBOOK_')) throw error;
    artifactInvalid();
  }
}

async function verifyEvidencePackArtifact({ projectRoot, episode }) {
  const visual = await verifyVisualArtifact({ projectRoot, episode });
  try {
    const mediaIndex = await readPrivateJson(
      projectRoot,
      `sources/${episode.bvid}/media-index.json`
    );
    const transcript = await readPrivateJson(
      projectRoot,
      `transcripts/${episode.bvid}/draft-transcript.json`
    );
    const frameIndex = await readPrivateJson(
      projectRoot,
      `frames/${episode.bvid}/event-frame-index.json`
    );
    const terminologyReview = await readPrivateJson(
      projectRoot,
      `evidence/${episode.bvid}/terminology-review.json`
    );
    const notes = await readPrivateJson(
      projectRoot,
      `evidence/${episode.bvid}/evidence-notes.json`
    );
    const packPath = privatePath(
      projectRoot,
      `evidence/${episode.bvid}/evidence-index.json`
    );
    await assertPrivatePlaybookStorage(packPath, {
      projectRoot,
      createParent: false
    });
    const packBytes = await readBoundFile(packPath);
    const rebuilt = buildEvidencePack({
      episode,
      approvedEpisodes: [episode],
      mediaIndex,
      transcript,
      frameIndex,
      terminologyReview,
      notes
    });
    const expectedBytes = Buffer.from(`${JSON.stringify(rebuilt, null, 2)}\n`);
    if (!packBytes.equals(expectedBytes)) artifactInvalid();
    return Object.freeze({
      nextStage: 'evidence-packed',
      priorEvidence: Object.freeze({
        visual_review_sha256: visual.evidence.visual_review_sha256
      }),
      evidence: Object.freeze({
        evidence_pack_sha256: rebuilt.index_sha256,
        evidence_count: rebuilt.note_count
      })
    });
  } catch (error) {
    if (error?.code?.startsWith?.('PLAYBOOK_')) throw error;
    artifactInvalid();
  }
}

async function readPrivateJson(projectRoot, relativePath) {
  const target = privatePath(projectRoot, relativePath);
  await assertPrivatePlaybookStorage(target, {
    projectRoot,
    createParent: false
  });
  return JSON.parse((await readBoundFile(target)).toString('utf8'));
}

async function readValidatedTranscript({ projectRoot, episode }) {
  const target = privatePath(
    projectRoot,
    `transcripts/${episode.bvid}/draft-transcript.json`
  );
  try {
    await assertPrivatePlaybookStorage(target, {
      projectRoot,
      createParent: false
    });
    const transcript = JSON.parse((await readBoundFile(target)).toString('utf8'));
    validateTranscript(transcript, episode);
    return transcript;
  } catch (error) {
    if (error?.code?.startsWith?.('PLAYBOOK_')) throw error;
    artifactInvalid();
  }
}

function validateTranscript(transcript, episode) {
  assertExactFields(transcript, [
    'schema_version',
    'bvid',
    'source_sha256',
    'processor',
    'detected_language',
    'language_probability',
    'duration_ms',
    'duration_after_vad_ms',
    'segment_count',
    'segment_index_version',
    'segment_index_sha256',
    'segments'
  ]);
  if (
    transcript.schema_version !== 1
    || transcript.bvid !== episode.bvid
    || !SHA256.test(transcript.source_sha256 || '')
    || transcript.processor?.name !== 'faster-whisper'
    || transcript.processor?.model !== 'small'
    || transcript.processor?.device !== 'cpu'
    || transcript.processor?.compute_type !== 'int8'
    || transcript.processor?.language !== 'zh'
    || transcript.processor?.beam_size !== 5
    || transcript.processor?.word_timestamps !== true
    || transcript.processor?.vad_filter !== true
    || transcript.processor?.condition_on_previous_text !== true
    || transcript.segment_index_version !== 2
    || !Array.isArray(transcript.segments)
    || transcript.segments.length === 0
    || transcript.segment_count !== transcript.segments.length
    || !Number.isSafeInteger(transcript.duration_ms)
    || Math.abs(transcript.duration_ms - episode.duration_seconds * 1000) > 3000
  ) artifactInvalid();
  let previousEnd = 0;
  const ids = new Set();
  for (const segment of transcript.segments) {
    if (
      !Number.isSafeInteger(segment?.id)
      || ids.has(segment.id)
      || !Number.isSafeInteger(segment.start_ms)
      || !Number.isSafeInteger(segment.end_ms)
      || segment.start_ms < 0
      || segment.end_ms <= segment.start_ms
      || segment.start_ms < previousEnd - 2000
      || typeof segment.text !== 'string'
      || !Array.isArray(segment.words)
    ) artifactInvalid();
    ids.add(segment.id);
    previousEnd = Math.max(previousEnd, segment.end_ms);
  }
  const lineage = transcript.segments.map((segment) => ({
    id: segment.id,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    text: segment.text,
    words: segment.words.map((word) => ({
      start_ms: word.start_ms,
      end_ms: word.end_ms,
      text: word.text
    }))
  }));
  if (hashStable(lineage) !== transcript.segment_index_sha256) artifactInvalid();
}

function validateFrameIndex(frameIndex, { episode, transcript, events }) {
  assertExactFields(frameIndex, [
    'schema_version',
    'bvid',
    'source_segment_index_sha256',
    'selection_method',
    'event_selected',
    'frame_count',
    'frame_index_sha256',
    'frames'
  ]);
  if (
    frameIndex.schema_version !== 1
    || frameIndex.bvid !== episode.bvid
    || frameIndex.source_segment_index_sha256 !== transcript.segment_index_sha256
    || frameIndex.selection_method !== 'transcript-teaching-events-v1'
    || frameIndex.event_selected !== true
    || !Array.isArray(frameIndex.frames)
    || frameIndex.frames.length === 0
    || frameIndex.frame_count !== frameIndex.frames.length
    || hashStable(frameIndex.frames) !== frameIndex.frame_index_sha256
  ) artifactInvalid();
  const eventById = new Map(events.candidates.map((event) => [
    event.candidate_id, event
  ]));
  const filenames = new Set();
  for (const frame of frameIndex.frames) {
    assertExactFields(frame, [
      'frame_id',
      'transcript_segment_ids',
      'target_ms',
      'actual_ms',
      'event_label',
      'selection_reason',
      'filename',
      'sha256',
      'width',
      'height',
      'visual_review_status'
    ]);
    const event = eventById.get(frame.frame_id);
    if (
      !event
      || JSON.stringify(frame.transcript_segment_ids)
        !== JSON.stringify(event.transcript_segment_ids)
      || frame.target_ms !== event.target_ms
      || frame.event_label !== event.event_label
      || frame.selection_reason !== event.selection_reason
      || !Number.isSafeInteger(frame.actual_ms)
      || !/^[0-9]{2}-[0-9]{9}-[a-z0-9][a-z0-9-]{0,127}\.jpg$/u.test(frame.filename)
      || filenames.has(frame.filename)
      || !SHA256.test(frame.sha256 || '')
      || !Number.isSafeInteger(frame.width)
      || frame.width < 1
      || !Number.isSafeInteger(frame.height)
      || frame.height < 1
      || frame.visual_review_status !== 'visually-reviewed'
    ) artifactInvalid();
    filenames.add(frame.filename);
  }
}

async function readBoundFile(target) {
  const before = await regularIdentity(target);
  let handle;
  try {
    handle = await fs.open(target, READ_FLAGS);
    const opened = await handle.stat();
    if (!sameIdentity(before, opened) || !opened.isFile()) artifactInvalid();
    const bytes = await handle.readFile();
    const after = await regularIdentity(target);
    if (!sameIdentity(opened, after)) artifactInvalid();
    return bytes;
  } finally {
    await handle?.close();
  }
}

async function hashBoundFile(target) {
  const before = await regularIdentity(target);
  let handle;
  const hash = createHash('sha256');
  let byteSize = 0;
  try {
    handle = await fs.open(target, READ_FLAGS);
    const opened = await handle.stat();
    if (!sameIdentity(before, opened) || !opened.isFile()) artifactInvalid();
    for await (const chunk of handle.createReadStream()) {
      hash.update(chunk);
      byteSize += chunk.length;
    }
    const after = await regularIdentity(target);
    if (!sameIdentity(opened, after)) artifactInvalid();
  } finally {
    await handle?.close();
  }
  return { sha256: hash.digest('hex'), byteSize };
}

async function regularIdentity(target) {
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) artifactInvalid();
  return stat;
}

function assertExactFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) artifactInvalid();
  const names = Object.keys(value);
  if (
    names.length !== fields.length
    || names.some((field) => !fields.includes(field))
  ) artifactInvalid();
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function privatePath(projectRoot, relativePath) {
  return resolvePrivatePlaybookPath(
    `.local/architecture-playbook/${relativePath}`,
    { projectRoot }
  );
}

function hashStable(value) {
  return sha256(JSON.stringify(sortValue(value)));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key, sortValue(value[key])
    ]));
  }
  return value;
}

function artifactInvalid() {
  failPlaybookContract(
    'PLAYBOOK_CHAPTER_ARTIFACT_INVALID',
    'artifact',
    'canonical episode artifact failed verification'
  );
}
