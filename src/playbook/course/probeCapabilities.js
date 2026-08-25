const SHA256 = /^[a-f0-9]{64}$/u;

export function buildProbeCapabilityReport(input) {
  assertProbeInput(input);
  const metadataIdentity = check(
    input.metadata.manifest_valid
      && input.metadata.direct_view_access
      && input.metadata.play_url_access,
    metadataReasons(input.metadata)
  );
  const mediaAcquisition = check(
    metadataIdentity.status === 'passed' && validMedia(input.artifacts.media),
    mediaReasons(metadataIdentity, input.artifacts.media)
  );
  const transcription = check(
    validTranscript(input.artifacts.transcript)
      && (
        input.metadata.subtitle_access === 'available'
        || input.tools.asr_available
      ),
    transcriptionReasons(input)
  );
  const timestampAlignment = check(
    transcription.status === 'passed'
      && input.artifacts.transcript.timestamped === true,
    timestampReasons(transcription, input.artifacts.transcript)
  );
  const keyframes = check(
    mediaAcquisition.status === 'passed'
      && input.tools.frame_decoder_available
      && validFrames(input.artifacts.frames),
    keyframeReasons(input, mediaAcquisition)
  );
  const terminologyReview = check(
    transcription.status === 'passed'
      && validTerminologyReview(input.artifacts.terminology_review),
    terminologyReasons(transcription, input.artifacts.terminology_review)
  );
  const evidenceReconstruction = check(
    timestampAlignment.status === 'passed'
      && keyframes.status === 'passed'
      && terminologyReview.status === 'passed'
      && validEvidence(input.artifacts.evidence),
    evidenceReasons({
      timestampAlignment,
      keyframes,
      terminologyReview,
      evidence: input.artifacts.evidence
    })
  );
  const checks = {
    metadata_identity: metadataIdentity,
    media_acquisition: mediaAcquisition,
    transcription,
    timestamp_alignment: timestampAlignment,
    keyframes,
    terminology_review: terminologyReview,
    evidence_reconstruction: evidenceReconstruction
  };
  const passedChecks = Object.values(checks)
    .filter((item) => item.status === 'passed').length;
  return deepFreeze({
    schema_version: 1,
    episode: structuredClone(input.episode),
    observed_at: input.observed_at,
    metadata: structuredClone(input.metadata),
    tools: structuredClone(input.tools),
    artifacts: publicArtifactSummary(input.artifacts),
    checks,
    gate: {
      status: passedChecks === Object.keys(checks).length ? 'passed' : 'blocked',
      passed_checks: passedChecks,
      total_checks: Object.keys(checks).length
    }
  });
}

function assertProbeInput(input) {
  if (!input || typeof input !== 'object') throw new TypeError('probe input required');
  if (input.schema_version !== 1) throw new TypeError('probe schema_version must be 1');
  if (input.episode?.bvid !== 'BV1HhEuzZEyZ') {
    throw new TypeError('technical probe must use BV1HhEuzZEyZ');
  }
  if (!Number.isSafeInteger(input.episode.cid) || input.episode.cid < 1) {
    throw new TypeError('probe cid must be a positive integer');
  }
  if (!validHash(input.episode.metadata_fingerprint_sha256)) {
    throw new TypeError('probe metadata fingerprint must be SHA-256');
  }
  if (!input.metadata || !input.tools || !input.artifacts) {
    throw new TypeError('probe metadata, tools, and artifacts are required');
  }
}

function check(passed, reasonCodes) {
  return {
    status: passed ? 'passed' : 'blocked',
    reason_codes: passed ? [] : reasonCodes
  };
}

function metadataReasons(metadata) {
  const reasons = [];
  if (!metadata.manifest_valid) reasons.push('MANIFEST_INVALID');
  if (!metadata.direct_view_access) reasons.push('DIRECT_VIEW_UNAVAILABLE');
  if (!metadata.play_url_access) reasons.push('PLAY_URL_UNAVAILABLE');
  return reasons;
}

function mediaReasons(metadataIdentity, media) {
  const reasons = [];
  if (metadataIdentity.status !== 'passed') {
    reasons.push('METADATA_PREREQUISITE_BLOCKED');
  }
  if (!validMedia(media)) reasons.push('MEDIA_ARTIFACT_MISSING');
  return reasons;
}

function transcriptionReasons(input) {
  const reasons = [];
  if (input.metadata.subtitle_access === 'login-required') {
    reasons.push('SUBTITLE_LOGIN_REQUIRED');
  } else if (input.metadata.subtitle_access !== 'available') {
    reasons.push('SUBTITLE_UNAVAILABLE');
  }
  if (!input.tools.asr_available) reasons.push('ASR_TOOL_UNAVAILABLE');
  if (
    (input.metadata.subtitle_access === 'available' || input.tools.asr_available)
    && !validTranscript(input.artifacts.transcript)
  ) {
    reasons.push('TRANSCRIPT_ARTIFACT_MISSING');
  }
  return reasons;
}

function timestampReasons(transcription, transcript) {
  if (transcription.status !== 'passed') {
    return ['TRANSCRIPTION_PREREQUISITE_BLOCKED'];
  }
  return transcript?.timestamped === true ? [] : ['TIMESTAMPS_MISSING'];
}

function keyframeReasons(input, mediaAcquisition) {
  const reasons = [];
  if (mediaAcquisition.status !== 'passed') {
    reasons.push('MEDIA_PREREQUISITE_BLOCKED');
  }
  if (!input.tools.frame_decoder_available) {
    reasons.push('FRAME_DECODER_TOOL_UNAVAILABLE');
  }
  if (
    mediaAcquisition.status === 'passed'
    && input.tools.frame_decoder_available
    && !validFrames(input.artifacts.frames)
  ) {
    reasons.push('KEYFRAME_ARTIFACT_MISSING');
  }
  return reasons;
}

function terminologyReasons(transcription, review) {
  if (transcription.status !== 'passed') {
    return ['TRANSCRIPTION_PREREQUISITE_BLOCKED'];
  }
  return validTerminologyReview(review) ? [] : ['TERMINOLOGY_REVIEW_MISSING'];
}

function evidenceReasons({
  timestampAlignment,
  keyframes,
  terminologyReview,
  evidence
}) {
  const reasons = [];
  if (timestampAlignment.status !== 'passed') {
    reasons.push('TIMESTAMP_PREREQUISITE_BLOCKED');
  }
  if (keyframes.status !== 'passed') reasons.push('KEYFRAME_PREREQUISITE_BLOCKED');
  if (terminologyReview.status !== 'passed') {
    reasons.push('TERMINOLOGY_PREREQUISITE_BLOCKED');
  }
  if (
    timestampAlignment.status === 'passed'
    && keyframes.status === 'passed'
    && terminologyReview.status === 'passed'
    && !validEvidence(evidence)
  ) {
    reasons.push('EVIDENCE_ARTIFACT_MISSING');
  }
  return reasons;
}

function validMedia(value) {
  return value
    && validHash(value.sha256)
    && Number.isSafeInteger(value.byte_size)
    && value.byte_size > 0
    && Number.isSafeInteger(value.duration_ms)
    && value.duration_ms > 0;
}

function validTranscript(value) {
  return value
    && validHash(value.sha256)
    && Number.isSafeInteger(value.segment_count)
    && value.segment_count > 0
    && typeof value.timestamped === 'boolean';
}

function validFrames(value) {
  return value
    && validHash(value.index_sha256)
    && Number.isSafeInteger(value.count)
    && value.count > 0
    && value.event_selected === true;
}

function validTerminologyReview(value) {
  return value
    && validHash(value.sha256)
    && Number.isSafeInteger(value.resolved_count)
    && value.resolved_count >= 0
    && Number.isSafeInteger(value.unresolved_count)
    && value.unresolved_count >= 0;
}

function validEvidence(value) {
  return value
    && validHash(value.index_sha256)
    && Number.isSafeInteger(value.note_count)
    && value.note_count > 0
    && value.deterministic_rebuild === true;
}

function validHash(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function publicArtifactSummary(artifacts) {
  return {
    media: artifacts.media ? structuredClone(artifacts.media) : null,
    transcript: artifacts.transcript ? structuredClone(artifacts.transcript) : null,
    frames: artifacts.frames ? structuredClone(artifacts.frames) : null,
    terminology_review: artifacts.terminology_review
      ? structuredClone(artifacts.terminology_review)
      : null,
    evidence: artifacts.evidence ? structuredClone(artifacts.evidence) : null
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
