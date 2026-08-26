import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildFrameExtractionCommand,
  buildTranscriptionCommand,
  runFrameExtraction,
  validateEventCandidates
} from '../src/playbook/course/localEvidenceProcessor.js';
import { getPilotEpisodeIdentity } from '../src/playbook/course/pilotEpisodeSet.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const EPISODE = getPilotEpisodeIdentity('BV1fNkgYBEyy');
const TRANSCRIPT_HASH = 'a'.repeat(64);

test('transcription command pins the proven CPython ABI and processor configuration', () => {
  const command = buildTranscriptionCommand({
    bvid: EPISODE.bvid,
    projectRoot: ROOT
  });

  assert.equal(command.command, 'python3.12');
  assert.deepEqual(command.args.slice(-12), [
    '--model', 'small',
    '--device', 'cpu',
    '--compute-type', 'int8',
    '--language', 'zh',
    '--beam-size', '5',
    '--word-timestamps', 'true'
  ]);
  assert.equal(
    command.env.PYTHONPATH,
    path.join(ROOT, '.local/architecture-playbook/tools/python')
  );
  assert.match(command.args[0], /scripts\/architecture-playbook\/transcribe_episode\.py$/u);
});

test('frame command consumes reviewed teaching events rather than intervals', () => {
  const command = buildFrameExtractionCommand({
    bvid: EPISODE.bvid,
    projectRoot: ROOT
  });

  assert.equal(command.command, 'python3.12');
  assert.match(command.args.join(' '), /event-candidates\.json/u);
  assert.match(command.args.join(' '), /extract_event_frames\.py/u);
  assert.doesNotMatch(command.args.join(' '), /interval/u);
});

test('event candidates trace reviewed teaching events to transcript segments', () => {
  const result = validateEventCandidates(
    validEventCandidates(),
    { episode: EPISODE, transcript: transcriptFixture() }
  );

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].selection_reason, 'topic-transition');
  assert.ok(Object.isFrozen(result.candidates[0]));
});

test('event candidates reject fixed intervals and unreviewed selections', () => {
  const fixed = validEventCandidates();
  fixed.selection_method = 'fixed-interval-v1';
  assert.throws(
    () => validateEventCandidates(
      fixed,
      { episode: EPISODE, transcript: transcriptFixture() }
    ),
    /PLAYBOOK_EVENT_SELECTION_METHOD_INVALID/u
  );

  const unreviewed = validEventCandidates();
  unreviewed.candidates[0].review_status = 'pending';
  assert.throws(
    () => validateEventCandidates(
      unreviewed,
      { episode: EPISODE, transcript: transcriptFixture() }
    ),
    /PLAYBOOK_EVENT_CANDIDATES_NOT_REVIEWED/u
  );
});

test('event candidates reject missing segment lineage and source drift', () => {
  const missing = validEventCandidates();
  missing.candidates[0].transcript_segment_ids = [99];
  assert.throws(
    () => validateEventCandidates(
      missing,
      { episode: EPISODE, transcript: transcriptFixture() }
    ),
    /PLAYBOOK_EVENT_SEGMENT_UNKNOWN/u
  );

  const drift = validEventCandidates();
  drift.source_segment_index_sha256 = 'b'.repeat(64);
  assert.throws(
    () => validateEventCandidates(
      drift,
      { episode: EPISODE, transcript: transcriptFixture() }
    ),
    /PLAYBOOK_EVENT_TRANSCRIPT_DRIFT/u
  );
});

test('frame extraction leaves the final episode directory to atomic installer', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-frames-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const transcriptPath = path.join(
    projectRoot,
    `.local/architecture-playbook/transcripts/${EPISODE.bvid}/draft-transcript.json`
  );
  const candidatesPath = path.join(
    projectRoot,
    `.local/architecture-playbook/evidence/${EPISODE.bvid}/event-candidates.json`
  );
  const frameRoot = path.join(
    projectRoot,
    `.local/architecture-playbook/frames/${EPISODE.bvid}`
  );
  await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
  await fs.mkdir(path.dirname(candidatesPath), { recursive: true });
  await fs.writeFile(transcriptPath, JSON.stringify(transcriptFixture()));
  await fs.writeFile(candidatesPath, JSON.stringify(validEventCandidates()));

  const result = await runFrameExtraction({
    bvid: EPISODE.bvid,
    projectRoot,
    executeImpl: async () => {
      await assert.rejects(fs.access(frameRoot));
      await fs.mkdir(frameRoot, { recursive: false });
      await fs.writeFile(
        path.join(frameRoot, 'event-frame-index.json'),
        JSON.stringify({
          frame_count: 2,
          frame_index_sha256: 'b'.repeat(64)
        })
      );
    }
  });

  assert.equal(result.frame_count, 2);
  assert.equal(result.frame_index_sha256, 'b'.repeat(64));
});

function transcriptFixture() {
  return {
    schema_version: 1,
    bvid: EPISODE.bvid,
    segment_index_version: 2,
    segment_index_sha256: TRANSCRIPT_HASH,
    segments: [
      { id: 10, start_ms: 10000, end_ms: 15000, text: 'fixture text' },
      { id: 11, start_ms: 15000, end_ms: 21000, text: 'fixture text' },
      { id: 20, start_ms: 40000, end_ms: 47000, text: 'fixture text' }
    ]
  };
}

function validEventCandidates() {
  return {
    schema_version: 1,
    bvid: EPISODE.bvid,
    source_segment_index_sha256: TRANSCRIPT_HASH,
    selection_method: 'transcript-teaching-events-v1',
    review_status: 'reviewed',
    candidates: [
      {
        candidate_id: `${EPISODE.bvid}:event:01`,
        transcript_segment_ids: [10, 11],
        start_ms: 10000,
        end_ms: 21000,
        target_ms: 17000,
        event_label: 'structure-topic-introduction',
        selection_reason: 'topic-transition',
        review_status: 'reviewed'
      },
      {
        candidate_id: `${EPISODE.bvid}:event:02`,
        transcript_segment_ids: [20],
        start_ms: 40000,
        end_ms: 47000,
        target_ms: 44000,
        event_label: 'volume-comparison',
        selection_reason: 'comparison',
        review_status: 'reviewed'
      }
    ]
  };
}
