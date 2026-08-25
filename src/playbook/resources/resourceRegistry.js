import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { failPlaybookContract } from '../contracts/playbookContractError.js';
import {
  validateResourceCatalog,
  validateResourceProbeReport,
  validateResourcePromotionDecision,
  validateResourceSourceProfile
} from './contracts/index.js';

const RESOURCE_ROOT = 'docs/architecture-playbook/resources';
const SCHEMA_PATHS = Object.freeze([
  'schemas/catalog.schema.json',
  'schemas/probe-report.schema.json',
  'schemas/promotion-decision.schema.json',
  'schemas/source-profile.schema.json'
]);

export async function loadResourceRegistry(options = {}) {
  if (!isPlainObject(options)) {
    failPlaybookContract('PLAYBOOK_RESOURCE_OPTIONS_INVALID', 'options', 'expected object');
  }
  const { projectRoot } = options;
  const resourceRoot = await resolveResourceRoot(projectRoot);
  const reader = createContainedReader(resourceRoot);
  const catalog = validateResourceCatalog(await reader.readJson('catalog.json'));
  const seenProfileUrls = new Map();
  const seenProbeIds = new Map();
  const seenProbeUrls = new Map();
  const sources = [];

  for (const entry of catalog.sources) {
    const profile = validateResourceSourceProfile(await reader.readJson(entry.profile_path));
    assertCatalogProfileBinding(entry, profile);
    assertProfileUrlsUnique(profile, seenProfileUrls);
    const sourceRoot = `sources/${entry.source_id}`;
    const probePaths = await reader.listJsonFiles(`${sourceRoot}/probes`);
    const probes = [];
    for (const probePath of probePaths) {
      const probe = validateResourceProbeReport(await reader.readJson(probePath));
      assertProbeBinding(profile, probe, probePath, seenProbeIds, seenProbeUrls);
      probes.push(probe);
    }
    const assessment = await loadAssessment(reader, profile, probes);
    const decisionPaths = await reader.listJsonFiles(`${sourceRoot}/decisions`);
    const decisions = await loadDecisions(
      reader, profile, assessment, probes, decisionPaths
    );
    sources.push(deepFreeze({ entry, profile, probes, assessment, decisions }));
  }

  await assertPublicBoundary(reader, catalog, sources);
  return deepFreeze({ schema_version: 1, catalog, sources });
}

export async function auditResourceRegistry(options = {}) {
  if (!isPlainObject(options)) {
    failPlaybookContract('PLAYBOOK_RESOURCE_OPTIONS_INVALID', 'options', 'expected object');
  }
  const { projectRoot, expectedProbeCounts = {} } = options;
  if (!isPlainObject(expectedProbeCounts)) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PROBE_COUNT_INVALID', 'expectedProbeCounts', 'expected object'
    );
  }
  const registry = await loadResourceRegistry({ projectRoot });
  const actualProbeCounts = new Map(
    registry.sources.map((source) => [source.entry.source_id, source.probes.length])
  );
  for (const [sourceId, expected] of Object.entries(expectedProbeCounts)) {
    if (!Number.isInteger(expected) || expected < 0) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_PROBE_COUNT_INVALID',
        `expectedProbeCounts.${sourceId}`,
        expected
      );
    }
    const actual = actualProbeCounts.get(sourceId) ?? 0;
    if (actual !== expected) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_PROBE_COUNT_MISMATCH',
        `expectedProbeCounts.${sourceId}`,
        `expected ${expected}, received ${actual}`
      );
    }
  }
  return deepFreeze({
    schema_version: 1,
    source_count: registry.sources.length,
    probe_count: registry.sources.reduce((count, source) => count + source.probes.length, 0),
    decision_count: registry.sources.reduce((count, source) => count + source.decisions.length, 0),
    cross_source_reference_count: 0,
    private_path_leak_count: 0,
    unexpected_file_count: 0,
    gate: { status: 'passed', blocker_codes: [] }
  });
}

async function resolveResourceRoot(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    failPlaybookContract('PLAYBOOK_RESOURCE_PROJECT_ROOT_INVALID', 'projectRoot', projectRoot);
  }
  let canonicalProjectRoot;
  try {
    canonicalProjectRoot = await realpath(resolve(projectRoot));
    const projectStat = await stat(canonicalProjectRoot);
    if (!projectStat.isDirectory()) throw new Error('project root is not a directory');
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PATH_INVALID',
      'projectRoot',
      error?.message || 'project root is unavailable'
    );
  }
  const expectedResourceRoot = resolve(canonicalProjectRoot, RESOURCE_ROOT);
  let resourceRoot;
  try {
    resourceRoot = await realpath(expectedResourceRoot);
    const rootStat = await stat(resourceRoot);
    if (!rootStat.isDirectory()) throw new Error('resource root is not a directory');
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PATH_INVALID',
      RESOURCE_ROOT,
      error?.message || 'resource root is unavailable'
    );
  }
  if (resourceRoot !== expectedResourceRoot) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PATH_ESCAPE',
      RESOURCE_ROOT,
      `${resourceRoot} resolves away from ${expectedResourceRoot}`
    );
  }
  return resourceRoot;
}

function createContainedReader(resourceRoot) {
  async function containedRealpath(resourcePath, expectedKind) {
    const candidate = resolve(resourceRoot, resourcePath);
    if (!isContained(resourceRoot, candidate)) {
      failPlaybookContract('PLAYBOOK_RESOURCE_PATH_ESCAPE', resourcePath, candidate);
    }
    let resolved;
    try {
      resolved = await realpath(candidate);
    } catch (error) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_PATH_INVALID',
        resourcePath,
        error?.message || 'resource path is unavailable'
      );
    }
    if (!isContained(resourceRoot, resolved)) {
      failPlaybookContract('PLAYBOOK_RESOURCE_PATH_ESCAPE', resourcePath, resolved);
    }
    try {
      const pathStat = await stat(resolved);
      if (
        (expectedKind === 'file' && !pathStat.isFile())
        || (expectedKind === 'directory' && !pathStat.isDirectory())
      ) {
        failPlaybookContract(
          'PLAYBOOK_RESOURCE_PATH_INVALID', resourcePath, `expected ${expectedKind}`
        );
      }
    } catch (error) {
      if (error?.name === 'PlaybookContractError') throw error;
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_PATH_INVALID',
        resourcePath,
        error?.message || 'resource path cannot be inspected'
      );
    }
    return resolved;
  }

  async function readBytes(resourcePath) {
    const resolved = await containedRealpath(resourcePath, 'file');
    try {
      return await readFile(resolved);
    } catch (error) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_READ_FAILED', resourcePath, error?.message || 'read failed'
      );
    }
  }

  return {
    async readJson(resourcePath) {
      const bytes = await readBytes(resourcePath);
      let value;
      try {
        value = JSON.parse(bytes.toString('utf8'));
      } catch (error) {
        failPlaybookContract(
          'PLAYBOOK_RESOURCE_JSON_INVALID', resourcePath, error?.message || 'invalid JSON'
        );
      }
      assertPersistedJsonHasNoPrivatePaths(value, resourcePath);
      return value;
    },
    readBytes,
    async walk() {
      const entries = [];
      async function visit(directoryPath) {
        const resolved = directoryPath === ''
          ? resourceRoot
          : await containedRealpath(directoryPath, 'directory');
        let children;
        try {
          children = await readdir(resolved, { withFileTypes: true });
        } catch (error) {
          failPlaybookContract(
            'PLAYBOOK_RESOURCE_READ_FAILED',
            directoryPath || '.',
            error?.message || 'directory read failed'
          );
        }
        children.sort((left, right) => left.name.localeCompare(right.name));
        for (const child of children) {
          const childPath = directoryPath ? `${directoryPath}/${child.name}` : child.name;
          entries.push({ path: childPath, directory: child.isDirectory() });
          if (child.isDirectory()) await visit(childPath);
        }
      }
      await visit('');
      return entries;
    },
    async listJsonFiles(resourceDirectory) {
      let resolved;
      try {
        resolved = await containedRealpath(resourceDirectory, 'directory');
      } catch (error) {
        if (
          error?.name === 'PlaybookContractError'
          && String(error.detail).includes('ENOENT')
        ) return [];
        throw error;
      }
      let entries;
      try {
        entries = await readdir(resolved, { withFileTypes: true });
      } catch (error) {
        failPlaybookContract(
          'PLAYBOOK_RESOURCE_READ_FAILED',
          resourceDirectory,
          error?.message || 'directory read failed'
        );
      }
      return entries
        .filter((entry) => entry.name.endsWith('.json'))
        .map((entry) => `${resourceDirectory}/${entry.name}`)
        .sort();
    }
  };
}

function isContained(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function assertCatalogProfileBinding(entry, profile) {
  const bindings = [
    ['source_id', profile.source_id],
    ['title', profile.title],
    ['lifecycle_status', profile.lifecycle_status],
    ['profile_path', `sources/${profile.source_id}/source.json`],
    ['assessment_path', profile.assessment?.path ?? null]
  ];
  for (const [field, profileValue] of bindings) {
    if (entry[field] !== profileValue) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_CATALOG_PROFILE_MISMATCH',
        `ResourceCatalog.sources.${entry.source_id}.${field}`,
        `${entry[field]} does not match ${profileValue}`
      );
    }
  }
}

function assertProfileUrlsUnique(profile, seenUrls) {
  for (const url of [profile.canonical_url, ...profile.alternate_urls]) {
    const normalized = normalizeUrl(url);
    const priorSourceId = seenUrls.get(normalized);
    if (priorSourceId !== undefined) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_URL_DUPLICATE',
        `ResourceSourceProfile.${profile.source_id}`,
        `${url} duplicates ${priorSourceId}`
      );
    }
    seenUrls.set(normalized, profile.source_id);
  }
}

function assertProbeBinding(profile, probe, probePath, seenIds, seenUrls) {
  if (probe.source_id !== profile.source_id) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PROBE_SOURCE_MISMATCH', probePath, probe.source_id
    );
  }
  const allowedHosts = new Set(
    [profile.canonical_url, ...profile.alternate_urls].map((url) => new URL(url).hostname)
  );
  if (!allowedHosts.has(new URL(probe.canonical_url).hostname)) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PROBE_HOST_MISMATCH', probePath, probe.canonical_url
    );
  }
  const priorIdSource = seenIds.get(probe.probe_id);
  if (priorIdSource !== undefined) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PROBE_ID_DUPLICATE', probePath, priorIdSource
    );
  }
  seenIds.set(probe.probe_id, profile.source_id);
  const normalizedUrl = normalizeUrl(probe.canonical_url);
  const priorUrlSource = seenUrls.get(normalizedUrl);
  if (priorUrlSource !== undefined) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_PROBE_URL_DUPLICATE', probePath, priorUrlSource
    );
  }
  seenUrls.set(normalizedUrl, profile.source_id);
}

async function loadAssessment(reader, profile, probes) {
  if (profile.assessment === null) return null;
  const bytes = await reader.readBytes(profile.assessment.path);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_ASSESSMENT_UTF8_INVALID', profile.assessment.path, 'invalid UTF-8'
    );
  }
  assertNoPrivatePath(text, profile.assessment.path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== profile.assessment.sha256) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_ASSESSMENT_HASH_MISMATCH',
      profile.assessment.path,
      `${sha256} does not match ${profile.assessment.sha256}`
    );
  }
  const discoveredProbeIds = probes.map((probe) => probe.probe_id).sort();
  const assessmentProbeIds = [...profile.assessment.probe_ids].sort();
  if (
    discoveredProbeIds.length !== assessmentProbeIds.length
    || discoveredProbeIds.some((probeId, index) => probeId !== assessmentProbeIds[index])
  ) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_ASSESSMENT_PROBE_SET_MISMATCH',
      profile.assessment.path,
      'assessment probe IDs must equal discovered probe IDs'
    );
  }
  return deepFreeze({
    path: profile.assessment.path,
    text,
    sha256
  });
}

async function loadDecisions(reader, profile, assessment, probes, decisionPaths) {
  if (!arraysEqual([...decisionPaths].sort(), [...profile.decision_history].sort())) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_DECISION_HISTORY_MISMATCH',
      `ResourceSourceProfile.${profile.source_id}.decision_history`,
      'discovered decisions must equal decision_history'
    );
  }
  const decisions = [];
  let previousDecidedAt = null;
  const probeIds = probes.map((probe) => probe.probe_id).sort();
  for (const decisionPath of profile.decision_history) {
    const decision = validateResourcePromotionDecision(await reader.readJson(decisionPath));
    if (decision.source_id !== profile.source_id) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_DECISION_SOURCE_MISMATCH', decisionPath, decision.source_id
      );
    }
    if (basename(decisionPath) !== `${decision.decision_id}.json`) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_DECISION_ID_MISMATCH', decisionPath, decision.decision_id
      );
    }
    if (previousDecidedAt !== null && previousDecidedAt >= decision.decided_at) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_DECISION_ORDER_INVALID', decisionPath, decision.decided_at
      );
    }
    if (assessment === null || decision.assessment_path !== assessment.path) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_DECISION_ASSESSMENT_PATH_MISMATCH',
        decisionPath,
        decision.assessment_path
      );
    }
    if (decision.assessment_sha256 !== assessment.sha256) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_DECISION_ASSESSMENT_HASH_MISMATCH',
        decisionPath,
        decision.assessment_sha256
      );
    }
    if (!arraysEqual([...decision.probe_ids].sort(), probeIds)) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_DECISION_PROBE_SET_MISMATCH',
        decisionPath,
        'decision probe IDs must equal discovered probe IDs'
      );
    }
    previousDecidedAt = decision.decided_at;
    decisions.push(decision);
  }
  if (
    decisions.length > 0
    && decisions.at(-1).decision !== profile.lifecycle_status
  ) {
    failPlaybookContract(
      'PLAYBOOK_RESOURCE_DECISION_LIFECYCLE_MISMATCH',
      `ResourceSourceProfile.${profile.source_id}.lifecycle_status`,
      `${profile.lifecycle_status} does not match ${decisions.at(-1).decision}`
    );
  }
  return decisions;
}

async function assertPublicBoundary(reader, catalog, sources) {
  const sourceIds = new Set(catalog.sources.map((source) => source.source_id));
  const allowedFiles = new Set(['README.md', 'catalog.json', ...SCHEMA_PATHS]);
  const allowedDirectories = new Set(['schemas', 'sources']);
  for (const source of sources) {
    const sourceRoot = `sources/${source.entry.source_id}`;
    allowedDirectories.add(sourceRoot);
    allowedDirectories.add(`${sourceRoot}/probes`);
    allowedDirectories.add(`${sourceRoot}/decisions`);
    allowedFiles.add(`${sourceRoot}/source.json`);
    if (source.assessment !== null) allowedFiles.add(source.assessment.path);
    for (const probe of source.probes) {
      allowedFiles.add(`${sourceRoot}/probes/${probe.probe_id}.json`);
    }
    for (const decision of source.decisions) {
      allowedFiles.add(`${sourceRoot}/decisions/${decision.decision_id}.json`);
    }
  }
  const tree = await reader.walk();
  const treeFiles = new Set(tree.filter((entry) => !entry.directory).map((entry) => entry.path));
  for (const entry of tree) {
    const allowed = entry.directory
      ? allowedDirectories.has(entry.path)
      : allowedFiles.has(entry.path);
    if (!allowed) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_UNEXPECTED_FILE',
        entry.path,
        entry.directory ? 'unexpected directory' : 'unexpected file'
      );
    }
    if (
      entry.path.startsWith('sources/')
      && entry.path.split('/').length >= 2
      && !sourceIds.has(entry.path.split('/')[1])
    ) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_UNEXPECTED_FILE', entry.path, 'unregistered source path'
      );
    }
  }
  for (const schemaPath of SCHEMA_PATHS) {
    if (treeFiles.has(schemaPath)) await reader.readJson(schemaPath);
  }
  if (treeFiles.has('README.md')) {
    const readme = (await reader.readBytes('README.md')).toString('utf8');
    assertNoPrivatePath(readme, 'README.md', { allowStandardResourceBoundary: true });
  }
}

function assertPersistedJsonHasNoPrivatePaths(value, resourcePath, valuePath = '$') {
  if (typeof value === 'string') {
    assertNoPrivatePath(value, `${resourcePath}:${valuePath}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      assertPersistedJsonHasNoPrivatePaths(child, resourcePath, `${valuePath}[${index}]`);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertPersistedJsonHasNoPrivatePaths(child, resourcePath, `${valuePath}.${key}`);
    }
  }
}

function assertNoPrivatePath(text, valuePath, { allowStandardResourceBoundary = false } = {}) {
  const unixHomePath = /\/(?:home\/[^/\s]+|Users\/[^/\s]+|root)(?:\/|$)/u;
  const windowsDrivePath = /(?:^|[^A-Za-z])[A-Za-z]:[\\/]/u;
  if (unixHomePath.test(text) || windowsDrivePath.test(text)) {
    failPlaybookContract('PLAYBOOK_RESOURCE_PRIVATE_PATH_LEAK', valuePath, 'absolute home path');
  }
  const privateReferences = text.match(
    /\.local[\\/]architecture-playbook[\\/][^\s`"'<>)]*/gu
  ) ?? [];
  for (const reference of privateReferences) {
    const normalized = reference.replaceAll('\\', '/');
    if (
      !allowStandardResourceBoundary
      || normalized !== '.local/architecture-playbook/resources/'
    ) {
      failPlaybookContract(
        'PLAYBOOK_RESOURCE_PRIVATE_PATH_LEAK', valuePath, reference
      );
    }
  }
}

function arraysEqual(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeUrl(value) {
  const normalized = new URL(value);
  normalized.hash = '';
  return normalized.href;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
