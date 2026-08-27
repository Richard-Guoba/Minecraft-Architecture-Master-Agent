import path from 'node:path';
import { sha256, stableJson } from '../shadow/canonical.js';
import {
  executeError,
  validateChainManifest,
  validateCheckpointPayload,
  validateExecuteSelectionManifest,
  validateSelectionRecord
} from './contracts.js';

export const CANDIDATE_IDS = Object.freeze(['candidate-01', 'candidate-02', 'candidate-03']);
export const LAYERS = Object.freeze(['brief', 'massing', 'structure', 'roof', 'facade']);
export const CURRENT_CHAIN_BASENAME = 'current-chain.json';
export const SELECTION_PATHS = Object.freeze(['manifest.json', 'selection.json', 'selection-report.md']);

const SELECTION_BODY_PATHS = Object.freeze(['selection.json', 'selection-report.md']);
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const REVISION = '[0-9]{4}';
const CHECKPOINT_PATH = new RegExp(`^checkpoints/(${LAYERS.join('|')})/r(${REVISION})\\.json$`, 'u');
const CHAIN_PATH = new RegExp(`^chains/chain-(${REVISION})\\.json$`, 'u');
const HARD_QA_PATH = new RegExp(`^reviews/chain-(${REVISION})-hard-qa\\.json$`, 'u');
const REVIEW_PATH = new RegExp(`^reviews/chain-(${REVISION})-review\\.json$`, 'u');

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
  const installedFiles = Object.freeze(sortFileMap({
    ...immutableFiles,
    [currentChainPath]: Buffer.from(currentChainBytes),
    [CURRENT_CHAIN_BASENAME]: Buffer.from(currentChainBytes)
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
    normalized[name] = Buffer.from(descriptor.value);
  }
  return Object.freeze(sortFileMap(normalized));
}

export function validateCandidateFiles(candidateId, files, code) {
  try {
    if (!isPlainObject(files) || !Buffer.isBuffer(files[CURRENT_CHAIN_BASENAME])) {
      throw executeError(code);
    }
    const current = parseCanonicalValidatedJson(files[CURRENT_CHAIN_BASENAME], validateChainManifest);
    if (current.candidate_id !== candidateId) throw executeError(code);
    const currentPath = chainPath(current.chain_revision);
    if (!Buffer.isBuffer(files[currentPath]) || !files[currentPath].equals(files[CURRENT_CHAIN_BASENAME])) {
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
      parseCanonicalJson(bytes, code);
    }

    if (chainsByRevision.size !== current.chain_revision) throw executeError(code);
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
    if (
      checkpointByHash.size !== referencedCheckpointHashes.size
      || [...checkpointByHash.keys()].some((hash) => !referencedCheckpointHashes.has(hash))
    ) throw executeError(code);
    for (const name of Object.keys(files)) {
      const hardQa = HARD_QA_PATH.exec(name);
      const review = REVIEW_PATH.exec(name);
      if (hardQa || review) {
        const chain = chainsByRevision.get(parseRevision((hardQa ?? review)[1]))?.chain;
        const referencedHash = hardQa ? chain?.hard_qa_sha256 : chain?.p4_review_sha256;
        if (!chain || referencedHash !== sha256(files[name])) throw executeError(code);
      }
    }
    const currentStored = chainsByRevision.get(current.chain_revision);
    if (!currentStored.bytes.equals(files[CURRENT_CHAIN_BASENAME])) throw executeError(code);
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
  try {
    manifest = parseCanonicalValidatedJson(normalized['manifest.json'], validateExecuteSelectionManifest);
    parseCanonicalValidatedJson(normalized['selection.json'], validateSelectionRecord);
  } catch {
    throw executeError('P5_AUTHORITY_INVALID');
  }
  for (const name of SELECTION_BODY_PATHS) {
    if (manifest.artifact_hashes[name] !== sha256(normalized[name])) throw executeError('P5_AUTHORITY_INVALID');
  }
  return Object.freeze({
    files: Object.freeze(normalized),
    artifactHashes: Object.freeze({
      'selection.json': manifest.artifact_hashes['selection.json'],
      'selection-report.md': manifest.artifact_hashes['selection-report.md']
    })
  });
}

export function assertImmutableHistory(existingFiles, incomingFiles) {
  for (const [name, bytes] of Object.entries(existingFiles)) {
    if (name === CURRENT_CHAIN_BASENAME) continue;
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

function isAllowedImmutablePath(value) {
  return typeof value === 'string'
    && !UNSAFE_PATH_CHARACTER.test(value)
    && (CHECKPOINT_PATH.test(value) || CHAIN_PATH.test(value) || HARD_QA_PATH.test(value) || REVIEW_PATH.test(value));
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
