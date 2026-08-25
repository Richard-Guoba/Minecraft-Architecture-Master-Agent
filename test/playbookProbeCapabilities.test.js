import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProbeCapabilityReport
} from '../src/playbook/course/probeCapabilities.js';

test('probe capability report keeps downstream stages blocked without artifacts', () => {
  const report = buildProbeCapabilityReport(blockedProbeFixture());

  assert.equal(report.checks.metadata_identity.status, 'passed');
  assert.equal(report.checks.media_acquisition.status, 'blocked');
  assert.deepEqual(report.checks.media_acquisition.reason_codes, [
    'MEDIA_ARTIFACT_MISSING'
  ]);
  assert.equal(report.checks.transcription.status, 'blocked');
  assert.deepEqual(report.checks.transcription.reason_codes, [
    'SUBTITLE_LOGIN_REQUIRED',
    'ASR_TOOL_UNAVAILABLE'
  ]);
  assert.equal(report.checks.timestamp_alignment.status, 'blocked');
  assert.equal(report.checks.keyframes.status, 'blocked');
  assert.deepEqual(report.checks.keyframes.reason_codes, [
    'MEDIA_PREREQUISITE_BLOCKED',
    'FFMPEG_TOOL_UNAVAILABLE'
  ]);
  assert.equal(report.checks.terminology_review.status, 'blocked');
  assert.equal(report.checks.evidence_reconstruction.status, 'blocked');
  assert.equal(report.gate.status, 'blocked');
});

test('probe capability report passes only with complete reproducible evidence', () => {
  const input = blockedProbeFixture();
  input.tools.ffmpeg_available = true;
  input.tools.asr_available = true;
  input.artifacts.media = {
    sha256: '1'.repeat(64),
    byte_size: 46732394,
    duration_ms: 780555
  };
  input.artifacts.transcript = {
    sha256: '2'.repeat(64),
    segment_count: 42,
    timestamped: true
  };
  input.artifacts.frames = {
    index_sha256: '3'.repeat(64),
    count: 8,
    event_selected: true
  };
  input.artifacts.terminology_review = {
    sha256: '4'.repeat(64),
    resolved_count: 6,
    unresolved_count: 1
  };
  input.artifacts.evidence = {
    index_sha256: '5'.repeat(64),
    note_count: 4,
    deterministic_rebuild: true
  };

  const report = buildProbeCapabilityReport(input);
  assert.deepEqual(
    Object.values(report.checks).map((check) => check.status),
    ['passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed']
  );
  assert.equal(report.gate.status, 'passed');
  assert.equal(report.gate.passed_checks, 7);
});

test('probe capability report exposes no local paths or transcript text', () => {
  const input = blockedProbeFixture();
  input.private_context = {
    media_path: '/private/course.mp4',
    transcript_text: '完整字幕不应进入报告'
  };
  const report = buildProbeCapabilityReport(input);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /\/private\/course\.mp4/u);
  assert.doesNotMatch(serialized, /完整字幕/u);
  assert.equal(Object.hasOwn(report, 'private_context'), false);
});

function blockedProbeFixture() {
  return {
    schema_version: 1,
    episode: {
      bvid: 'BV1HhEuzZEyZ',
      cid: 29903029909,
      duration_ms: 780555,
      metadata_fingerprint_sha256: 'a'.repeat(64)
    },
    observed_at: '2026-08-25T08:45:00.000Z',
    metadata: {
      manifest_valid: true,
      direct_view_access: true,
      play_url_access: true,
      subtitle_access: 'login-required',
      subtitle_track_count: 0
    },
    tools: {
      ffmpeg_available: false,
      asr_available: false
    },
    artifacts: {
      media: null,
      transcript: null,
      frames: null,
      terminology_review: null,
      evidence: null
    }
  };
}
