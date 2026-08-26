import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildEvidencePack,
  compileLocalEvidencePack,
  summarizeEvidencePack
} from '../src/playbook/knowledge/evidencePack.js';
import { validatePilotEpisodeSet } from '../src/playbook/course/pilotEpisodeSet.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PILOT = validatePilotEpisodeSet(JSON.parse(fs.readFileSync(
  path.join(ROOT, 'docs/architecture-playbook/course/pilot-episodes.json'),
  'utf8'
)));
const EPISODE = PILOT.episodes[0];
const MEDIA_SHA = 'a'.repeat(64);
const RULE_ID = 'rule:structure-foundations:separate-volumes-v1';

test('EvidencePack is byte-stable and traces notes to current inputs', () => {
  const first = buildEvidencePack(evidencePackFixture());
  const second = buildEvidencePack(evidencePackFixture());

  assert.equal(first.index_sha256, second.index_sha256);
  assert.equal(first.note_count, 1);
  assert.equal(first.inputs.source_media_sha256, MEDIA_SHA);
  assert.equal(first.notes[0].source_metadata_fingerprint_sha256,
    first.inputs.metadata_fingerprint_sha256);
  assert.equal(first.accepted_for_public_candidates, true);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.notes[0]));
});

test('EvidencePack rejects media, transcript, and frame lineage drift', () => {
  const mediaDrift = evidencePackFixture();
  mediaDrift.transcript.source_sha256 = '0'.repeat(64);
  assert.throws(
    () => buildEvidencePack(mediaDrift),
    /PLAYBOOK_PACK_TRANSCRIPT_MEDIA_DRIFT/u
  );

  const frameDrift = evidencePackFixture();
  frameDrift.notes[0].visual_evidence[0].frame_index_sha256 = '0'.repeat(64);
  assert.throws(
    () => buildEvidencePack(frameDrift),
    /PLAYBOOK_PACK_FRAME_INDEX_DRIFT/u
  );
});

test('EvidencePack rejects a supporting frame before visual review', () => {
  const input = evidencePackFixture();
  input.frameIndex.frames[0].visual_review_status = 'pending';
  input.frameIndex.frame_index_sha256 = hashStable(input.frameIndex.frames);
  input.notes[0].visual_evidence[0].frame_index_sha256 =
    input.frameIndex.frame_index_sha256;

  assert.throws(
    () => buildEvidencePack(input),
    /PLAYBOOK_PACK_FRAME_NOT_REVIEWED/u
  );
});

test('EvidencePack keeps unresolved evidence out of public candidates', () => {
  const input = evidencePackFixture();
  input.notes[0].unresolved_terms = ['结构比例边界'];
  input.notes[0].review_status = 'unresolved';
  input.notes[0].rule_candidate_ids = [RULE_ID];

  const pack = buildEvidencePack(input);

  assert.equal(pack.accepted_for_public_candidates, false);
  assert.deepEqual(pack.blocking_reason_codes, [
    'UNRESOLVED_NOTE_HAS_RULE_CANDIDATE'
  ]);
});

test('public EvidencePack summary excludes transcript text and local paths', () => {
  const summary = JSON.stringify(
    summarizeEvidencePack(buildEvidencePack(evidencePackFixture()))
  );

  assert.doesNotMatch(summary, /segments|fixture transcript|\/home\/|draft-transcript/u);
  assert.match(summary, /segment_index_sha256/u);
  assert.match(summary, /frame_index_sha256/u);
});

test('local EvidencePack compiler writes once and then rebuilds unchanged', async (t) => {
  const projectRoot = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'playbook-pack-')
  );
  t.after(() => fsPromises.rm(projectRoot, { recursive: true, force: true }));
  const input = evidencePackFixture();
  const publicPilotPath = path.join(
    projectRoot,
    'docs/architecture-playbook/course/pilot-episodes.json'
  );
  const privateRoot = path.join(
    projectRoot,
    `.local/architecture-playbook`
  );
  const paths = {
    mediaIndex: `sources/${EPISODE.bvid}/media-index.json`,
    transcript: `transcripts/${EPISODE.bvid}/draft-transcript.json`,
    frameIndex: `frames/${EPISODE.bvid}/event-frame-index.json`,
    terminologyReview: `evidence/${EPISODE.bvid}/terminology-review.json`,
    notes: `evidence/${EPISODE.bvid}/evidence-notes.json`
  };
  await fsPromises.mkdir(path.dirname(publicPilotPath), { recursive: true });
  await fsPromises.writeFile(publicPilotPath, JSON.stringify(PILOT));
  for (const [key, relative] of Object.entries(paths)) {
    const target = path.join(privateRoot, relative);
    await fsPromises.mkdir(path.dirname(target), { recursive: true });
    await fsPromises.writeFile(target, JSON.stringify(
      key === 'notes' ? input.notes : input[key]
    ));
  }

  const first = await compileLocalEvidencePack({
    bvid: EPISODE.bvid,
    projectRoot
  });
  const second = await compileLocalEvidencePack({
    bvid: EPISODE.bvid,
    projectRoot
  });
  const output = JSON.parse(await fsPromises.readFile(
    path.join(privateRoot, `evidence/${EPISODE.bvid}/evidence-index.json`),
    'utf8'
  ));

  assert.equal(first.status, 'created');
  assert.equal(second.status, 'unchanged');
  assert.equal(output.index_sha256, first.summary.index_sha256);
  assert.doesNotMatch(JSON.stringify(first.summary), /segments|fixture transcript|\/tmp\//u);
});

function evidencePackFixture() {
  const transcript = transcriptFixture();
  const frames = [{
    frame_id: `${EPISODE.bvid}:event:01`,
    transcript_segment_ids: [10, 11],
    target_ms: 17000,
    actual_ms: 17020,
    event_label: 'structure-topic-introduction',
    selection_reason: 'topic-transition',
    filename: '01-000017020-structure-topic-introduction.jpg',
    sha256: 'c'.repeat(64),
    width: 960,
    height: 540,
    visual_review_status: 'visually-reviewed'
  }];
  const frameIndex = {
    schema_version: 1,
    bvid: EPISODE.bvid,
    source_segment_index_sha256: transcript.segment_index_sha256,
    selection_method: 'transcript-teaching-events-v1',
    event_selected: true,
    frame_count: frames.length,
    frame_index_sha256: hashStable(frames),
    frames
  };
  const checks = [{
    time_range_ms: { start: 10000, end: 21000 },
    category: 'core-course-term',
    normalized_term: '结构',
    status: 'resolved',
    basis: '标题、转写和画面共同支持'
  }];
  const terminologyReview = {
    schema_version: 1,
    bvid: EPISODE.bvid,
    source_segment_index_sha256: transcript.segment_index_sha256,
    review_status: 'draft',
    checks,
    resolved_count: 1,
    unresolved_count: 0,
    review_sha256: hashStable(checks)
  };
  return {
    episode: EPISODE,
    pilotEpisodeSet: PILOT,
    mediaIndex: {
      schema_version: 1,
      bvid: EPISODE.bvid,
      cid: EPISODE.cid,
      source_metadata_fingerprint_sha256:
        EPISODE.metadata_fingerprint_sha256,
      observed_at: '2026-08-25T13:00:00.000Z',
      quality: 16,
      format: 'mp4',
      declared_duration_ms: EPISODE.duration_seconds * 1000,
      duration_ms: EPISODE.duration_seconds * 1000,
      declared_size: 12345,
      byte_size: 12345,
      sha256: MEDIA_SHA
    },
    transcript,
    frameIndex,
    terminologyReview,
    notes: [{
      schema_version: 1,
      evidence_id: 'ev:structure-foundations:001',
      school_id: 'heihui-jileniao',
      episode_bvid: EPISODE.bvid,
      source_metadata_fingerprint_sha256:
        EPISODE.metadata_fingerprint_sha256,
      time_range_ms: { start: 10000, end: 21000 },
      statement_type: 'author_claim',
      design_layers: ['massing', 'structure'],
      paraphrase: '作者演示把简单体块组织成具有关系的多个部分。',
      observed_demo: '画面显示两个尺度不同且相互附着的长方体。',
      language_evidence: [{
        start_ms: 10000,
        end_ms: 21000,
        transcript_segment_ids: [10, 11],
        review_status: 'draft-asr-reviewed'
      }],
      visual_evidence: [{
        frame_id: `${EPISODE.bvid}:event:01`,
        actual_ms: 17020,
        frame_index_sha256: frameIndex.frame_index_sha256,
        review_status: 'visually-reviewed'
      }],
      rule_candidate_ids: [RULE_ID],
      confidence: 'medium',
      unresolved_terms: [],
      review_status: 'draft'
    }]
  };
}

function transcriptFixture() {
  const segments = [
    {
      id: 10,
      start_ms: 10000,
      end_ms: 15000,
      text: 'fixture transcript',
      avg_logprob: -0.0,
      no_speech_prob: 1e-7,
      words: [{
        start_ms: 10000,
        end_ms: 10500,
        text: 'fixture',
        probability: 1.0
      }]
    },
    {
      id: 11,
      start_ms: 15000,
      end_ms: 21000,
      text: 'fixture transcript',
      avg_logprob: -0.123456,
      no_speech_prob: 0.0,
      words: []
    }
  ];
  return {
    schema_version: 1,
    bvid: EPISODE.bvid,
    source_sha256: MEDIA_SHA,
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
    language_probability: 1,
    duration_ms: EPISODE.duration_seconds * 1000,
    duration_after_vad_ms: 543000,
    segment_count: 2,
    segment_index_version: 2,
    segment_index_sha256: hashStable(lineageSegments(segments)),
    segments
  };
}

function lineageSegments(segments) {
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
