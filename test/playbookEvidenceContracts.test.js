import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  validateEvidenceNote,
  validatePlaybookRuleCandidate,
  validateRuleConflict
} from '../src/playbook/contracts/index.js';
import { validatePilotEpisodeSet } from '../src/playbook/course/pilotEpisodeSet.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PILOT = validatePilotEpisodeSet(JSON.parse(fs.readFileSync(
  path.join(ROOT, 'docs/architecture-playbook/course/pilot-episodes.json'),
  'utf8'
)));
const EPISODE = PILOT.episodes[0];
const EVIDENCE_ID = 'ev:structure-foundations:001';
const RULE_ID = 'rule:structure-foundations:separate-volumes-v1';

test('EvidenceNote accepts a traceable dual-evidence shape claim', () => {
  const note = validateEvidenceNote(validEvidenceNote(), evidenceContext());

  assert.equal(note.episode_bvid, EPISODE.bvid);
  assert.equal(note.language_evidence[0].transcript_segment_ids[0], 12);
  assert.equal(note.visual_evidence[0].review_status, 'visually-reviewed');
  assert.ok(Object.isFrozen(note));
  assert.ok(Object.isFrozen(note.language_evidence[0]));
});

test('EvidenceNote rejects shape claims without visually reviewed evidence', () => {
  const note = validEvidenceNote();
  note.visual_evidence = [];

  assert.throws(
    () => validateEvidenceNote(note, evidenceContext()),
    /PLAYBOOK_EVIDENCE_VISUAL_REQUIRED/u
  );
});

test('EvidenceNote rejects source drift, cross-school content, and bad ranges', () => {
  const sourceDrift = validEvidenceNote();
  sourceDrift.source_metadata_fingerprint_sha256 = '0'.repeat(64);
  assert.throws(
    () => validateEvidenceNote(sourceDrift, evidenceContext()),
    /PLAYBOOK_EVIDENCE_SOURCE_DRIFT/u
  );

  const crossSchool = validEvidenceNote();
  crossSchool.school_id = 'mixed-school';
  assert.throws(
    () => validateEvidenceNote(crossSchool, evidenceContext()),
    /PLAYBOOK_EVIDENCE_SCHOOL_INVALID/u
  );

  const outsideRange = validEvidenceNote();
  outsideRange.visual_evidence[0].actual_ms = 91000;
  assert.throws(
    () => validateEvidenceNote(outsideRange, evidenceContext()),
    /PLAYBOOK_EVIDENCE_RANGE_INVALID/u
  );
});

test('EvidenceNote rejects a visually reviewed frame from another episode', () => {
  const note = validEvidenceNote();
  note.visual_evidence[0].frame_id = 'BV1HhEuzZEyZ:event:01';

  assert.throws(
    () => validateEvidenceNote(note, evidenceContext()),
    /PLAYBOOK_EVIDENCE_FRAME_EPISODE_INVALID/u
  );
});

test('PlaybookRuleCandidate accepts evidence-linked P2 candidate knowledge', () => {
  const rule = validatePlaybookRuleCandidate(
    validRuleCandidate(),
    evidenceContext()
  );

  assert.equal(rule.maturity, 'candidate');
  assert.deepEqual(rule.evidence_ids, [EVIDENCE_ID]);
  assert.ok(Object.isFrozen(rule.parameters[0]));
});

test('PlaybookRuleCandidate rejects maturity escalation and dangling evidence', () => {
  const executable = validRuleCandidate();
  executable.maturity = 'executable';
  assert.throws(
    () => validatePlaybookRuleCandidate(executable, evidenceContext()),
    /PLAYBOOK_RULE_MATURITY_INVALID/u
  );

  const dangling = validRuleCandidate();
  dangling.evidence_ids = ['ev:missing:001'];
  assert.throws(
    () => validatePlaybookRuleCandidate(dangling, evidenceContext()),
    /PLAYBOOK_RULE_EVIDENCE_UNKNOWN/u
  );
});

test('unknown rule parameters cannot carry invented values', () => {
  const rule = validRuleCandidate();
  rule.parameters[0] = {
    name: 'secondary_volume_ratio',
    value: 0.6,
    unit: 'ratio',
    status: 'unknown'
  };

  assert.throws(
    () => validatePlaybookRuleCandidate(rule, evidenceContext()),
    /PLAYBOOK_RULE_UNKNOWN_PARAMETER_INVALID/u
  );
});

test('RuleConflict preserves unresolved alternatives and validates lineage', () => {
  const conflict = validateRuleConflict(
    validRuleConflict(),
    evidenceContext({
      candidateRuleIds: new Set([
        RULE_ID,
        'rule:structure-foundations:joined-volumes-v1'
      ])
    })
  );

  assert.equal(conflict.resolution, 'unresolved');
  assert.ok(Object.isFrozen(conflict.rule_ids));
});

test('RuleConflict rejects superseded status without author-update evidence', () => {
  const conflict = validRuleConflict();
  conflict.resolution = 'superseded';

  assert.throws(
    () => validateRuleConflict(
      conflict,
      evidenceContext({
        candidateRuleIds: new Set([
          RULE_ID,
          'rule:structure-foundations:joined-volumes-v1'
        ])
      })
    ),
    /PLAYBOOK_CONFLICT_SUPERSEDE_EVIDENCE_REQUIRED/u
  );
});

function evidenceContext(overrides = {}) {
  return {
    pilotEpisodeSet: PILOT,
    evidenceIds: new Set([EVIDENCE_ID]),
    candidateRuleIds: new Set([RULE_ID]),
    authorUpdateEvidenceIds: new Set(),
    ...overrides
  };
}

function validEvidenceNote() {
  return {
    schema_version: 1,
    evidence_id: EVIDENCE_ID,
    school_id: 'heihui-jileniao',
    episode_bvid: EPISODE.bvid,
    source_metadata_fingerprint_sha256: EPISODE.metadata_fingerprint_sha256,
    time_range_ms: { start: 82000, end: 90000 },
    statement_type: 'author_claim',
    design_layers: ['massing', 'structure'],
    paraphrase: '作者演示把简单体块分成具有明确关系的多个部分。',
    observed_demo: '画面显示两个尺度不同且相互附着的长方体体量。',
    language_evidence: [{
      start_ms: 82100,
      end_ms: 87400,
      transcript_segment_ids: [12, 13],
      review_status: 'draft-asr-reviewed'
    }],
    visual_evidence: [{
      frame_id: `${EPISODE.bvid}:event:01`,
      actual_ms: 85000,
      frame_index_sha256: 'a'.repeat(64),
      review_status: 'visually-reviewed'
    }],
    rule_candidate_ids: [RULE_ID],
    confidence: 'medium',
    unresolved_terms: [],
    review_status: 'draft'
  };
}

function validRuleCandidate() {
  return {
    schema_version: 1,
    rule_id: RULE_ID,
    rule_version: 1,
    primary_school: 'heihui-jileniao',
    source_episode_bvids: [EPISODE.bvid],
    evidence_ids: [EVIDENCE_ID],
    claim_type: 'inference',
    design_layer: 'massing',
    intent: 'establish-readable-volume-relations',
    applicability: ['simple-house-massing'],
    prerequisites: ['at-least-two-visible-volumes'],
    exclusions: [],
    action: 'Give attached volumes distinct visual roles without inventing a fixed ratio.',
    parameters: [{
      name: 'secondary_volume_ratio',
      value: null,
      unit: 'ratio',
      status: 'unknown'
    }],
    implementation_hints: ['Keep absolute dimensions under deterministic QA.'],
    positive_signs: ['A viewer can identify a dominant and supporting volume.'],
    failure_modes: ['Volumes read as unrelated equal boxes.'],
    repairs: ['Revise only the massing relation and recheck the silhouette.'],
    author_reason: 'The lesson links separated volume roles with readable structure.',
    confidence: 'medium',
    maturity: 'candidate',
    review_status: 'draft',
    conflict_ids: [],
    supersedes: []
  };
}

function validRuleConflict() {
  return {
    schema_version: 1,
    conflict_id: 'conflict:structure-foundations:001',
    primary_school: 'heihui-jileniao',
    rule_ids: [
      RULE_ID,
      'rule:structure-foundations:joined-volumes-v1'
    ],
    evidence_ids: [EVIDENCE_ID],
    resolution: 'unresolved',
    condition_note: 'The available lesson segment does not establish the boundary.',
    review_status: 'unresolved'
  };
}
