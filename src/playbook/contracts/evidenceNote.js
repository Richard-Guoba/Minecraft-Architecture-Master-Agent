import { validatePilotEpisodeSet } from '../course/pilotEpisodeSet.js';
import { failPlaybookContract } from './playbookContractError.js';

const SCHOOL_ID = 'heihui-jileniao';
const ID = /^ev:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const RULE_ID = /^rule:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SHAPE_LAYERS = new Set(['massing', 'structure', 'roof', 'facade']);
const DESIGN_LAYERS = ['brief', ...SHAPE_LAYERS];
const TOP_LEVEL_FIELDS = [
  'schema_version',
  'evidence_id',
  'school_id',
  'episode_bvid',
  'source_metadata_fingerprint_sha256',
  'time_range_ms',
  'statement_type',
  'design_layers',
  'paraphrase',
  'observed_demo',
  'language_evidence',
  'visual_evidence',
  'rule_candidate_ids',
  'confidence',
  'unresolved_terms',
  'review_status'
];

export function validateEvidenceNote(value, context) {
  const note = cloneDocument(value, 'EvidenceNote');
  const pilot = validateContext(context);
  assertExactObject(note, 'EvidenceNote', TOP_LEVEL_FIELDS);
  assertEqual(
    note.schema_version,
    1,
    'PLAYBOOK_EVIDENCE_VERSION_INVALID',
    'EvidenceNote.schema_version'
  );
  assertPattern(note.evidence_id, ID, 'EvidenceNote.evidence_id');
  assertEqual(
    note.school_id,
    SCHOOL_ID,
    'PLAYBOOK_EVIDENCE_SCHOOL_INVALID',
    'EvidenceNote.school_id'
  );
  const episode = pilot.episodes.find(
    (candidate) => candidate.bvid === note.episode_bvid
  );
  if (!episode) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_EPISODE_INVALID',
      'EvidenceNote.episode_bvid',
      String(note.episode_bvid)
    );
  }
  if (
    note.source_metadata_fingerprint_sha256
    !== episode.metadata_fingerprint_sha256
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_SOURCE_DRIFT',
      'EvidenceNote.source_metadata_fingerprint_sha256',
      String(note.source_metadata_fingerprint_sha256)
    );
  }
  assertRange(note.time_range_ms, 'EvidenceNote.time_range_ms');
  assertEnum(
    note.statement_type,
    ['fact', 'author_claim', 'inference', 'contrast'],
    'EvidenceNote.statement_type'
  );
  assertUniqueEnumArray(
    note.design_layers,
    DESIGN_LAYERS,
    'EvidenceNote.design_layers',
    { allowEmpty: false }
  );
  assertText(note.paraphrase, 'EvidenceNote.paraphrase', { max: 2000 });
  if (note.observed_demo !== null) {
    assertText(note.observed_demo, 'EvidenceNote.observed_demo', { max: 2000 });
  }
  validateLanguageEvidence(note.language_evidence, note.time_range_ms);
  validateVisualEvidence(
    note.visual_evidence,
    note.time_range_ms,
    note.episode_bvid
  );
  if (
    note.design_layers.some((layer) => SHAPE_LAYERS.has(layer))
    && note.visual_evidence.length === 0
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_VISUAL_REQUIRED',
      'EvidenceNote.visual_evidence',
      'shape claims require a visually reviewed event frame'
    );
  }
  assertUniquePatternArray(
    note.rule_candidate_ids,
    RULE_ID,
    'EvidenceNote.rule_candidate_ids',
    { allowEmpty: true }
  );
  assertEnum(
    note.confidence,
    ['unknown', 'low', 'medium', 'high'],
    'EvidenceNote.confidence'
  );
  assertUniqueTextArray(
    note.unresolved_terms,
    'EvidenceNote.unresolved_terms',
    { allowEmpty: true, maxItems: 64 }
  );
  assertEnum(
    note.review_status,
    ['draft', 'unresolved', 'needs-owner-review'],
    'EvidenceNote.review_status'
  );
  if (note.unresolved_terms.length > 0 && note.confidence === 'high') {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_CONFIDENCE_INVALID',
      'EvidenceNote.confidence',
      'unresolved terms cannot have high confidence'
    );
  }
  return deepFreeze(note);
}

function validateContext(context) {
  if (!context || typeof context !== 'object' || !context.pilotEpisodeSet) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_CONTEXT_INVALID',
      'context.pilotEpisodeSet',
      'pilot episode set required'
    );
  }
  return validatePilotEpisodeSet(context.pilotEpisodeSet);
}

function validateLanguageEvidence(items, noteRange) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 64) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_LANGUAGE_REQUIRED',
      'EvidenceNote.language_evidence',
      'expected 1..64 timestamped language references'
    );
  }
  for (const [index, item] of items.entries()) {
    const itemPath = `EvidenceNote.language_evidence[${index}]`;
    assertExactObject(item, itemPath, [
      'start_ms',
      'end_ms',
      'transcript_segment_ids',
      'review_status'
    ]);
    assertRange(
      { start: item.start_ms, end: item.end_ms },
      itemPath,
      noteRange
    );
    if (
      !Array.isArray(item.transcript_segment_ids)
      || item.transcript_segment_ids.length === 0
      || item.transcript_segment_ids.length > 256
      || new Set(item.transcript_segment_ids).size
        !== item.transcript_segment_ids.length
      || item.transcript_segment_ids.some(
        (id) => !Number.isSafeInteger(id) || id < 0
      )
    ) {
      failPlaybookContract(
        'PLAYBOOK_EVIDENCE_SEGMENTS_INVALID',
        `${itemPath}.transcript_segment_ids`,
        'expected unique non-negative segment ids'
      );
    }
    assertEnum(
      item.review_status,
      ['draft-asr-reviewed', 'unresolved'],
      `${itemPath}.review_status`
    );
  }
}

function validateVisualEvidence(items, noteRange, episodeBvid) {
  if (!Array.isArray(items) || items.length > 64) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_VISUAL_INVALID',
      'EvidenceNote.visual_evidence',
      'expected up to 64 visual references'
    );
  }
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const itemPath = `EvidenceNote.visual_evidence[${index}]`;
    assertExactObject(item, itemPath, [
      'frame_id',
      'actual_ms',
      'frame_index_sha256',
      'review_status'
    ]);
    assertText(item.frame_id, `${itemPath}.frame_id`, { max: 256 });
    if (!item.frame_id.startsWith(`${episodeBvid}:`)) {
      failPlaybookContract(
        'PLAYBOOK_EVIDENCE_FRAME_EPISODE_INVALID',
        `${itemPath}.frame_id`,
        'frame id must belong to the EvidenceNote episode'
      );
    }
    if (ids.has(item.frame_id)) {
      failPlaybookContract(
        'PLAYBOOK_EVIDENCE_VISUAL_INVALID',
        `${itemPath}.frame_id`,
        'duplicate frame id'
      );
    }
    ids.add(item.frame_id);
    if (
      !Number.isSafeInteger(item.actual_ms)
      || item.actual_ms < noteRange.start
      || item.actual_ms > noteRange.end
    ) {
      failPlaybookContract(
        'PLAYBOOK_EVIDENCE_RANGE_INVALID',
        `${itemPath}.actual_ms`,
        'frame lies outside note range'
      );
    }
    assertPattern(
      item.frame_index_sha256,
      SHA256,
      `${itemPath}.frame_index_sha256`
    );
    assertEqual(
      item.review_status,
      'visually-reviewed',
      'PLAYBOOK_EVIDENCE_VISUAL_INVALID',
      `${itemPath}.review_status`
    );
  }
}

function assertRange(value, valuePath, parent = null) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Number.isSafeInteger(value.start)
    || !Number.isSafeInteger(value.end)
    || value.start < 0
    || value.end <= value.start
    || (parent && (value.start < parent.start || value.end > parent.end))
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_RANGE_INVALID',
      valuePath,
      'expected increasing milliseconds inside the note range'
    );
  }
  assertExactObject(value, valuePath, ['start', 'end']);
}

function assertUniqueEnumArray(value, allowed, valuePath, options) {
  if (
    !Array.isArray(value)
    || (!options.allowEmpty && value.length === 0)
    || new Set(value).size !== value.length
    || value.some((item) => !allowed.includes(item))
  ) {
    failPlaybookContract(
      'PLAYBOOK_ENUM_INVALID',
      valuePath,
      `expected unique values from ${allowed.join(',')}`
    );
  }
}

function assertUniquePatternArray(value, pattern, valuePath, options) {
  if (
    !Array.isArray(value)
    || (!options.allowEmpty && value.length === 0)
    || new Set(value).size !== value.length
    || value.some((item) => typeof item !== 'string' || !pattern.test(item))
  ) {
    failPlaybookContract(
      'PLAYBOOK_EVIDENCE_REFERENCE_INVALID',
      valuePath,
      'expected unique valid identifiers'
    );
  }
}

function assertUniqueTextArray(value, valuePath, { allowEmpty, maxItems }) {
  if (
    !Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.length > maxItems
    || new Set(value).size !== value.length
    || value.some((item) => typeof item !== 'string'
      || item.length === 0 || item.length > 256)
  ) {
    failPlaybookContract(
      'PLAYBOOK_STRING_ARRAY_INVALID',
      valuePath,
      'expected unique non-empty strings'
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

function assertPattern(value, pattern, valuePath) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    failPlaybookContract(
      'PLAYBOOK_STRING_INVALID',
      valuePath,
      'value does not match the required pattern'
    );
  }
}

function assertText(value, valuePath, { max }) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    failPlaybookContract(
      'PLAYBOOK_STRING_INVALID',
      valuePath,
      `expected non-empty string up to ${max} characters`
    );
  }
}

function assertEnum(value, allowed, valuePath) {
  if (!allowed.includes(value)) {
    failPlaybookContract(
      'PLAYBOOK_ENUM_INVALID',
      valuePath,
      `expected one of ${allowed.join(',')}`
    );
  }
}

function assertEqual(value, expected, code, valuePath) {
  if (value !== expected) {
    failPlaybookContract(code, valuePath, `${value} != ${expected}`);
  }
}

function cloneDocument(value, valuePath) {
  try {
    return structuredClone(value);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_DOCUMENT_UNCLONEABLE',
      valuePath,
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
