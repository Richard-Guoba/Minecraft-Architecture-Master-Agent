import { CandidateReadinessError } from './stage7CandidateBoundary.js';
import {
  canonicalReadinessJson,
  reduceCandidateReadiness,
  validateReadinessEvent
} from './stage7CandidateReadinessState.js';
import {
  appendPilotJsonlIdempotent,
  readPilotJsonl
} from './stage7PilotFilesystem.js';

export const PILOT_READINESS_LEDGER_RELATIVE = 'manifests/acquisition-events.jsonl';

export async function readPilotReadinessLedger(root, deps = {}) {
  const records = (await readPilotJsonl(root, PILOT_READINESS_LEDGER_RELATIVE, deps))
    .map((record) => {
      const event = validateReadinessEvent(record);
      if (event.synthetic_only !== false) {
        fail('OPERATIONAL_EVENT_REQUIRED', event.candidate_id);
      }
      return event;
    });
  for (const candidateId of new Set(records.map((record) => record.candidate_id))) {
    reduceCandidateReadiness(records, candidateId);
  }
  return Object.freeze(records);
}

export async function appendPilotReadinessEvent(root, input, deps = {}) {
  const event = validateReadinessEvent(input);
  if (event.synthetic_only !== false) fail('OPERATIONAL_EVENT_REQUIRED', event.candidate_id);
  const existing = await readPilotReadinessLedger(root, deps);
  const identity = identityOf(event);
  const duplicate = existing.find((record) => identityOf(record) === identity);
  if (duplicate && canonicalReadinessJson(duplicate) === canonicalReadinessJson(event)) {
    return duplicate;
  }
  if (duplicate) {
    return appendPilotJsonlIdempotent(
      root, PILOT_READINESS_LEDGER_RELATIVE, event, identity, { ...deps, identityOf }
    );
  }
  const prior = existing.filter((record) => record.candidate_id === event.candidate_id);
  if (event.revision !== prior.length + 1) {
    fail('READINESS_REVISION_NOT_NEXT', event.candidate_id);
  }
  const expectedPrevious = prior.at(-1)?.event_sha256 ?? null;
  if (event.previous_event_sha256 !== expectedPrevious) {
    fail('READINESS_PREVIOUS_HASH_INVALID', event.candidate_id);
  }
  reduceCandidateReadiness([...existing, event], event.candidate_id);
  await appendPilotJsonlIdempotent(
    root, PILOT_READINESS_LEDGER_RELATIVE, event, identity, { ...deps, identityOf }
  );
  return event;
}

function identityOf(event) {
  return `${event.candidate_id}:${event.revision}`;
}

function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'store', candidateId, safeDetail);
}
