import { createHash } from 'node:crypto';
import { TrainingDataError, assertSourceId } from './trainingError.js';

const SPLITS = Object.freeze(['train', 'validation', 'test']);
const RATIOS = Object.freeze({
  train: 0.70,
  validation: 0.15,
  test: 0.15
});

export function buildSourceSplit({ sources, seed = 7101 } = {}) {
  const normalized = validateSources(sources);
  if (
    !Number.isSafeInteger(seed)
    || seed < 0
    || seed > 0xffffffff
  ) {
    throw new TrainingDataError('SPLIT_SEED_INVALID', String(seed));
  }
  const groups = duplicateGroups(normalized);
  if (groups.length < SPLITS.length) {
    throw new TrainingDataError(
      'SPLIT_TOO_SMALL',
      `${groups.length} duplicate groups`,
      { group_count: groups.length, source_count: normalized.length }
    );
  }
  groups.sort((left, right) => (
    splitKey(seed, left.canonical_source_id)
      .localeCompare(splitKey(seed, right.canonical_source_id))
    || left.canonical_source_id.localeCompare(right.canonical_source_id)
  ));

  const targets = sourceTargets(normalized.length);
  const assignedCounts = Object.fromEntries(
    SPLITS.map((split) => [split, 0])
  );
  const assignedGroups = Object.fromEntries(
    SPLITS.map((split) => [split, 0])
  );
  const assignments = new Map();

  groups.forEach((group, index) => {
    const remainingGroupCount = groups.length - index;
    const emptySplits = SPLITS.filter(
      (split) => assignedGroups[split] === 0
    );
    const candidates = remainingGroupCount === emptySplits.length
      ? emptySplits
      : SPLITS;
    const split = candidates.reduce((best, candidate) => {
      const bestRemaining = targets[best] - assignedCounts[best];
      const candidateRemaining = (
        targets[candidate] - assignedCounts[candidate]
      );
      return candidateRemaining > bestRemaining ? candidate : best;
    });
    for (const sourceId of group.source_ids) {
      assignments.set(sourceId, split);
    }
    assignedCounts[split] += group.source_ids.length;
    assignedGroups[split] += 1;
  });

  const orderedIds = [...assignments.keys()].sort();
  const assignmentRecord = Object.fromEntries(
    orderedIds.map((sourceId) => [sourceId, assignments.get(sourceId)])
  );
  return deepFreeze({
    train_source_ids: idsForSplit(assignmentRecord, 'train'),
    validation_source_ids: idsForSplit(assignmentRecord, 'validation'),
    test_source_ids: idsForSplit(assignmentRecord, 'test'),
    assignments: assignmentRecord
  });
}

function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new TrainingDataError('SPLIT_SOURCES_INVALID', 'empty sources');
  }
  const seen = new Set();
  return sources.map((source) => {
    const sourceId = assertSourceId(source?.source_id);
    if (seen.has(sourceId)) {
      throw new TrainingDataError('SPLIT_SOURCE_DUPLICATE', sourceId);
    }
    seen.add(sourceId);
    if (!validHash(source.content_sha256)) {
      throw new TrainingDataError('SPLIT_CONTENT_HASH_INVALID', sourceId);
    }
    const structureHash = (
      source.structural_fingerprint?.canonical_structure_sha256
      || source.structural_fingerprint?.yaw_canonical_sha256
    );
    if (!validHash(structureHash)) {
      throw new TrainingDataError('SPLIT_STRUCTURE_HASH_INVALID', sourceId);
    }
    return {
      source_id: sourceId,
      content_sha256: source.content_sha256,
      structure_sha256: structureHash
    };
  });
}

function duplicateGroups(sources) {
  const parent = sources.map((_, index) => index);
  const contentOwners = new Map();
  const structureOwners = new Map();
  sources.forEach((source, index) => {
    joinOwner(contentOwners, source.content_sha256, index, parent);
    joinOwner(structureOwners, source.structure_sha256, index, parent);
  });
  const grouped = new Map();
  sources.forEach((source, index) => {
    const root = find(parent, index);
    const sourceIds = grouped.get(root) || [];
    sourceIds.push(source.source_id);
    grouped.set(root, sourceIds);
  });
  return [...grouped.values()].map((sourceIds) => {
    sourceIds.sort();
    return {
      canonical_source_id: sourceIds[0],
      source_ids: sourceIds
    };
  });
}

function joinOwner(owners, key, index, parent) {
  if (owners.has(key)) {
    union(parent, index, owners.get(key));
  } else {
    owners.set(key, index);
  }
}

function find(parent, index) {
  let root = index;
  while (parent[root] !== root) root = parent[root];
  while (parent[index] !== index) {
    const next = parent[index];
    parent[index] = root;
    index = next;
  }
  return root;
}

function union(parent, left, right) {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) parent[leftRoot] = rightRoot;
}

function sourceTargets(sourceCount) {
  const raw = Object.fromEntries(
    SPLITS.map((split) => [split, sourceCount * RATIOS[split]])
  );
  const targets = Object.fromEntries(
    SPLITS.map((split) => [split, Math.floor(raw[split])])
  );
  let remaining = sourceCount - SPLITS.reduce(
    (sum, split) => sum + targets[split],
    0
  );
  const remainderOrder = [...SPLITS].sort((left, right) => (
    (raw[right] - Math.floor(raw[right]))
    - (raw[left] - Math.floor(raw[left]))
    || SPLITS.indexOf(left) - SPLITS.indexOf(right)
  ));
  for (const split of remainderOrder) {
    if (remaining === 0) break;
    targets[split] += 1;
    remaining -= 1;
  }
  for (const split of SPLITS) {
    if (targets[split] > 0) continue;
    const donor = [...SPLITS]
      .filter((candidate) => targets[candidate] > 1)
      .sort((left, right) => (
        targets[right] - targets[left]
        || SPLITS.indexOf(left) - SPLITS.indexOf(right)
      ))[0];
    if (donor) {
      targets[donor] -= 1;
      targets[split] += 1;
    }
  }
  return targets;
}

function splitKey(seed, sourceId) {
  return createHash('sha256')
    .update(`${seed}:${sourceId}`)
    .digest('hex');
}

function idsForSplit(assignments, split) {
  return Object.keys(assignments).filter(
    (sourceId) => assignments[sourceId] === split
  );
}

function validHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
