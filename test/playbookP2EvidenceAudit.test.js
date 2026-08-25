import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  auditP2Evidence,
  loadP2PublicCorpus,
  parseAndValidateCandidateJsonl
} from '../src/playbook/knowledge/publicCandidateCorpus.js';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('loads the committed six-episode P2 corpus with full lineage', async () => {
  const corpus = await loadP2PublicCorpus({ projectRoot });

  assert.equal(corpus.school_id, 'heihui-jileniao');
  assert.equal(corpus.episode_count, 6);
  assert.equal(corpus.evidence_note_count, 21);
  assert.equal(corpus.candidate_rule_count, 21);
  assert.equal(corpus.conflict_count, 1);
  assert.equal(corpus.unknown_count, 7);
  assert.equal(corpus.note_file_count, 6);
});

test('P2 public knowledge passes the school-isolated evidence gate', async () => {
  const audit = await auditP2Evidence({ projectRoot });

  assert.equal(audit.episode_count, 6);
  assert.equal(audit.cross_school_count, 0);
  assert.equal(audit.dangling_reference_count, 0);
  assert.equal(audit.shape_claims_without_dual_evidence, 0);
  assert.equal(audit.transcript_leak_count, 0);
  assert.equal(audit.gate.status, 'passed');
});

test('rejects a candidate that cites evidence outside the public index', async () => {
  const corpus = await loadP2PublicCorpus({ projectRoot });
  const invalid = {
    ...corpus.candidates[0],
    evidence_ids: ['ev:missing:evidence']
  };

  assert.throws(
    () => parseAndValidateCandidateJsonl(
      `${JSON.stringify(invalid)}\n`,
      {
        pilotEpisodeSet: corpus.pilot_episode_set,
        evidenceIds: corpus.evidence_ids
      }
    ),
    /PLAYBOOK_RULE_EVIDENCE_UNKNOWN/
  );
});
