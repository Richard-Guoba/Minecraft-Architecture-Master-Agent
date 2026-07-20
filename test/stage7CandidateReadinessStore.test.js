import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import { createSyntheticReadinessEvent } from '../src/construction/learning/stage7CandidateReadinessState.js';
import {
  READINESS_LEDGER_RELATIVE,
  appendSyntheticReadinessEvent,
  readSyntheticReadinessLedger
} from '../src/construction/learning/stage7CandidateReadinessStore.js';

const ID = 'synthetic-source:house-01';

test('store appends canonical contiguous hash-chained candidate events', async (t) => {
  const root = await rootFixture(t);
  const first = eventFixture();
  await appendSyntheticReadinessEvent(root, first);
  const second = eventFixture({
    revision: 2,
    stateBefore: 'named_batch_approved',
    stateAfter: 'acquired_quarantine',
    previousEventSha256: first.event_sha256
  });
  await appendSyntheticReadinessEvent(root, second);
  assert.deepEqual(await readSyntheticReadinessLedger(root), [first, second]);
  const text = await readFile(join(root, READINESS_LEDGER_RELATIVE), 'utf8');
  assert.equal(text.endsWith('\n'), true);
  assert.equal(text.split('\n').filter(Boolean).length, 2);
});

test('store refuses non-temporary roots, revision gaps, and symlink ledgers', async (t) => {
  const root = await rootFixture(t);
  await assert.rejects(
    appendSyntheticReadinessEvent(join(process.cwd(), '.local', 'stage7-source-expansion'), eventFixture()),
    hasCode('SYNTHETIC_ROOT_INVALID')
  );
  await assert.rejects(
    appendSyntheticReadinessEvent(root, eventFixture({ revision: 2 })),
    hasCode('READINESS_REVISION_NOT_NEXT')
  );
  const ledger = join(root, READINESS_LEDGER_RELATIVE);
  const outside = join(root, 'outside.jsonl');
  await writeFile(outside, '', 'utf8');
  await symlink(outside, ledger);
  await assert.rejects(readSyntheticReadinessLedger(root), hasCode('READINESS_LEDGER_SYMLINK'));
});

test('injected rename failure preserves the original ledger and removes temp output', async (t) => {
  const root = await rootFixture(t);
  const first = eventFixture();
  await appendSyntheticReadinessEvent(root, first);
  const before = await readFile(join(root, READINESS_LEDGER_RELATIVE));
  const second = eventFixture({
    revision: 2,
    stateBefore: 'named_batch_approved',
    stateAfter: 'acquired_quarantine',
    previousEventSha256: first.event_sha256
  });
  await assert.rejects(
    appendSyntheticReadinessEvent(root, second, {
      rename: async () => { throw new Error('injected rename failure'); }
    }),
    /injected rename failure/u
  );
  assert.deepEqual(await readFile(join(root, READINESS_LEDGER_RELATIVE)), before);
  assert.deepEqual((await readdir(join(root, 'manifests'))).sort(), ['acquisition-events.jsonl']);
});

async function rootFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-candidate-readiness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'manifests'));
  return root;
}

function eventFixture({
  revision = 1,
  stateBefore = 'admission_contract_ready',
  stateAfter = 'named_batch_approved',
  previousEventSha256 = null
} = {}) {
  return createSyntheticReadinessEvent({
    candidateId: ID,
    revision,
    eventType: stateAfter,
    stateBefore,
    stateAfter,
    recordedAt: `2026-07-20T00:00:${String(revision).padStart(2, '0')}.000Z`,
    recordedBy: 'synthetic-test',
    reasonCodes: [],
    evidenceHashes: { fixture_sha256: 'a'.repeat(64) },
    previousEventSha256
  });
}

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}
