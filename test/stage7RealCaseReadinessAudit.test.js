import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalizeStage7RealCaseReadinessAudit,
  renderStage7RealCaseReadinessMarkdown
} from '../src/construction/learning/stage7RealCaseReadinessAudit.js';

test('canonical readiness audit serialization and Markdown are deterministic', () => {
  const audit = {
    advisory_only: true,
    mutates_dataset: false,
    authorizes_training: false,
    inputs: [],
    global_blockers: [],
    cases: [],
    summary: {
      gate_contribution_count: 0,
      ready_for_m3_real_data: false,
      training_eligible_count: 0
    }
  };

  const first = canonicalizeStage7RealCaseReadinessAudit(audit);
  assert.equal(first, canonicalizeStage7RealCaseReadinessAudit(structuredClone(audit)));
  assert.match(first, /\n$/);
  assert.match(renderStage7RealCaseReadinessMarkdown(audit), /Advisory only: yes/);
});
