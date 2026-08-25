import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildReviewedRuleCards,
  deriveReviewedRuleCard,
  validateReviewedRuleCard
} from '../src/playbook/manual/reviewedRuleCard.js';
import { validateP3AdmissionPolicy } from '../src/playbook/manual/p3AdmissionPolicy.js';
import { loadP2PublicCorpus } from '../src/playbook/knowledge/publicCandidateCorpus.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const POLICY_PATH = path.join(
  ROOT,
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json'
);
const CORPUS = await loadP2PublicCorpus({ projectRoot: ROOT });
const POLICY = validateP3AdmissionPolicy(JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')), {
  candidateRuleIds: new Set(CORPUS.candidates.map((candidate) => candidate.rule_id))
});

test('reviewed card preserves candidate content and adds advisory metadata', () => {
  const candidate = candidateFixture();
  const card = deriveReviewedRuleCard(candidate, admissionFixture(), {
    playbookVersion: '0.1.0'
  });

  assert.equal(card.rule_id, candidate.rule_id);
  assert.equal(card.rule_version, candidate.rule_version);
  assert.deepEqual(card.action, candidate.action);
  assert.deepEqual(card.evidence_ids, candidate.evidence_ids);
  assert.equal(card.authority, 'advisory');
  assert.equal(card.maturity, 'candidate');
  assert.equal(card.admission_status, 'admitted-advisory');
  assert.equal(card.effect_validation_status, 'not-tested');
  assert.equal(card.source_candidate_sha256, independentCandidateHash(candidate));
});

test('reviewed card hashes recursive object-key reordering identically', () => {
  const candidate = candidateFixture();
  const reordered = recursivelyReverseObjectKeys(candidate);
  const normal = deriveReviewedRuleCard(candidate, admissionFixture(), {
    playbookVersion: '0.1.0'
  });
  const reorderedCard = deriveReviewedRuleCard(reordered, admissionFixture(), {
    playbookVersion: '0.1.0'
  });

  assert.equal(normal.source_candidate_sha256, independentCandidateHash(candidate));
  assert.equal(reorderedCard.source_candidate_sha256, independentCandidateHash(reordered));
  assert.equal(reorderedCard.source_candidate_sha256, normal.source_candidate_sha256);
});

test('reviewed card freezes every nested value and is isolated from inputs', () => {
  const candidate = candidateFixture();
  const admission = admissionFixture();
  const card = deriveReviewedRuleCard(candidate, admission, { playbookVersion: '0.1.0' });

  assert.equal(Object.isFrozen(card), true);
  assert.equal(Object.isFrozen(card.evidence_ids), true);
  assert.equal(Object.isFrozen(card.runtime_projection), true);
  assert.equal(Object.isFrozen(card.runtime_projection.input_signals), true);
  assert.equal(Object.isFrozen(card.parameters), true);
  candidate.action = 'changed after derivation';
  admission.runtime_projection.input_signals[0] = 'changed.after.derivation';
  assert.notEqual(card.action, candidate.action);
  assert.notEqual(card.runtime_projection.input_signals[0], admission.runtime_projection.input_signals[0]);
});

test('reviewed card rejects changed architectural claims', () => {
  const card = structuredClone(reviewedCardFixture());
  card.action = 'Invented replacement action';

  assert.throws(
    () => validateReviewedRuleCard(card, cardContext()),
    /PLAYBOOK_P3_CANDIDATE_CONTENT_DRIFT/u
  );
});

test('reviewed card rejects executable authority and unknown fields', () => {
  const executable = structuredClone(reviewedCardFixture());
  executable.authority = 'executable';
  assert.throws(
    () => validateReviewedRuleCard(executable, cardContext()),
    /PLAYBOOK_P3_AUTHORITY_INVALID/u
  );

  const extra = structuredClone(reviewedCardFixture());
  extra.unreviewed_extra = true;
  assert.throws(
    () => validateReviewedRuleCard(extra, cardContext()),
    /PLAYBOOK_P3_CARD_FIELDS_INVALID/u
  );
});

test('batch cards retain exact candidate JSONL order and unique rule IDs', () => {
  const cards = buildReviewedRuleCards(CORPUS.candidates, POLICY);

  assert.equal(cards.length, 21);
  assert.deepEqual(
    cards.map((card) => card.rule_id),
    CORPUS.candidates.map((candidate) => candidate.rule_id)
  );
  assert.equal(new Set(cards.map((card) => card.rule_id)).size, cards.length);
  assert.equal(Object.isFrozen(cards), true);
});

test('batch rejects policy and candidate rule-ID mismatches', () => {
  const candidates = CORPUS.candidates.slice();
  candidates[20] = candidates[0];

  assert.throws(
    () => buildReviewedRuleCards(candidates, POLICY),
    /PLAYBOOK_P3_POLICY_CANDIDATE_MISMATCH/u
  );
});

function candidateFixture() {
  return structuredClone(CORPUS.candidates[0]);
}

function admissionFixture() {
  return structuredClone(POLICY.rule_admissions[0]);
}

function reviewedCardFixture() {
  return deriveReviewedRuleCard(candidateFixture(), admissionFixture(), {
    playbookVersion: '0.1.0'
  });
}

function cardContext() {
  return {
    candidate: candidateFixture(),
    admission: admissionFixture()
  };
}

function independentCandidateHash(candidate) {
  return createHash('sha256')
    .update(JSON.stringify(independentlyCanonicalize(candidate)))
    .digest('hex');
}

function independentlyCanonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => independentlyCanonicalize(item));
  if (value && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = independentlyCanonicalize(value[key]);
    }
    return output;
  }
  return value;
}

function recursivelyReverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map((item) => recursivelyReverseObjectKeys(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .reverse()
        .map((key) => [key, recursivelyReverseObjectKeys(value[key])])
    );
  }
  return value;
}
