import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  verifyAndAdvanceEpisode
} from '../src/playbook/course/chapterArtifactVerifier.js';
import {
  createChapterLedger,
  readChapterLedger
} from '../src/playbook/course/chapterLedger.js';
import { buildEvidencePack } from '../src/playbook/knowledge/evidencePack.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHAPTER_PLAN = JSON.parse(await fs.readFile(path.join(
  ROOT,
  'docs/architecture-playbook/course/chapter-plan-v1.json'
), 'utf8'));
const EPISODE = Object.freeze({
  chapter_id: 'foundations-tools-blocks-modularity-color',
  course_order: 1,
  bvid: 'BV1guoPYkExk',
  cid: 29440478157,
  duration_seconds: 205,
  metadata_fingerprint_sha256:
    'f6e8fbeae57aacbf478dff3484ebdd163deec9bc5fcf0c7dddbec9ec45d2600b'
});
const MEDIA_BYTES = Buffer.from('chapter-one-media-fixture');
const MEDIA_SHA256 = createHash('sha256').update(MEDIA_BYTES).digest('hex');

test('reopens exact media bytes before advancing pending to media-verified', async (t) => {
  const fixture = await mediaFixture(t);

  const result = await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'pending'
  });

  assert.equal(result.status, 'updated');
  assert.equal(result.ledger.episodes[EPISODE.bvid].stage, 'media-verified');
  assert.deepEqual(result.ledger.episodes[EPISODE.bvid].evidence, {
    media_sha256: MEDIA_SHA256,
    byte_size: MEDIA_BYTES.length
  });
});

test('changed media bytes fail before any ledger mutation', async (t) => {
  const fixture = await mediaFixture(t);
  const before = await readChapterLedger({ projectRoot: fixture.projectRoot });
  await fs.writeFile(fixture.mediaPath, 'tampered-media');

  await assert.rejects(verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'pending'
  }), { code: 'PLAYBOOK_CHAPTER_ARTIFACT_INVALID' });

  assert.deepEqual(
    await readChapterLedger({ projectRoot: fixture.projectRoot }),
    before
  );
});

test('reopens transcript lineage before advancing media-verified to asr-complete', async (t) => {
  const fixture = await mediaFixture(t);
  await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'pending'
  });
  const transcript = transcriptFixture();
  await writePrivateJson(
    fixture.projectRoot,
    `transcripts/${EPISODE.bvid}/draft-transcript.json`,
    transcript
  );

  const result = await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'media-verified'
  });

  assert.equal(result.ledger.episodes[EPISODE.bvid].stage, 'asr-complete');
  assert.deepEqual(result.ledger.episodes[EPISODE.bvid].evidence, {
    media_sha256: MEDIA_SHA256,
    byte_size: MEDIA_BYTES.length,
    segment_index_sha256: transcript.segment_index_sha256,
    segment_count: 2
  });
});

test('transcript source drift fails before any ledger mutation', async (t) => {
  const fixture = await mediaFixture(t);
  await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'pending'
  });
  const transcript = transcriptFixture();
  transcript.source_sha256 = '0'.repeat(64);
  await writePrivateJson(
    fixture.projectRoot,
    `transcripts/${EPISODE.bvid}/draft-transcript.json`,
    transcript
  );
  const before = await readChapterLedger({ projectRoot: fixture.projectRoot });

  await assert.rejects(verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'media-verified'
  }), { code: 'PLAYBOOK_CHAPTER_ARTIFACT_INVALID' });

  assert.deepEqual(await readChapterLedger({ projectRoot: fixture.projectRoot }), before);
});

test('reopens reviewed teaching events before advancing to events-indexed', async (t) => {
  const fixture = await asrFixture(t);
  const events = eventCandidatesFixture(fixture.transcript);
  const eventBytes = await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/event-candidates.json`,
    events
  );

  const result = await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'asr-complete'
  });

  assert.equal(result.ledger.episodes[EPISODE.bvid].stage, 'events-indexed');
  assert.equal(result.ledger.episodes[EPISODE.bvid].evidence.event_index_sha256,
    sha256(eventBytes));
  assert.equal(result.ledger.episodes[EPISODE.bvid].evidence.event_count, 1);
});

test('unreviewed event selection fails before any ledger mutation', async (t) => {
  const fixture = await asrFixture(t);
  const events = eventCandidatesFixture(fixture.transcript);
  events.review_status = 'pending';
  await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/event-candidates.json`,
    events
  );
  const before = await readChapterLedger({ projectRoot: fixture.projectRoot });

  await assert.rejects(verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'asr-complete'
  }), { code: 'PLAYBOOK_EVENT_CANDIDATES_NOT_REVIEWED' });

  assert.deepEqual(await readChapterLedger({ projectRoot: fixture.projectRoot }), before);
});

test('reopens visually reviewed frame bytes before advancing to visual-reviewed', async (t) => {
  const fixture = await eventsFixture(t);
  const frame = frameFixture();
  const frameRoot = path.join(
    fixture.projectRoot,
    `.local/architecture-playbook/frames/${EPISODE.bvid}`
  );
  await fs.mkdir(frameRoot, { recursive: true });
  await fs.writeFile(path.join(frameRoot, frame.filename), frame.bytes);
  const frameIndex = frameIndexFixture(fixture.transcript, frame);
  const indexBytes = `${JSON.stringify(frameIndex, null, 2)}\n`;
  await fs.writeFile(path.join(frameRoot, 'event-frame-index.json'), indexBytes);

  const result = await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'events-indexed'
  });

  assert.equal(result.ledger.episodes[EPISODE.bvid].stage, 'visual-reviewed');
  assert.equal(result.ledger.episodes[EPISODE.bvid].evidence.visual_review_sha256,
    sha256(indexBytes));
  assert.equal(result.ledger.episodes[EPISODE.bvid].evidence.reviewed_frame_count, 1);
});

test('pending or changed frame bytes fail before any ledger mutation', async (t) => {
  for (const failure of ['pending', 'changed-bytes']) {
    await t.test(failure, async (t) => {
      const fixture = await eventsFixture(t);
      const frame = frameFixture();
      const frameRoot = path.join(
        fixture.projectRoot,
        `.local/architecture-playbook/frames/${EPISODE.bvid}`
      );
      await fs.mkdir(frameRoot, { recursive: true });
      await fs.writeFile(
        path.join(frameRoot, frame.filename),
        failure === 'changed-bytes' ? 'changed' : frame.bytes
      );
      const frameIndex = frameIndexFixture(fixture.transcript, frame);
      if (failure === 'pending') {
        frameIndex.frames[0].visual_review_status = 'pending';
        frameIndex.frame_index_sha256 = hashStable(frameIndex.frames);
      }
      await fs.writeFile(
        path.join(frameRoot, 'event-frame-index.json'),
        `${JSON.stringify(frameIndex, null, 2)}\n`
      );
      const before = await readChapterLedger({ projectRoot: fixture.projectRoot });

      await assert.rejects(verifyAndAdvanceEpisode({
        projectRoot: fixture.projectRoot,
        episode: EPISODE,
        expectedCurrentStage: 'events-indexed'
      }), { code: 'PLAYBOOK_CHAPTER_ARTIFACT_INVALID' });

      assert.deepEqual(await readChapterLedger({ projectRoot: fixture.projectRoot }), before);
    });
  }
});

test('exactly rebuilds the EvidencePack before advancing to evidence-packed', async (t) => {
  const fixture = await visualFixture(t);
  const evidenceInput = evidencePackInput(fixture);
  const pack = buildEvidencePack(evidenceInput);
  await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/terminology-review.json`,
    evidenceInput.terminologyReview
  );
  await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/evidence-notes.json`,
    evidenceInput.notes
  );
  await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/evidence-index.json`,
    pack
  );

  const result = await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'visual-reviewed'
  });

  assert.equal(result.ledger.episodes[EPISODE.bvid].stage, 'evidence-packed');
  assert.equal(result.ledger.episodes[EPISODE.bvid].evidence.evidence_pack_sha256,
    pack.index_sha256);
  assert.equal(result.ledger.episodes[EPISODE.bvid].evidence.evidence_count, 1);
});

test('EvidencePack hash drift fails before any ledger mutation', async (t) => {
  const fixture = await visualFixture(t);
  const evidenceInput = evidencePackInput(fixture);
  const pack = structuredClone(buildEvidencePack(evidenceInput));
  pack.index_sha256 = '0'.repeat(64);
  await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/terminology-review.json`,
    evidenceInput.terminologyReview
  );
  await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/evidence-notes.json`,
    evidenceInput.notes
  );
  await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/evidence-index.json`,
    pack
  );
  const before = await readChapterLedger({ projectRoot: fixture.projectRoot });

  await assert.rejects(verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'visual-reviewed'
  }), { code: 'PLAYBOOK_CHAPTER_ARTIFACT_INVALID' });

  assert.deepEqual(await readChapterLedger({ projectRoot: fixture.projectRoot }), before);
});

async function mediaFixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-artifact-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  await createChapterLedger({ projectRoot, chapterPlan: CHAPTER_PLAN });
  const sourceRoot = path.join(
    projectRoot,
    `.local/architecture-playbook/sources/${EPISODE.bvid}`
  );
  await fs.mkdir(sourceRoot, { recursive: true });
  const mediaPath = path.join(sourceRoot, 'source-360p.mp4');
  await fs.writeFile(mediaPath, MEDIA_BYTES);
  await fs.writeFile(path.join(sourceRoot, 'media-index.json'), JSON.stringify({
    schema_version: 1,
    bvid: EPISODE.bvid,
    cid: EPISODE.cid,
    source_metadata_fingerprint_sha256:
      EPISODE.metadata_fingerprint_sha256,
    observed_at: '2026-09-01T12:00:00.000Z',
    quality: 16,
    format: 'mp4',
    declared_duration_ms: EPISODE.duration_seconds * 1000,
    duration_ms: EPISODE.duration_seconds * 1000,
    declared_size: MEDIA_BYTES.length,
    byte_size: MEDIA_BYTES.length,
    sha256: MEDIA_SHA256
  }, null, 2) + '\n');
  return { projectRoot, mediaPath };
}

async function asrFixture(t) {
  const fixture = await mediaFixture(t);
  await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'pending'
  });
  const transcript = transcriptFixture();
  await writePrivateJson(
    fixture.projectRoot,
    `transcripts/${EPISODE.bvid}/draft-transcript.json`,
    transcript
  );
  await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'media-verified'
  });
  return { ...fixture, transcript };
}

async function eventsFixture(t) {
  const fixture = await asrFixture(t);
  await writePrivateJson(
    fixture.projectRoot,
    `evidence/${EPISODE.bvid}/event-candidates.json`,
    eventCandidatesFixture(fixture.transcript)
  );
  await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'asr-complete'
  });
  return fixture;
}

async function visualFixture(t) {
  const fixture = await eventsFixture(t);
  const frame = frameFixture();
  const frameRoot = path.join(
    fixture.projectRoot,
    `.local/architecture-playbook/frames/${EPISODE.bvid}`
  );
  await fs.mkdir(frameRoot, { recursive: true });
  await fs.writeFile(path.join(frameRoot, frame.filename), frame.bytes);
  const frameIndex = frameIndexFixture(fixture.transcript, frame);
  await fs.writeFile(
    path.join(frameRoot, 'event-frame-index.json'),
    `${JSON.stringify(frameIndex, null, 2)}\n`
  );
  await verifyAndAdvanceEpisode({
    projectRoot: fixture.projectRoot,
    episode: EPISODE,
    expectedCurrentStage: 'events-indexed'
  });
  return { ...fixture, frameIndex };
}

function transcriptFixture() {
  const segments = [
    {
      id: 0,
      start_ms: 0,
      end_ms: 1000,
      text: '课程目标',
      avg_logprob: -0.1,
      no_speech_prob: 0,
      words: [{
        start_ms: 0,
        end_ms: 500,
        text: '课程',
        probability: 0.9
      }]
    },
    {
      id: 1,
      start_ms: 1000,
      end_ms: 2000,
      text: '模数与色彩',
      avg_logprob: -0.1,
      no_speech_prob: 0,
      words: []
    }
  ];
  return {
    schema_version: 1,
    bvid: EPISODE.bvid,
    source_sha256: MEDIA_SHA256,
    processor: {
      name: 'faster-whisper',
      version: '1.2.1',
      model: 'small',
      device: 'cpu',
      compute_type: 'int8',
      language: 'zh',
      beam_size: 5,
      word_timestamps: true,
      vad_filter: true,
      condition_on_previous_text: true
    },
    detected_language: 'zh',
    language_probability: 0.99,
    duration_ms: EPISODE.duration_seconds * 1000,
    duration_after_vad_ms: 2000,
    segment_count: segments.length,
    segment_index_version: 2,
    segment_index_sha256: hashStable(segments.map((segment) => ({
      id: segment.id,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
      text: segment.text,
      words: segment.words.map((word) => ({
        start_ms: word.start_ms,
        end_ms: word.end_ms,
        text: word.text
      }))
    }))),
    segments
  };
}

function eventCandidatesFixture(transcript) {
  return {
    schema_version: 1,
    bvid: EPISODE.bvid,
    source_segment_index_sha256: transcript.segment_index_sha256,
    selection_method: 'transcript-teaching-events-v1',
    review_status: 'reviewed',
    candidates: [{
      candidate_id: `${EPISODE.bvid}:event:01`,
      transcript_segment_ids: [0, 1],
      start_ms: 0,
      end_ms: 2000,
      target_ms: 1000,
      event_label: 'course-goals',
      selection_reason: 'topic-transition',
      review_status: 'reviewed'
    }]
  };
}

function frameFixture() {
  const bytes = Buffer.from('reviewed-frame-fixture');
  return {
    bytes,
    filename: '01-000001000-course-goals.jpg',
    sha256: sha256(bytes)
  };
}

function frameIndexFixture(transcript, frame) {
  const frames = [{
    frame_id: `${EPISODE.bvid}:event:01`,
    transcript_segment_ids: [0, 1],
    target_ms: 1000,
    actual_ms: 1000,
    event_label: 'course-goals',
    selection_reason: 'topic-transition',
    filename: frame.filename,
    sha256: frame.sha256,
    width: 960,
    height: 540,
    visual_review_status: 'visually-reviewed'
  }];
  return {
    schema_version: 1,
    bvid: EPISODE.bvid,
    source_segment_index_sha256: transcript.segment_index_sha256,
    selection_method: 'transcript-teaching-events-v1',
    event_selected: true,
    frame_count: frames.length,
    frame_index_sha256: hashStable(frames),
    frames
  };
}

function evidencePackInput(fixture) {
  const checks = [{
    time_range_ms: { start: 0, end: 2000 },
    category: 'core-course-term',
    normalized_term: '模数',
    status: 'resolved',
    basis: '标题、转写和画面共同支持'
  }];
  const terminologyReview = {
    schema_version: 1,
    bvid: EPISODE.bvid,
    source_segment_index_sha256: fixture.transcript.segment_index_sha256,
    review_status: 'draft',
    checks,
    resolved_count: 1,
    unresolved_count: 0,
    review_sha256: hashStable(checks)
  };
  const notes = [{
    schema_version: 1,
    evidence_id: 'ev:bv1guopykexk:course-goals',
    school_id: 'heihui-jileniao',
    episode_bvid: EPISODE.bvid,
    source_metadata_fingerprint_sha256:
      EPISODE.metadata_fingerprint_sha256,
    time_range_ms: { start: 0, end: 2000 },
    statement_type: 'author_claim',
    design_layers: ['brief'],
    paraphrase: '作者用新罗马案例说明本课程将覆盖建筑学习目标。',
    observed_demo: null,
    language_evidence: [{
      start_ms: 0,
      end_ms: 2000,
      transcript_segment_ids: [0, 1],
      review_status: 'draft-asr-reviewed'
    }],
    visual_evidence: [],
    rule_candidate_ids: [],
    confidence: 'medium',
    unresolved_terms: [],
    review_status: 'draft'
  }];
  return {
    episode: EPISODE,
    approvedEpisodes: [EPISODE],
    mediaIndex: {
      schema_version: 1,
      bvid: EPISODE.bvid,
      cid: EPISODE.cid,
      source_metadata_fingerprint_sha256:
        EPISODE.metadata_fingerprint_sha256,
      observed_at: '2026-09-01T12:00:00.000Z',
      quality: 16,
      format: 'mp4',
      declared_duration_ms: EPISODE.duration_seconds * 1000,
      duration_ms: EPISODE.duration_seconds * 1000,
      declared_size: MEDIA_BYTES.length,
      byte_size: MEDIA_BYTES.length,
      sha256: MEDIA_SHA256
    },
    transcript: fixture.transcript,
    frameIndex: fixture.frameIndex,
    terminologyReview,
    notes
  };
}

async function writePrivateJson(projectRoot, relativePath, value) {
  const target = path.join(projectRoot, '.local/architecture-playbook', relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, bytes);
  return bytes;
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
