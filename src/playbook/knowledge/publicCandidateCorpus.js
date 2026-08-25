import fs from 'node:fs/promises';
import path from 'node:path';
import { validatePlaybookRuleCandidate } from '../contracts/playbookRuleCandidate.js';
import { validateRuleConflict } from '../contracts/ruleConflict.js';
import { validatePilotEpisodeSet } from '../course/pilotEpisodeSet.js';

const SCHOOL_ID = 'heihui-jileniao';
const SHA256 = /^[a-f0-9]{64}$/u;
const EVIDENCE_ID = /^ev:[a-z0-9][a-z0-9_.:-]{0,127}$/u;
const UNKNOWN_ID = /^unknown:[a-z0-9][a-z0-9_.:-]{0,127}$/u;

export async function loadP2PublicCorpus({ projectRoot }) {
  const root = path.resolve(projectRoot);
  const courseRoot = path.join(root, 'docs/architecture-playbook/course');
  const schoolRoot = path.join(
    root,
    'docs/architecture-playbook/rules/schools',
    SCHOOL_ID
  );
  const pilotEpisodeSet = validatePilotEpisodeSet(
    await readJson(path.join(courseRoot, 'pilot-episodes.json'))
  );
  const evidenceIndex = validatePublicEvidenceIndex(
    await readJson(path.join(schoolRoot, 'evidence-index-v0.1.json')),
    pilotEpisodeSet
  );
  const evidenceIds = new Set(
    evidenceIndex.episodes.flatMap((episode) => episode.evidence_ids)
  );
  const candidates = parseAndValidateCandidateJsonl(
    await fs.readFile(path.join(schoolRoot, 'candidates-v0.1.jsonl'), 'utf8'),
    { pilotEpisodeSet, evidenceIds }
  );
  const candidateRuleIds = new Set(candidates.map((rule) => rule.rule_id));
  assertUniqueCount(candidateRuleIds, candidates.length, 'candidate rule ids');
  assertSetEqual(
    new Set(candidates.flatMap((rule) => rule.evidence_ids)),
    evidenceIds,
    'candidate evidence coverage'
  );

  const conflictDocument = await readJson(
    path.join(schoolRoot, 'conflicts-v0.1.json')
  );
  assertHeader(conflictDocument, 'conflicts');
  const conflicts = conflictDocument.conflicts.map((conflict) =>
    validateRuleConflict(conflict, {
      evidenceIds,
      candidateRuleIds,
      authorUpdateEvidenceIds: new Set()
    }));
  const conflictIds = new Set(conflicts.map((conflict) => conflict.conflict_id));
  assertUniqueCount(conflictIds, conflicts.length, 'conflict ids');
  for (const rule of candidates) {
    for (const id of rule.conflict_ids) {
      assertCondition(conflictIds.has(id), `unknown candidate conflict ${id}`);
      const conflict = conflicts.find((item) => item.conflict_id === id);
      assertCondition(
        conflict.rule_ids.includes(rule.rule_id),
        `conflict ${id} does not cite ${rule.rule_id}`
      );
    }
  }

  const unknownDocument = await readJson(
    path.join(schoolRoot, 'unknowns-v0.1.json')
  );
  const unknowns = validateUnknowns(unknownDocument, pilotEpisodeSet);
  const noteFileCount = await validatePublicNotes({
    courseRoot,
    evidenceIndex
  });

  return deepFreeze({
    schema_version: 1,
    school_id: SCHOOL_ID,
    episode_count: evidenceIndex.episode_count,
    evidence_note_count: evidenceIndex.note_count,
    candidate_rule_count: candidates.length,
    conflict_count: conflicts.length,
    unknown_count: unknowns.length,
    note_file_count: noteFileCount,
    pilot_episode_set: pilotEpisodeSet,
    evidence_index: evidenceIndex,
    evidence_ids: evidenceIds,
    candidates,
    conflicts,
    unknowns
  });
}

export function parseAndValidateCandidateJsonl(text, {
  pilotEpisodeSet,
  evidenceIds
}) {
  if (typeof text !== 'string') {
    throw new TypeError('candidate JSONL must be text');
  }
  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== '');
  assertCondition(lines.length > 0, 'candidate JSONL is empty');
  return lines.map((line, index) => {
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`candidate JSONL line ${index + 1}: ${error.message}`);
    }
    return validatePlaybookRuleCandidate(value, {
      pilotEpisodeSet,
      evidenceIds
    });
  });
}

function validatePublicEvidenceIndex(value, pilot) {
  assertCondition(value?.schema_version === 1, 'evidence index version');
  assertCondition(value?.school_id === SCHOOL_ID, 'evidence index school');
  assertCondition(Array.isArray(value?.episodes), 'evidence index episodes');
  assertCondition(
    value.episode_count === value.episodes.length,
    'evidence index episode count'
  );
  assertCondition(
    value.episode_count === pilot.episode_count,
    'evidence index pilot coverage'
  );
  const pilotBvids = new Set(pilot.episodes.map((episode) => episode.bvid));
  const indexBvids = new Set();
  const evidenceIds = new Set();
  let noteCount = 0;
  for (const episode of value.episodes) {
    assertCondition(pilotBvids.has(episode?.bvid), 'unknown evidence episode');
    assertCondition(!indexBvids.has(episode.bvid), 'duplicate evidence episode');
    indexBvids.add(episode.bvid);
    assertCondition(
      SHA256.test(episode.evidence_pack_sha256),
      `invalid evidence pack hash for ${episode.bvid}`
    );
    assertCondition(
      Array.isArray(episode.evidence_ids) && episode.evidence_ids.length > 0,
      `missing evidence ids for ${episode.bvid}`
    );
    for (const id of episode.evidence_ids) {
      assertCondition(EVIDENCE_ID.test(id), `invalid evidence id ${id}`);
      assertCondition(!evidenceIds.has(id), `duplicate evidence id ${id}`);
      evidenceIds.add(id);
      noteCount += 1;
    }
  }
  assertSetEqual(indexBvids, pilotBvids, 'evidence index BVID coverage');
  assertCondition(value.note_count === noteCount, 'evidence index note count');
  return value;
}

function validateUnknowns(value, pilot) {
  assertHeader(value, 'unknowns');
  assertCondition(
    value.pilot_episode_count === pilot.episode_count,
    'unknowns pilot count'
  );
  const ids = new Set();
  for (const unknown of value.unknowns) {
    assertCondition(UNKNOWN_ID.test(unknown?.unknown_id), 'invalid unknown id');
    assertCondition(!ids.has(unknown.unknown_id), 'duplicate unknown id');
    ids.add(unknown.unknown_id);
    assertText(unknown.question, 'unknown question');
    assertTextArray(unknown.blocked_parameters, 'blocked parameters');
    assertText(unknown.next_evidence, 'unknown next evidence');
  }
  return value.unknowns;
}

async function validatePublicNotes({ courseRoot, evidenceIndex }) {
  const noteRoot = path.join(courseRoot, 'notes', SCHOOL_ID);
  for (const episode of evidenceIndex.episodes) {
    const note = await fs.readFile(
      path.join(noteRoot, `${episode.bvid}.md`),
      'utf8'
    );
    assertCondition(
      note.includes(episode.evidence_pack_sha256),
      `note ${episode.bvid} missing evidence pack hash`
    );
    for (const id of episode.evidence_ids) {
      assertCondition(note.includes(id), `note ${episode.bvid} missing ${id}`);
    }
    assertCondition(
      !note.includes('.local/architecture-playbook'),
      `note ${episode.bvid} leaks a private path`
    );
  }
  return evidenceIndex.episodes.length;
}

function assertHeader(value, collectionField) {
  assertCondition(value?.schema_version === 1, `${collectionField} version`);
  assertCondition(value?.school_id === SCHOOL_ID, `${collectionField} school`);
  assertCondition(Array.isArray(value?.[collectionField]), collectionField);
}

function assertText(value, label) {
  assertCondition(typeof value === 'string' && value.length > 0, label);
}

function assertTextArray(value, label) {
  assertCondition(
    Array.isArray(value)
      && value.length > 0
      && new Set(value).size === value.length
      && value.every((item) => typeof item === 'string' && item.length > 0),
    label
  );
}

function assertUniqueCount(values, expected, label) {
  assertCondition(values.size === expected, `duplicate ${label}`);
}

function assertSetEqual(actual, expected, label) {
  assertCondition(actual.size === expected.size, `${label} size`);
  for (const value of expected) {
    assertCondition(actual.has(value), `${label} missing ${value}`);
  }
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(`PLAYBOOK_P2_CORPUS_INVALID: ${message}`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    if (value instanceof Set) {
      Object.freeze(value);
      return value;
    }
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
