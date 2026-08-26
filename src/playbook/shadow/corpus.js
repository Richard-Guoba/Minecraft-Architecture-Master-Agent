import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  EVALUATED_LAYERS,
  LAYER_ORDER,
  PLAYBOOK_VERSION,
  SCHOOL_ID
} from './constants.js';
import { deepFreeze } from './canonical.js';
import { createCheckerDefinitions } from './checkerRegistry.js';
import { shadowError } from './contracts.js';

export const SHADOW_CORPUS_PATHS = Object.freeze([
  'docs/architecture-playbook/rules/schools/heihui-jileniao/reviewed-rules-v0.1.jsonl',
  'docs/architecture-playbook/rules/schools/heihui-jileniao/admission-v0.1.json',
  'docs/architecture-playbook/manual/coverage-v0.1.json'
]);

const [REVIEWED_RULES_PATH, ADMISSION_PATH, COVERAGE_PATH] = SHADOW_CORPUS_PATHS;
const CORE_PROCEDURE_COUNT = 15;
const KNOWN_UNKNOWN_IDS = Object.freeze([
  'unknown:aesthetic-evaluator',
  'unknown:blank-plane-threshold',
  'unknown:cross-author-validity',
  'unknown:massing-ratio-thresholds',
  'unknown:medieval-scale-generalization',
  'unknown:repetition-limit',
  'unknown:roof-slope-table'
]);

export async function loadShadowCorpus({ projectRoot, readFile } = {}) {
  try {
    if (typeof projectRoot !== 'string' || projectRoot.length === 0) invalid();
    const files = await loadFiles(projectRoot, readFile);
    const cards = parseJsonl(files.get(REVIEWED_RULES_PATH));
    const admissions = parseJson(files.get(ADMISSION_PATH));
    const coverageDocument = parseJson(files.get(COVERAGE_PATH));

    validateCorpus(cards, admissions, coverageDocument);
    return deepFreeze({
      playbook_version: PLAYBOOK_VERSION,
      school_id: SCHOOL_ID,
      cards,
      coverage: coverageDocument.layers,
      corpus_sha256: corpusHash(files)
    });
  } catch {
    throw shadowError('PLAYBOOK_CORPUS_INVALID');
  }
}

async function loadFiles(projectRoot, readFile) {
  const files = new Map();
  for (const relativePath of SHADOW_CORPUS_PATHS) {
    const bytes = readFile
      ? await readFile(relativePath)
      : await readDescriptorSafely(projectRoot, relativePath);
    files.set(relativePath, bytesFor(bytes));
  }
  return files;
}

async function readDescriptorSafely(projectRoot, relativePath) {
  const filePath = path.resolve(projectRoot, relativePath);
  const before = await lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink()) invalid();

  const descriptor = await open(
    filePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const opened = await descriptor.stat();
    if (
      !opened.isFile()
      || opened.dev !== before.dev
      || opened.ino !== before.ino
    ) invalid();
    return await descriptor.readFile();
  } finally {
    await descriptor.close();
  }
}

function bytesFor(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  invalid();
}

function parseJsonl(bytes) {
  const lines = bytes.toString('utf8').split(/\r?\n/u).filter((line) => line.trim() !== '');
  if (lines.length !== 21) invalid();
  return lines.map((line) => JSON.parse(line));
}

function parseJson(bytes) {
  return JSON.parse(bytes.toString('utf8'));
}

function validateCorpus(cards, admissionDocument, coverageDocument) {
  if (!Array.isArray(cards) || cards.length !== 21) invalid();
  assertIdentity(admissionDocument, 'school_id');
  assertIdentity(coverageDocument, 'school_id');
  if (!Array.isArray(admissionDocument.rule_admissions)) invalid();
  if (admissionDocument.rule_admissions.length !== cards.length) invalid();
  if (!Array.isArray(admissionDocument.coverage)) invalid();
  if (!Array.isArray(coverageDocument.layers)) invalid();
  if (!isDeepStrictEqual(admissionDocument.coverage, coverageDocument.layers)) invalid();

  const definitions = createCheckerDefinitions();
  const ruleIds = new Set();
  const checkIds = new Set();
  const repairIds = new Set();
  for (const [index, card] of cards.entries()) {
    if (!isObject(card)) invalid();
    const expectedRole = index < CORE_PROCEDURE_COUNT ? 'core-procedure' : 'case-pattern';
    const expectedCoverage = index < CORE_PROCEDURE_COUNT
      ? 'advisory-partial'
      : 'manual-example-only';
    const definition = definitions[index];
    if (
      card.schema_version !== 1
      || card.playbook_version !== PLAYBOOK_VERSION
      || card.rule_version !== 1
      || card.primary_school !== SCHOOL_ID
      || card.maturity !== 'candidate'
      || card.authority !== 'advisory'
      || card.effect_validation_status !== 'not-tested'
      || card.admission_status !== 'admitted-advisory'
      || card.teaching_role !== expectedRole
      || card.design_layer !== definition?.design_layer
      || card.rule_id !== definition?.rule_id
    ) invalid();
    assertUniqueId(card.rule_id, 'rule:', ruleIds);
    const projection = card.runtime_projection;
    if (!isObject(projection)) invalid();
    assertOneUniqueId(projection.observable_checks, 'check:', checkIds);
    assertOneUniqueId(projection.repair_operations, 'repair:', repairIds);
    if (
      projection.coverage_status !== expectedCoverage
      || projection.observable_checks[0] !== definition.check_id
    ) invalid();

    const admission = admissionDocument.rule_admissions[index];
    if (!isObject(admission) || admission.rule_id !== card.rule_id) invalid();
    if (admission.decision !== 'admitted-advisory') invalid();
    if (admission.teaching_role !== card.teaching_role) invalid();
    if (!isDeepStrictEqual(admission.runtime_projection, projection)) invalid();
  }

  validateCoverage(coverageDocument.layers, cards);
}

function assertIdentity(document, schoolField) {
  if (!isObject(document)) invalid();
  if (
    document.schema_version !== 1
    || document.playbook_version !== PLAYBOOK_VERSION
    || document[schoolField] !== SCHOOL_ID
  ) invalid();
}

function assertOneUniqueId(values, prefix, identifiers) {
  if (!Array.isArray(values) || values.length !== 1) invalid();
  assertUniqueId(values[0], prefix, identifiers);
}

function assertUniqueId(value, prefix, identifiers) {
  if (typeof value !== 'string' || !value.startsWith(prefix) || identifiers.has(value)) {
    invalid();
  }
  identifiers.add(value);
}

function validateCoverage(layers, cards) {
  if (layers.length !== LAYER_ORDER.length) invalid();
  const coveredRuleIds = new Set();
  let advisoryCount = 0;
  let uncoveredCount = 0;
  const unknownIds = new Set();

  for (const [index, layer] of layers.entries()) {
    if (!isObject(layer) || layer.layer !== LAYER_ORDER[index]) invalid();
    if (
      layer.runtime_authority !== 'none'
      || !Array.isArray(layer.rule_ids)
      || !Array.isArray(layer.unknown_ids)
    ) invalid();
    const expectedStatus = EVALUATED_LAYERS.includes(layer.layer)
      ? 'advisory-partial'
      : 'not-covered';
    if (layer.status !== expectedStatus) invalid();
    if (layer.status === 'advisory-partial') advisoryCount += 1;
    else uncoveredCount += 1;

    for (const ruleId of layer.rule_ids) {
      const card = cards.find((candidate) => candidate.rule_id === ruleId);
      if (!card || coveredRuleIds.has(ruleId)) invalid();
      coveredRuleIds.add(ruleId);
    }
    for (const unknownId of layer.unknown_ids) {
      if (typeof unknownId !== 'string' || unknownIds.has(unknownId)) continue;
      unknownIds.add(unknownId);
    }
  }

  if (advisoryCount !== 5 || uncoveredCount !== 4) invalid();
  if (coveredRuleIds.size !== cards.length) invalid();
  if (!isDeepStrictEqual([...unknownIds].sort(), [...KNOWN_UNKNOWN_IDS])) invalid();
}

function corpusHash(files) {
  const hash = createHash('sha256');
  for (const relativePath of SHADOW_CORPUS_PATHS) {
    hash.update(relativePath, 'utf8');
    hash.update('\0');
    hash.update(files.get(relativePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid() {
  throw shadowError('PLAYBOOK_CORPUS_INVALID');
}
