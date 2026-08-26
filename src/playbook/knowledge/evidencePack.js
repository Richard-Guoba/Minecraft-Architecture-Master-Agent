import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateEvidenceNote } from '../contracts/evidenceNote.js';
import { failPlaybookContract } from '../contracts/playbookContractError.js';
import {
  getPilotEpisodeIdentity,
  validatePilotEpisodeSet
} from '../course/pilotEpisodeSet.js';
import {
  assertPrivatePlaybookStorage,
  resolvePrivatePlaybookPath
} from '../storage/privatePlaybookPath.js';

const SHA256 = /^[a-f0-9]{64}$/u;

export function buildEvidencePack({
  episode,
  pilotEpisodeSet,
  mediaIndex,
  transcript,
  frameIndex,
  terminologyReview,
  notes
}) {
  const pilot = validatePilotEpisodeSet(pilotEpisodeSet);
  const approved = getPilotEpisodeIdentity(episode?.bvid);
  assertEpisodeIdentity(episode, approved);
  validateMediaIndex(mediaIndex, approved);
  validateTranscript(transcript, approved, mediaIndex);
  validateFrameIndex(frameIndex, approved, transcript);
  validateTerminologyReview(terminologyReview, approved, transcript);
  if (!Array.isArray(notes) || notes.length === 0 || notes.length > 512) {
    failPlaybookContract(
      'PLAYBOOK_PACK_NOTES_INVALID',
      'notes',
      'expected 1..512 EvidenceNotes'
    );
  }
  const validatedNotes = [];
  const evidenceIds = new Set();
  for (const note of notes) {
    const validated = validateEvidenceNote(note, { pilotEpisodeSet: pilot });
    if (evidenceIds.has(validated.evidence_id)) {
      failPlaybookContract(
        'PLAYBOOK_PACK_EVIDENCE_ID_DUPLICATE',
        'notes',
        validated.evidence_id
      );
    }
    evidenceIds.add(validated.evidence_id);
    validateNoteLineage(validated, transcript, frameIndex);
    validatedNotes.push(validated);
  }
  const blockingReasonCodes = candidateBlockingReasons(validatedNotes);
  const inputs = {
    metadata_fingerprint_sha256: approved.metadata_fingerprint_sha256,
    source_media_sha256: mediaIndex.sha256,
    transcript_segment_index_sha256: transcript.segment_index_sha256,
    frame_index_sha256: frameIndex.frame_index_sha256,
    terminology_review_sha256: terminologyReview.review_sha256
  };
  const processor = {
    name: 'evidence-pack-builder',
    version: 1,
    school_policy: 'single-primary-school',
    transcript_policy: 'draft-asr-with-explicit-unknowns',
    rule_policy: 'p2-candidates-only'
  };
  const packWithoutHash = {
    schema_version: 1,
    bvid: approved.bvid,
    school_id: 'heihui-jileniao',
    inputs,
    processor,
    deterministic_rebuild: true,
    note_count: validatedNotes.length,
    coverage_layers: [...new Set(
      validatedNotes.flatMap((note) => note.design_layers)
    )].sort(),
    accepted_for_public_candidates: blockingReasonCodes.length === 0,
    blocking_reason_codes: blockingReasonCodes,
    notes: validatedNotes
  };
  return deepFreeze({
    ...packWithoutHash,
    index_sha256: hashStable(packWithoutHash)
  });
}

export function summarizeEvidencePack(pack) {
  if (!pack || !validHash(pack.index_sha256) || !pack.inputs) {
    failPlaybookContract(
      'PLAYBOOK_PACK_SUMMARY_INVALID',
      'EvidencePack',
      'validated pack required'
    );
  }
  return deepFreeze({
    schema_version: 1,
    bvid: pack.bvid,
    school_id: pack.school_id,
    inputs: structuredClone(pack.inputs),
    note_count: pack.note_count,
    coverage_layers: structuredClone(pack.coverage_layers),
    accepted_for_public_candidates: pack.accepted_for_public_candidates,
    blocking_reason_codes: structuredClone(pack.blocking_reason_codes),
    index_sha256: pack.index_sha256
  });
}

export async function compileLocalEvidencePack({ bvid, projectRoot }) {
  const approved = getPilotEpisodeIdentity(bvid);
  const root = path.resolve(projectRoot);
  const pilotPath = path.join(
    root,
    'docs/architecture-playbook/course/pilot-episodes.json'
  );
  const relativePaths = {
    mediaIndex: `sources/${bvid}/media-index.json`,
    transcript: `transcripts/${bvid}/draft-transcript.json`,
    frameIndex: `frames/${bvid}/event-frame-index.json`,
    terminologyReview: `evidence/${bvid}/terminology-review.json`,
    notes: `evidence/${bvid}/evidence-notes.json`
  };
  const inputs = {};
  for (const [name, relative] of Object.entries(relativePaths)) {
    const inputPath = resolvePrivatePlaybookPath(
      `.local/architecture-playbook/${relative}`,
      { projectRoot: root }
    );
    await assertPrivatePlaybookStorage(inputPath, {
      projectRoot: root,
      createParent: false
    });
    inputs[name] = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  }
  const pilotEpisodeSet = JSON.parse(await fs.readFile(pilotPath, 'utf8'));
  const pack = buildEvidencePack({
    episode: approved,
    pilotEpisodeSet,
    ...inputs
  });
  const outputPath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/evidence/${bvid}/evidence-index.json`,
    { projectRoot: root }
  );
  await assertPrivatePlaybookStorage(outputPath, {
    projectRoot: root,
    createParent: false
  });
  const output = `${JSON.stringify(pack, null, 2)}\n`;
  const status = await writeAtomicPack(outputPath, output);
  return Object.freeze({
    status,
    summary: summarizeEvidencePack(pack)
  });
}

function validateMediaIndex(media, episode) {
  if (
    !media
    || media.schema_version !== 1
    || media.bvid !== episode.bvid
    || media.cid !== episode.cid
    || media.source_metadata_fingerprint_sha256
      !== episode.metadata_fingerprint_sha256
    || media.quality !== 16
    || media.format !== 'mp4'
    || !validHash(media.sha256)
    || !Number.isSafeInteger(media.byte_size)
    || media.byte_size < 1
    || !Number.isSafeInteger(media.duration_ms)
    || Math.abs(media.duration_ms - episode.duration_seconds * 1000) > 3000
  ) {
    failPlaybookContract(
      'PLAYBOOK_PACK_MEDIA_INVALID',
      'mediaIndex',
      'media index does not match the pilot episode'
    );
  }
}

function validateTranscript(transcript, episode, media) {
  if (
    !transcript
    || transcript.schema_version !== 1
    || transcript.bvid !== episode.bvid
    || transcript.processor?.name !== 'faster-whisper'
    || transcript.processor?.model !== 'small'
    || transcript.processor?.language !== 'zh'
    || transcript.processor?.word_timestamps !== true
    || transcript.segment_index_version !== 2
    || !Array.isArray(transcript.segments)
    || transcript.segments.length === 0
    || transcript.segment_count !== transcript.segments.length
    || !validHash(transcript.segment_index_sha256)
  ) {
    failPlaybookContract(
      'PLAYBOOK_PACK_TRANSCRIPT_INVALID',
      'transcript',
      'expected the pinned timestamped Chinese ASR artifact'
    );
  }
  if (transcript.source_sha256 !== media.sha256) {
    failPlaybookContract(
      'PLAYBOOK_PACK_TRANSCRIPT_MEDIA_DRIFT',
      'transcript.source_sha256',
      `${transcript.source_sha256} != ${media.sha256}`
    );
  }
  const calculatedHash = hashStable(transcriptLineage(transcript.segments));
  if (calculatedHash !== transcript.segment_index_sha256) {
    failPlaybookContract(
      'PLAYBOOK_PACK_TRANSCRIPT_INDEX_DRIFT',
      'transcript.segment_index_sha256',
      `${transcript.segment_index_sha256} != ${calculatedHash}`
    );
  }
}

function transcriptLineage(segments) {
  return segments.map((segment) => ({
    id: segment.id,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    text: segment.text,
    words: (segment.words || []).map((word) => ({
      start_ms: word.start_ms,
      end_ms: word.end_ms,
      text: word.text
    }))
  }));
}

function validateFrameIndex(frames, episode, transcript) {
  if (
    !frames
    || frames.schema_version !== 1
    || frames.bvid !== episode.bvid
    || frames.source_segment_index_sha256 !== transcript.segment_index_sha256
    || frames.selection_method !== 'transcript-teaching-events-v1'
    || frames.event_selected !== true
    || !Array.isArray(frames.frames)
    || frames.frames.length === 0
    || frames.frame_count !== frames.frames.length
    || !validHash(frames.frame_index_sha256)
    || hashStable(frames.frames) !== frames.frame_index_sha256
  ) {
    failPlaybookContract(
      'PLAYBOOK_PACK_FRAME_INDEX_INVALID',
      'frameIndex',
      'event frame index does not match the transcript'
    );
  }
}

function validateTerminologyReview(review, episode, transcript) {
  if (
    !review
    || review.schema_version !== 1
    || review.bvid !== episode.bvid
    || review.source_segment_index_sha256 !== transcript.segment_index_sha256
    || !Array.isArray(review.checks)
    || !Number.isSafeInteger(review.resolved_count)
    || !Number.isSafeInteger(review.unresolved_count)
    || review.resolved_count < 0
    || review.unresolved_count < 0
    || review.resolved_count + review.unresolved_count !== review.checks.length
    || !validHash(review.review_sha256)
    || hashStable(review.checks) !== review.review_sha256
  ) {
    failPlaybookContract(
      'PLAYBOOK_PACK_TERMINOLOGY_INVALID',
      'terminologyReview',
      'terminology review does not match the transcript'
    );
  }
}

function validateNoteLineage(note, transcript, frameIndex) {
  const segmentById = new Map(
    transcript.segments.map((segment) => [segment.id, segment])
  );
  for (const language of note.language_evidence) {
    for (const id of language.transcript_segment_ids) {
      const segment = segmentById.get(id);
      if (
        !segment
        || segment.start_ms < language.start_ms
        || segment.end_ms > language.end_ms
      ) {
        failPlaybookContract(
          'PLAYBOOK_PACK_LANGUAGE_LINEAGE_INVALID',
          `${note.evidence_id}.language_evidence`,
          String(id)
        );
      }
    }
  }
  const frameById = new Map(
    frameIndex.frames.map((frame) => [frame.frame_id, frame])
  );
  for (const visual of note.visual_evidence) {
    if (visual.frame_index_sha256 !== frameIndex.frame_index_sha256) {
      failPlaybookContract(
        'PLAYBOOK_PACK_FRAME_INDEX_DRIFT',
        `${note.evidence_id}.visual_evidence`,
        visual.frame_index_sha256
      );
    }
    const frame = frameById.get(visual.frame_id);
    if (!frame || frame.actual_ms !== visual.actual_ms) {
      failPlaybookContract(
        'PLAYBOOK_PACK_FRAME_REFERENCE_INVALID',
        `${note.evidence_id}.visual_evidence`,
        visual.frame_id
      );
    }
    if (frame.visual_review_status !== 'visually-reviewed') {
      failPlaybookContract(
        'PLAYBOOK_PACK_FRAME_NOT_REVIEWED',
        `${note.evidence_id}.visual_evidence`,
        visual.frame_id
      );
    }
  }
}

function candidateBlockingReasons(notes) {
  const reasons = new Set();
  for (const note of notes) {
    if (note.rule_candidate_ids.length === 0) continue;
    if (
      note.unresolved_terms.length > 0
      || ['unresolved', 'needs-owner-review'].includes(note.review_status)
    ) {
      reasons.add('UNRESOLVED_NOTE_HAS_RULE_CANDIDATE');
    }
    if (note.confidence === 'unknown') {
      reasons.add('UNKNOWN_CONFIDENCE_HAS_RULE_CANDIDATE');
    }
    if (note.language_evidence.some(
      (reference) => reference.review_status === 'unresolved'
    )) {
      reasons.add('UNRESOLVED_LANGUAGE_HAS_RULE_CANDIDATE');
    }
  }
  return [...reasons].sort();
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
        'PLAYBOOK_PACK_EPISODE_INVALID',
        `episode.${field}`,
        `${value?.[field]} != ${expected[field]}`
      );
    }
  }
}

function hashStable(value) {
  return createHash('sha256')
    .update(JSON.stringify(sortValue(value)))
    .digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortValue(value[key])])
    );
  }
  return value;
}

function validHash(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function writeAtomicPack(target, output) {
  let existing = null;
  try {
    existing = await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (existing === output) return 'unchanged';
  if (existing !== null) {
    failPlaybookContract(
      'PLAYBOOK_PACK_CONFLICT',
      target,
      'target contains different evidence; preserve it before rebuilding'
    );
  }
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, output, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return 'created';
}
