import path from 'node:path';
import { BlueprintQAAgent } from '../../construction/agents/blueprintQaAgent.js';
import { sha256, stableJson } from '../shadow/canonical.js';
import { validateReview } from '../shadow/contracts.js';
import {
  executeError,
  validateChainManifest,
  validateCheckpointPayload,
  validateExecuteSelectionManifest,
  validateEligibilityRecord,
  validateFrozenDesignEnvelope,
  validateFrozenGeneratorContext,
  validateInitialCandidateFailure,
  validateRepairEvidenceRequest,
  validateRepairEvidenceResult,
  validateRepairPlanningFailureEvidence,
  validateRepairTransaction,
  validateReplayFailureEvidence,
  validateSelectionRecord
} from './contracts.js';
import { assertReviewCandidateAuthority } from './eligibility.js';

export const CANDIDATE_IDS = Object.freeze(['candidate-01', 'candidate-02', 'candidate-03']);
export const LAYERS = Object.freeze(['brief', 'massing', 'structure', 'roof', 'facade']);
export const CURRENT_CHAIN_BASENAME = 'current-chain.json';
export const SELECTION_PATHS = Object.freeze(['manifest.json', 'selection.json', 'selection-report.md']);
export const FROZEN_DESIGN_PATH = 'frozen/frozen-design.json';
export const FROZEN_CONTEXT_PATH = 'frozen/frozen-generator-context.json';
export const OPERATION_LIST_PATH = 'artifacts/operation-list.json';
export const BUILD_FUNCTION_PATH = 'artifacts/build.mcfunction';

const SELECTION_BODY_PATHS = Object.freeze(['selection.json', 'selection-report.md']);
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const REVISION = '[0-9]{4}';
const CHECKPOINT_PATH = new RegExp(`^checkpoints/(${LAYERS.join('|')})/r(${REVISION})\\.json$`, 'u');
const CHAIN_PATH = new RegExp(`^chains/chain-(${REVISION})\\.json$`, 'u');
const HARD_QA_PATH = new RegExp(`^reviews/chain-(${REVISION})-hard-qa\\.json$`, 'u');
const REVIEW_PATH = new RegExp(`^reviews/chain-(${REVISION})-review\\.json$`, 'u');
const BLUEPRINT_PATH = new RegExp(`^blueprints/chain-(${REVISION})\\.json$`, 'u');
const REPAIR_REQUEST_PATH = 'repairs/attempt-01-request.json';
const REPAIR_PATCH_PATH = 'repairs/attempt-01-patch.json';
const REPAIR_RESULT_PATH = 'repairs/attempt-01-result.json';
const FAILURE_PATH = 'failures/attempt-01.json';
const REPAIR_PLANNING_FAILURE_PATH = 'failures/repair-attempt-01.json';
const INITIAL_FAILURE_PATH = 'failures/initial.json';
const INITIAL_HARD_QA_PATH = 'reviews/initial-hard-qa.json';
const INITIAL_REVIEW_PATH = 'reviews/initial-review.json';

export function normalizeInitialFailureFiles({ candidateId, files }) {
  assertCandidateId(candidateId);
  if (!isPlainObject(files)) throw executeError('P5_AUTHORITY_INVALID');
  const names = Reflect.ownKeys(files);
  if (names.some((name) => typeof name !== 'string') || !names.includes(INITIAL_FAILURE_PATH)
    || names.some((name) => ![INITIAL_FAILURE_PATH, INITIAL_HARD_QA_PATH, INITIAL_REVIEW_PATH].includes(name))) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  const normalized = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(files, name);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || !Buffer.isBuffer(descriptor.value)) {
      throw executeError('P5_AUTHORITY_INVALID');
    }
    normalized[name] = Buffer.from(descriptor.value);
  }
  const failure = parseCanonicalValidatedJson(normalized[INITIAL_FAILURE_PATH], validateInitialCandidateFailure);
  if (failure.candidate_id !== candidateId) throw executeError('P5_AUTHORITY_INVALID');
  const expected = [INITIAL_FAILURE_PATH, ...Object.keys(failure.artifact_hashes)];
  if (!sameStrings(Object.keys(normalized).sort(), expected.sort())) throw executeError('P5_AUTHORITY_INVALID');
  for (const [name, hash] of Object.entries(failure.artifact_hashes)) {
    if (sha256(normalized[name]) !== hash) throw executeError('P5_AUTHORITY_INVALID');
    parseCanonicalJson(normalized[name], 'P5_AUTHORITY_INVALID');
  }
  return Object.freeze({ candidateId, files: Object.freeze(sortFileMap(normalized)), failure });
}

export function validateCandidateEvidence(candidateId, files, code) {
  const hasCurrent = Buffer.isBuffer(files?.[CURRENT_CHAIN_BASENAME]);
  const hasInitialFailure = Buffer.isBuffer(files?.[INITIAL_FAILURE_PATH]);
  if (hasCurrent === hasInitialFailure) throw executeError(code);
  if (hasCurrent) return Object.freeze({ kind: 'accepted', ...validateCandidateFiles(candidateId, files, code) });
  try {
    const normalized = normalizeInitialFailureFiles({ candidateId, files });
    return Object.freeze({ kind: 'initial-failed', failure: normalized.failure, expectedDirectories: Object.freeze(expectedDirectoriesFor(files)) });
  } catch {
    throw executeError(code);
  }
}

export function normalizeCandidateSnapshot({ candidateId, files, currentChain }) {
  assertCandidateId(candidateId);
  if (!Buffer.isBuffer(currentChain)) throw executeError('P5_AUTHORITY_INVALID');
  const immutableFiles = normalizeCandidateFileMap(files);
  let current;
  try {
    current = parseCanonicalValidatedJson(currentChain, validateChainManifest);
  } catch {
    throw executeError('P5_CHECKPOINT_INVALID');
  }
  if (current.candidate_id !== candidateId) throw executeError('P5_CHECKPOINT_INVALID');
  const checkpointPaths = Object.keys(immutableFiles).filter((name) => CHECKPOINT_PATH.test(name));
  if (
    checkpointPaths.length < LAYERS.length
    || LAYERS.some((layer) => !checkpointPaths.some((name) => name.startsWith(`checkpoints/${layer}/`)))
  ) throw executeError('P5_AUTHORITY_INVALID');
  const currentChainBytes = Buffer.from(currentChain);
  const currentChainPath = chainPath(current.chain_revision);
  if (Object.hasOwn(immutableFiles, currentChainPath)) throw executeError('P5_AUTHORITY_INVALID');
  const currentPointer = Buffer.from(stableJson({
    schema_version: 1,
    candidate_id: candidateId,
    chain_revision: current.chain_revision,
    chain_sha256: sha256(currentChainBytes)
  }));
  const installedFiles = Object.freeze(sortFileMap({
    ...immutableFiles,
    [currentChainPath]: Buffer.from(currentChainBytes),
    [CURRENT_CHAIN_BASENAME]: currentPointer
  }));
  const validated = validateCandidateFiles(candidateId, installedFiles, 'P5_CHECKPOINT_INVALID');
  return Object.freeze({
    files: installedFiles,
    candidateId,
    currentChainSha256: validated.currentChainSha256
  });
}

function normalizeCandidateFileMap(files) {
  if (!isPlainObject(files)) throw executeError('P5_AUTHORITY_INVALID');
  const names = Reflect.ownKeys(files);
  if (names.length === 0 || names.some((name) => typeof name !== 'string')) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  const normalized = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(files, name);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw executeError('P5_AUTHORITY_INVALID');
    }
    if (!isAllowedImmutablePath(name) || !Buffer.isBuffer(descriptor.value)) {
      throw executeError('P5_AUTHORITY_INVALID');
    }
    try {
      if (name === REPAIR_REQUEST_PATH) parseCanonicalValidatedJson(descriptor.value, validateRepairEvidenceRequest);
      if (name === REPAIR_PATCH_PATH) parseCanonicalValidatedJson(descriptor.value, validateRepairTransaction);
      if (name === REPAIR_RESULT_PATH) parseCanonicalValidatedJson(descriptor.value, validateRepairEvidenceResult);
      if (name === FAILURE_PATH) parseCanonicalValidatedJson(descriptor.value, validateReplayFailureEvidence);
      if (name === REPAIR_PLANNING_FAILURE_PATH) parseCanonicalValidatedJson(descriptor.value, validateRepairPlanningFailureEvidence);
    } catch {
      throw executeError('P5_AUTHORITY_INVALID');
    }
    normalized[name] = Buffer.from(descriptor.value);
  }
  return Object.freeze(sortFileMap(normalized));
}

export function validateCandidateFiles(candidateId, files, code) {
  try {
    if (!isPlainObject(files) || !Buffer.isBuffer(files[CURRENT_CHAIN_BASENAME])) {
      throw executeError(code);
    }
    const pointer = parseCurrentPointer(files[CURRENT_CHAIN_BASENAME], code);
    if (pointer.candidate_id !== candidateId) throw executeError(code);
    const currentPath = chainPath(pointer.chain_revision);
    if (!Buffer.isBuffer(files[currentPath]) || sha256(files[currentPath]) !== pointer.chain_sha256) {
      throw executeError(code);
    }
    const current = parseCanonicalValidatedJson(files[currentPath], validateChainManifest);
    if (current.candidate_id !== candidateId || current.chain_revision !== pointer.chain_revision) {
      throw executeError(code);
    }

    const checkpointByHash = new Map();
    const chainsByRevision = new Map();
    const directories = new Set();
    for (const [name, bytes] of Object.entries(files)) {
      if (!Buffer.isBuffer(bytes)) throw executeError(code);
      if (name === CURRENT_CHAIN_BASENAME) continue;
      if (!isAllowedImmutablePath(name)) throw executeError(code);
      addParentDirectories(directories, name);
      let match = CHECKPOINT_PATH.exec(name);
      if (match) {
        const checkpoint = parseCanonicalValidatedJson(bytes, validateCheckpointPayload);
        const revision = parseRevision(match[2]);
        if (
          ![1, 2].includes(revision)
          ||
          checkpoint.candidate_id !== candidateId
          || checkpoint.layer !== match[1]
          || checkpoint.revision !== revision
        ) throw executeError(code);
        const hash = sha256(bytes);
        if (checkpointByHash.has(hash)) throw executeError(code);
        checkpointByHash.set(hash, { checkpoint, name, hash });
        continue;
      }
      match = CHAIN_PATH.exec(name);
      if (match) {
        const chain = parseCanonicalValidatedJson(bytes, validateChainManifest);
        const revision = parseRevision(match[1]);
        if (chain.candidate_id !== candidateId || chain.chain_revision !== revision) {
          throw executeError(code);
        }
        if (chainsByRevision.has(revision)) throw executeError(code);
        chainsByRevision.set(revision, { chain, bytes, hash: sha256(bytes), name });
        continue;
      }
      if (name === REPAIR_REQUEST_PATH) {
        parseCanonicalValidatedJson(bytes, validateRepairEvidenceRequest);
      } else if (name === REPAIR_PATCH_PATH) {
        parseCanonicalValidatedJson(bytes, validateRepairTransaction);
      } else if (name === REPAIR_RESULT_PATH) {
        parseCanonicalValidatedJson(bytes, validateRepairEvidenceResult);
      } else if (name === FAILURE_PATH) {
        parseCanonicalValidatedJson(bytes, validateReplayFailureEvidence);
      } else if (name === REPAIR_PLANNING_FAILURE_PATH) {
        parseCanonicalValidatedJson(bytes, validateRepairPlanningFailureEvidence);
      } else if (name === FROZEN_DESIGN_PATH) {
        parseCanonicalValidatedJson(bytes, validateFrozenDesignEnvelope);
      } else if (name === FROZEN_CONTEXT_PATH) {
        parseCanonicalValidatedJson(bytes, validateFrozenGeneratorContext);
      } else if (name === OPERATION_LIST_PATH) {
        const operations = parseCanonicalValue(bytes, code);
        if (!Array.isArray(operations)) throw executeError(code);
      } else if (name === BUILD_FUNCTION_PATH) {
        if (bytes.length === 0) throw executeError(code);
      } else if (BLUEPRINT_PATH.test(name)) {
        if (![1, 2].includes(parseRevision(BLUEPRINT_PATH.exec(name)[1]))) throw executeError(code);
        parseJsonBytes(bytes, code);
      } else {
        parseCanonicalJson(bytes, code);
      }
    }

    if ([...chainsByRevision.keys()].some((revision) => revision < 1 || revision > 2)
      || !Array.from({ length: current.chain_revision }, (_, index) => index + 1)
        .every((revision) => chainsByRevision.has(revision))) throw executeError(code);
    const initialChain = chainsByRevision.get(1)?.chain;
    if (!initialChain) throw executeError(code);
    const referencedCheckpointHashes = new Set();
    for (let revision = 1; revision <= current.chain_revision; revision += 1) {
      const row = chainsByRevision.get(revision);
      if (!row) throw executeError(code);
      if (revision === 1) {
        if (row.chain.parent_chain_sha256 !== null || row.chain.created_from !== 'initial') {
          throw executeError(code);
        }
      } else {
        const previous = chainsByRevision.get(revision - 1);
        if (
          row.chain.parent_chain_sha256 !== previous.hash
          || row.chain.created_from !== 'replay'
          || row.chain.frozen_design_sha256 !== initialChain.frozen_design_sha256
          || row.chain.frozen_generator_context_sha256 !== initialChain.frozen_generator_context_sha256
        ) {
          throw executeError(code);
        }
      }
      const selected = [];
      for (const checkpointRow of row.chain.checkpoint_hashes) {
        referencedCheckpointHashes.add(checkpointRow.checkpoint_sha256);
        const stored = checkpointByHash.get(checkpointRow.checkpoint_sha256);
        if (!stored || stored.checkpoint.layer !== checkpointRow.layer || stored.checkpoint.status !== 'accepted') {
          throw executeError(code);
        }
        const expectedUpstream = selected.map((item) => ({
          layer: item.checkpoint.layer,
          checkpoint_sha256: item.hash
        }));
        if (!sameLayerHashes(stored.checkpoint.upstream_accepted_hashes, expectedUpstream)) {
          throw executeError(code);
        }
        selected.push(stored);
      }
      const finalCheckpoint = selected.at(-1).checkpoint;
      if (
        finalCheckpoint.hard_qa.hard_qa_sha256 !== row.chain.hard_qa_sha256
        || finalCheckpoint.design_review.p4_review_sha256 !== row.chain.p4_review_sha256
        || finalCheckpoint.hard_qa.hard_qa_ok !== row.chain.eligibility.hard_qa_ok
      ) throw executeError(code);
      assertStoredCheckpointOrigins(
        row.chain,
        selected,
        revision === 1 ? null : chainsByRevision.get(revision - 1),
        checkpointByHash,
        code
      );
      const hardQaName = `reviews/chain-${padRevision(revision)}-hard-qa.json`;
      const reviewName = `reviews/chain-${padRevision(revision)}-review.json`;
      if (files[hardQaName] && sha256(files[hardQaName]) !== row.chain.hard_qa_sha256) throw executeError(code);
      if (files[reviewName] && sha256(files[reviewName]) !== row.chain.p4_review_sha256) throw executeError(code);
    }
    const initialSelected = chainsByRevision.get(1).chain.checkpoint_hashes.map((row) => (
      checkpointByHash.get(row.checkpoint_sha256)
    ));
    if (initialSelected.some(({ checkpoint }) => checkpoint.revision !== 1)) throw executeError(code);
    if ([...checkpointByHash.values()].some(({ checkpoint, hash }) => (
      !referencedCheckpointHashes.has(hash)
      && !(current.chain_revision === 1 && checkpoint.revision === 2)
    ))) throw executeError(code);
    for (const name of Object.keys(files)) {
      const hardQa = HARD_QA_PATH.exec(name);
      const review = REVIEW_PATH.exec(name);
      if (hardQa || review) {
        const revision = parseRevision((hardQa ?? review)[1]);
        if (![1, 2].includes(revision)) throw executeError(code);
        if (revision > current.chain_revision) continue;
        const chain = chainsByRevision.get(revision)?.chain;
        const referencedHash = hardQa ? chain?.hard_qa_sha256 : chain?.p4_review_sha256;
        if (!chain || referencedHash !== sha256(files[name])) throw executeError(code);
      }
    }
    const currentStored = chainsByRevision.get(current.chain_revision);
    if (currentStored.hash !== pointer.chain_sha256) throw executeError(code);
    validatePersistedCandidateAuthority(files, new Map(
      [...chainsByRevision].filter(([revision]) => revision <= current.chain_revision)
    ), checkpointByHash, current, code);
    validateReplayEvidence(files, current, checkpointByHash, code, currentStored.hash, chainsByRevision);
    return Object.freeze({
      currentChainSha256: currentStored.hash,
      current,
      expectedDirectories: Object.freeze([...directories].sort())
    });
  } catch {
    throw executeError(code);
  }
}

export function normalizeSelectionFiles(files) {
  if (!isPlainObject(files) || !sameStrings(Reflect.ownKeys(files).sort(), [...SELECTION_PATHS].sort())) {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  const normalized = {};
  for (const name of SELECTION_PATHS) {
    const descriptor = Object.getOwnPropertyDescriptor(files, name);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || !Buffer.isBuffer(descriptor.value)) {
      throw executeError('P5_AUTHORITY_INVALID');
    }
    normalized[name] = Buffer.from(descriptor.value);
  }
  let manifest;
  let selection;
  try {
    manifest = parseCanonicalValidatedJson(normalized['manifest.json'], validateExecuteSelectionManifest);
    selection = parseCanonicalValidatedJson(normalized['selection.json'], validateSelectionRecord);
  } catch {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  for (const name of SELECTION_BODY_PATHS) {
    if (manifest.artifact_hashes[name] !== sha256(normalized[name])) throw executeError('P5_AUTHORITY_INVALID');
  }
  return Object.freeze({
    files: Object.freeze(normalized),
    selection,
    artifactHashes: Object.freeze({
      'selection.json': manifest.artifact_hashes['selection.json'],
      'selection-report.md': manifest.artifact_hashes['selection-report.md']
    })
  });
}

export function assertImmutableHistory(existingFiles, incomingFiles) {
  for (const [name, bytes] of Object.entries(existingFiles)) {
    if ([CURRENT_CHAIN_BASENAME, OPERATION_LIST_PATH, BUILD_FUNCTION_PATH].includes(name)) continue;
    if (!incomingFiles[name] || !incomingFiles[name].equals(bytes)) {
      throw executeError('P5_OUTPUT_OWNERSHIP');
    }
  }
}

export function expectedDirectoriesFor(files) {
  const directories = new Set();
  for (const name of Object.keys(files)) addParentDirectories(directories, name);
  return [...directories].sort();
}

export function assertCandidateId(candidateId) {
  if (!CANDIDATE_IDS.includes(candidateId)) throw executeError('P5_AUTHORITY_INVALID');
}

export function cloneFileMap(files) {
  return Object.freeze(Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes)])
  ));
}

export function sortFileMap(files) {
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)));
}

export function sameFileMap(left, right) {
  const leftNames = Object.keys(left).sort();
  const rightNames = Object.keys(right).sort();
  return sameStrings(leftNames, rightNames) && leftNames.every((name) => left[name].equals(right[name]));
}

function assertStoredCheckpointOrigins(chain, selected, previousChain, checkpointByHash, code) {
  if (chain.created_from === 'initial') {
    if (selected.some(({ checkpoint }) => checkpoint.replay_origin !== null)) throw executeError(code);
    return;
  }
  const previousByLayer = new Map(previousChain.chain.checkpoint_hashes.map((row) => [
    row.layer,
    checkpointByHash.get(row.checkpoint_sha256)
  ]));
  let replayStart = -1;
  for (const [index, stored] of selected.entries()) {
    const { checkpoint } = stored;
    const origin = checkpoint.replay_origin;
    const previous = previousByLayer.get(checkpoint.layer);
    if (!previous) throw executeError(code);
    if (origin === null) {
      if (replayStart >= 0 || stored.hash !== previous.hash) throw executeError(code);
      continue;
    }
    if (replayStart < 0) replayStart = index;
    if (
      origin.base_chain_sha256 !== chain.parent_chain_sha256
      || origin.repair_transaction_sha256 !== chain.repair_transaction_sha256
      || checkpoint.revision !== previous.checkpoint.revision + 1
    ) throw executeError(code);
  }
  if (replayStart < 0) throw executeError(code);
}

function parseCanonicalValidatedJson(bytes, validator) {
  const value = parseCanonicalJson(bytes, 'P5_CHECKPOINT_INVALID');
  const validated = validator(value);
  if (!Buffer.from(stableJson(validated), 'utf8').equals(bytes)) throw executeError('P5_CHECKPOINT_INVALID');
  return validated;
}

function parseCanonicalJson(bytes, code) {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(decoded);
    if (!isPlainObject(value) || !Buffer.from(stableJson(value), 'utf8').equals(bytes)) throw executeError(code);
    return value;
  } catch {
    throw executeError(code);
  }
}

function parseCanonicalValue(bytes, code) {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(decoded);
    if (!Buffer.from(stableJson(value), 'utf8').equals(bytes)) throw executeError(code);
    return value;
  } catch {
    throw executeError(code);
  }
}

function parseJsonBytes(bytes, code) {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(decoded);
    if (!isPlainObject(value)) throw executeError(code);
    return value;
  } catch {
    throw executeError(code);
  }
}

function parseCurrentPointer(bytes, code) {
  const pointer = parseCanonicalJson(bytes, code);
  if (!sameStrings(Object.keys(pointer), [
    'candidate_id', 'chain_revision', 'chain_sha256', 'schema_version'
  ]) || pointer.schema_version !== 1 || !CANDIDATE_IDS.includes(pointer.candidate_id)
    || ![1, 2].includes(pointer.chain_revision)
    || typeof pointer.chain_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(pointer.chain_sha256)) {
    throw executeError(code);
  }
  return pointer;
}

function validatePersistedCandidateAuthority(files, chainsByRevision, checkpointByHash, current, code) {
  const hasFrozenDesign = Buffer.isBuffer(files[FROZEN_DESIGN_PATH]);
  const hasFrozenContext = Buffer.isBuffer(files[FROZEN_CONTEXT_PATH]);
  if (!hasFrozenDesign || !hasFrozenContext) throw executeError(code);
  const frozenDesign = parseCanonicalValidatedJson(files[FROZEN_DESIGN_PATH], validateFrozenDesignEnvelope);
  const context = parseCanonicalValidatedJson(files[FROZEN_CONTEXT_PATH], validateFrozenGeneratorContext);
  const designHash = sha256(files[FROZEN_DESIGN_PATH]);
  const contextHash = sha256(files[FROZEN_CONTEXT_PATH]);
  if (context.candidate_id !== frozenDesign.candidate_id || context.seed !== frozenDesign.seed
    || context.frozen_design_sha256 !== designHash) throw executeError(code);
  for (const [revision, { chain }] of chainsByRevision) {
    if (chain.candidate_id !== frozenDesign.candidate_id
      || chain.frozen_design_sha256 !== designHash
      || chain.frozen_generator_context_sha256 !== contextHash) throw executeError(code);
    const suffix = padRevision(revision);
    const blueprintBytes = files[`blueprints/chain-${suffix}.json`];
    const hardQaBytes = files[`reviews/chain-${suffix}-hard-qa.json`];
    const reviewBytes = files[`reviews/chain-${suffix}-review.json`];
    if (!blueprintBytes || !hardQaBytes || !reviewBytes
      || sha256(blueprintBytes) !== chain.blueprint_sha256
      || sha256(hardQaBytes) !== chain.hard_qa_sha256
      || sha256(reviewBytes) !== chain.p4_review_sha256) throw executeError(code);
    const blueprint = parseJsonBytes(blueprintBytes, code);
    const hardQa = parseCanonicalJson(hardQaBytes, code);
    const recomputed = new BlueprintQAAgent().run(blueprint);
    if (stableJson(recomputed) !== stableJson(hardQa)) throw executeError(code);
    const review = validateReview(parseCanonicalJson(reviewBytes, code));
    assertReviewCandidateAuthority(review, {
      blueprint_sha256: chain.blueprint_sha256,
      workflow: 'construction_method_v1',
      seed: context.seed
    });
  }
  const operationListBytes = files[OPERATION_LIST_PATH];
  const buildFunctionBytes = files[BUILD_FUNCTION_PATH];
  if (!Buffer.isBuffer(operationListBytes) || !Buffer.isBuffer(buildFunctionBytes)
    || buildFunctionBytes.length === 0) throw executeError(code);
  const operations = parseCanonicalValue(operationListBytes, code);
  if (!Array.isArray(operations)) throw executeError(code);
  const currentBlueprint = parseJsonBytes(
    files[`blueprints/chain-${padRevision(current.chain_revision)}.json`], code
  );
  if (!Array.isArray(currentBlueprint.operations)
    || stableJson(currentBlueprint.operations) !== stableJson(operations)) throw executeError(code);
  const facadeRow = current.checkpoint_hashes.find((row) => row.layer === 'facade');
  const facade = checkpointByHash.get(facadeRow?.checkpoint_sha256)?.checkpoint;
  if (!facade
    || facade.compiled_artifact_hashes.operation_list_sha256 !== sha256(operationListBytes)
    || facade.compiled_artifact_hashes.build_function_sha256 !== sha256(buildFunctionBytes)) {
    throw executeError(code);
  }
}

function isAllowedImmutablePath(value) {
  return typeof value === 'string'
    && !UNSAFE_PATH_CHARACTER.test(value)
    && (CHECKPOINT_PATH.test(value) || CHAIN_PATH.test(value) || HARD_QA_PATH.test(value)
      || REVIEW_PATH.test(value) || BLUEPRINT_PATH.test(value)
      || value === FROZEN_DESIGN_PATH || value === FROZEN_CONTEXT_PATH
      || value === OPERATION_LIST_PATH || value === BUILD_FUNCTION_PATH
      || [REPAIR_REQUEST_PATH, REPAIR_PATCH_PATH, REPAIR_RESULT_PATH, FAILURE_PATH, REPAIR_PLANNING_FAILURE_PATH].includes(value));
}

function validateReplayEvidence(files, current, checkpointByHash, code, currentChainHash, chainsByRevision) {
  const repairNames = [REPAIR_REQUEST_PATH, REPAIR_PATCH_PATH, REPAIR_RESULT_PATH];
  const count = repairNames.filter((name) => files[name]).length;
  if (current.chain_revision === 2 && count !== repairNames.length) throw executeError(code);
  if (current.chain_revision === 2 && count === repairNames.length) {
    const request = parseCanonicalValidatedJson(files[REPAIR_REQUEST_PATH], validateRepairEvidenceRequest);
    const transaction = parseCanonicalValidatedJson(files[REPAIR_PATCH_PATH], validateRepairTransaction);
    const result = parseCanonicalValidatedJson(files[REPAIR_RESULT_PATH], validateRepairEvidenceResult);
    const facadeArtifacts = checkpointByHash.get(current.checkpoint_hashes[4].checkpoint_sha256)?.checkpoint.compiled_artifact_hashes;
    if (!sameStrings(Object.keys(facadeArtifacts || {}).sort(), [
      'build_function_sha256', 'datapack_tree_sha256', 'layer_payload_sha256',
      'operation_list_sha256', 'repair_result_sha256'
    ]) || sha256(files[REPAIR_PATCH_PATH]) !== request.repair_transaction_sha256
      || sha256(files[REPAIR_PATCH_PATH]) !== result.repair_transaction_sha256
      || sha256(files[REPAIR_REQUEST_PATH]) !== result.repair_request_sha256
      || request.candidate_id !== current.candidate_id || transaction.candidate_id !== current.candidate_id || result.candidate_id !== current.candidate_id
      || request.base_chain_sha256 !== transaction.base_chain_sha256 || result.base_chain_sha256 !== transaction.base_chain_sha256
      || transaction.base_chain_sha256 !== current.parent_chain_sha256
      || request.requests.length !== transaction.operations.length
      || request.requests.some((item, index) => !sameRequestProjection(item, transaction.operations[index]))
      || current.repair_transaction_sha256 !== result.repair_transaction_sha256
      || current.blueprint_sha256 !== result.blueprint_sha256 || current.hard_qa_sha256 !== result.hard_qa_sha256
      || current.p4_review_sha256 !== result.p4_review_sha256
      || facadeArtifacts.repair_result_sha256 !== sha256(files[REPAIR_RESULT_PATH])
      || stableJson(current.eligibility) !== stableJson(result.eligibility)) throw executeError(code);
    const initial = chainsByRevision.get(1)?.chain;
    const replayStart = current.checkpoint_hashes.findIndex((row, index) => (
      row.checkpoint_sha256 !== initial?.checkpoint_hashes[index]?.checkpoint_sha256
    ));
    if (replayStart !== LAYERS.indexOf(transaction.earliest_target_layer)
      || transaction.operations.some((operation) => operation.base_checkpoint_sha256
        !== initial.checkpoint_hashes[LAYERS.indexOf(operation.target_layer)]?.checkpoint_sha256)) {
      throw executeError(code);
    }
  }
  if (files[FAILURE_PATH]) {
    const failure = parseCanonicalValidatedJson(files[FAILURE_PATH], validateReplayFailureEvidence);
    if (failure.candidate_id !== current.candidate_id || failure.current_chain_sha256 !== currentChainHash) throw executeError(code);
  }
  if (files[REPAIR_PLANNING_FAILURE_PATH]) {
    const failure = parseCanonicalValidatedJson(files[REPAIR_PLANNING_FAILURE_PATH], validateRepairPlanningFailureEvidence);
    if (failure.candidate_id !== current.candidate_id || failure.current_chain_sha256 !== currentChainHash
      || count !== 0 || files[FAILURE_PATH] || current.repair_transaction_sha256 !== null) throw executeError(code);
  }
  if (current.chain_revision === 2 && count === repairNames.length
    && (files[FAILURE_PATH] || files[REPAIR_PLANNING_FAILURE_PATH])) throw executeError(code);
}

export function selectionProjectionForCandidateEvidence(candidateId, files, { requireCurrentReviews = false } = {}) {
  const validated = validateCandidateEvidence(candidateId, files, 'P5_OUTPUT_OWNERSHIP');
  if (validated.kind === 'initial-failed') {
    const hardQaBody = files[INITIAL_HARD_QA_PATH] ? parseCanonicalJson(files[INITIAL_HARD_QA_PATH], 'P5_OUTPUT_OWNERSHIP') : null;
    return Object.freeze({
      kind: 'initial-failed', current_chain_sha256: null, hard_qa_sha256: null, p4_review_sha256: null,
      eligibility: Object.freeze({
        status: validated.failure.stage === 'hard-qa' || validated.failure.code === 'P5_HARD_QA_FAILED' ? 'hard-qa-failed' : 'replay-failed',
        hard_qa_ok: hardQaBody?.ok === true,
        unresolved_violated_core_rule_ids: Object.freeze([]), neutral_unknown_rule_ids: Object.freeze([]),
        neutral_not_applicable_rule_ids: Object.freeze([]), repair_budget_used: 0
      }),
      repair_attempt_count: 0
    });
  }
  const current = validated.current;
  const currentHash = validated.currentChainSha256;
  const context = parseCanonicalValidatedJson(files[FROZEN_CONTEXT_PATH], validateFrozenGeneratorContext);
  if (requireCurrentReviews) {
    const revision = padRevision(current.chain_revision);
    const hardQaPath = `reviews/chain-${revision}-hard-qa.json`;
    const reviewPath = `reviews/chain-${revision}-review.json`;
    if (!files[hardQaPath] || !files[reviewPath]
      || sha256(files[hardQaPath]) !== current.hard_qa_sha256
      || sha256(files[reviewPath]) !== current.p4_review_sha256) throw executeError('P5_OUTPUT_OWNERSHIP');
    parseCanonicalJson(files[hardQaPath], 'P5_OUTPUT_OWNERSHIP');
    parseCanonicalJson(files[reviewPath], 'P5_OUTPUT_OWNERSHIP');
  }
  let eligibility = current.eligibility;
  let repairAttemptCount = current.repair_transaction_sha256 === null ? current.eligibility.repair_budget_used : 1;
  if (files[REPAIR_PLANNING_FAILURE_PATH]) {
    const failure = parseCanonicalValidatedJson(files[REPAIR_PLANNING_FAILURE_PATH], validateRepairPlanningFailureEvidence);
    if (failure.current_chain_sha256 !== currentHash) throw executeError('P5_OUTPUT_OWNERSHIP');
    eligibility = deriveFailureEligibilityOverlay(current.eligibility, { kind: 'repair-planning', code: failure.code });
    repairAttemptCount = 1;
  } else if (files[FAILURE_PATH]) {
    const failure = parseCanonicalValidatedJson(files[FAILURE_PATH], validateReplayFailureEvidence);
    if (failure.current_chain_sha256 !== currentHash) throw executeError('P5_OUTPUT_OWNERSHIP');
    eligibility = deriveFailureEligibilityOverlay(current.eligibility, { kind: 'replay', code: failure.code });
    repairAttemptCount = 1;
  }
  return Object.freeze({ kind: 'accepted', seed: context.seed, current_chain_sha256: currentHash,
    hard_qa_sha256: current.hard_qa_sha256, p4_review_sha256: current.p4_review_sha256,
    eligibility, repair_attempt_count: repairAttemptCount });
}

export function deriveFailureEligibilityOverlay(chainEligibility, { kind, code } = {}) {
  const eligibility = validateEligibilityRecord(chainEligibility);
  const status = kind === 'repair-planning'
    ? 'repair-invalid'
    : kind === 'replay' && ['P5_REPAIR_INVALID', 'P5_REPAIR_CONFLICT'].includes(code)
      ? 'repair-invalid'
      : kind === 'replay'
        ? 'replay-failed'
        : null;
  if (!status) throw executeError('P5_AUTHORITY_INVALID');
  return Object.freeze({ ...eligibility, status, repair_budget_used: 1 });
}

function sameRequestProjection(request, patch) {
  return request.schema_version === patch.schema_version && request.candidate_id === patch.candidate_id
    && request.rule_id === patch.rule_id && request.repair_operation_id === patch.repair_operation_id
    && request.variant_id === patch.variant_id && request.base_checkpoint_sha256 === patch.base_checkpoint_sha256;
}

function sameLayerHashes(left, right) {
  return left.length === right.length && left.every((row, index) => (
    row.layer === right[index].layer && row.checkpoint_sha256 === right[index].checkpoint_sha256
  ));
}

function addParentDirectories(output, filename) {
  let parent = path.posix.dirname(filename);
  while (parent !== '.') {
    output.add(parent);
    parent = path.posix.dirname(parent);
  }
}

function chainPath(revision) {
  return `chains/chain-${padRevision(revision)}.json`;
}

function padRevision(revision) {
  if (!Number.isInteger(revision) || revision < 1 || revision > 9999) throw executeError('P5_CHECKPOINT_INVALID');
  return String(revision).padStart(4, '0');
}

function parseRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1 || revision > 9999) throw executeError('P5_CHECKPOINT_INVALID');
  return revision;
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
