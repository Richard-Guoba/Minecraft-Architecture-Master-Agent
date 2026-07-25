import { constants as FS_CONSTANTS } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TrainingDataError } from '../../trainingError.js';
import { failContract } from '../contracts/contractError.js';
import { validateLegacyAuditReport } from '../contracts/legacyAuditReport.js';
import {
  LEGACY_AUDIT_REPORT_SOURCE,
  RESIDENTIAL_SCHEMA_VERSION
} from '../contracts/vocabularies.js';
import {
  readResidentialWorkspaceStatus,
  validateResidentialWorkspaceRoot
} from '../workspace/index.js';
import { parseResidentialArtifact, supportedResidentialFormat } from './artifactParser.js';
import { canonicalSha256 } from './canonicalJson.js';
import { RESIDENTIAL_INTAKE_LIMITS } from './limits.js';
import {
  readCandidateBytes,
  readVerifiedQuarantineArtifacts,
  writeJsonOnceOrVerify
} from './storage.js';

const DEFAULT_METADATA_RELATIVE = 'analysis/labels.generated.jsonl';
const IGNORED_DIRECTORIES = new Set(['analysis', 'curation']);
const REPORT_FILENAME = 'legacy-audit.json';

export async function auditLegacyTemplates(options) {
  const projectRoot = path.resolve(options.projectRoot);
  const legacyRoot = await resolveLegacyRoot(options.legacyRoot, projectRoot);
  const root = await readyWorkspaceRoot(options.root, projectRoot);
  const reportPath = await readyReportPath(root);
  const metadataPath = resolveMetadataPath(
    options.metadataFile,
    legacyRoot
  );
  const metadata = await readMetadata(metadataPath, legacyRoot);
  const quarantineHashes = await readQuarantineHashes(root, projectRoot);
  const entries = await discoverLegacySources(legacyRoot);
  const seenLegacy = new Map();
  const candidates = [];

  for (const entry of entries) {
    const record = await auditEntry({
      entry,
      metadata: metadata.get(entry.relative_path),
      seenLegacy,
      quarantineHashes
    });
    candidates.push(record);
    if (record.artifact_sha256 !== null && !seenLegacy.has(record.artifact_sha256)) {
      seenLegacy.set(record.artifact_sha256, record.relative_path);
    }
  }

  const report = validateLegacyAuditReport({
    source: LEGACY_AUDIT_REPORT_SOURCE,
    schema_version: RESIDENTIAL_SCHEMA_VERSION,
    root: 'mc_templates',
    inventory_sha256: canonicalSha256(candidates),
    summary: summaryFor(candidates),
    candidates
  });
  await writeJsonOnceOrVerify(reportPath, report);
  return report;
}

async function resolveLegacyRoot(value, projectRoot) {
  const expected = path.join(projectRoot, 'mc_templates');
  const candidate = path.resolve(value ?? expected);
  if (candidate !== expected) {
    failContract('LEGACY_ROOT_OUTSIDE_PROJECT', 'LegacyAudit.root', candidate);
  }
  const entry = await safeLstat(candidate);
  if (!entry?.isDirectory() || entry.isSymbolicLink()) {
    failContract('LEGACY_ROOT_INVALID', 'LegacyAudit.root', candidate);
  }
  return candidate;
}

async function readyWorkspaceRoot(root, projectRoot) {
  const workspaceRoot = await validateResidentialWorkspaceRoot(root, { projectRoot });
  const status = await readResidentialWorkspaceStatus({
    root: workspaceRoot,
    projectRoot
  });
  if (status.state !== 'ready') {
    failContract('WORKSPACE_NOT_READY', 'workspace.root', workspaceRoot);
  }
  return workspaceRoot;
}

async function readyReportPath(root) {
  const reports = path.join(root, 'reports');
  const entry = await safeLstat(reports);
  if (!entry?.isDirectory() || entry.isSymbolicLink()) {
    failContract('LEGACY_AUDIT_REPORT_PATH_INVALID', 'LegacyAudit.report', reports);
  }
  return path.join(reports, REPORT_FILENAME);
}

function resolveMetadataPath(value, legacyRoot) {
  const defaultPath = path.join(legacyRoot, ...DEFAULT_METADATA_RELATIVE.split('/'));
  const candidate = path.resolve(value ?? defaultPath);
  const analysisRoot = path.join(legacyRoot, 'analysis');
  if (candidate !== defaultPath && !isDescendant(analysisRoot, candidate)) {
    failContract('LEGACY_METADATA_OUTSIDE_ANALYSIS', 'LegacyAudit.metadata', candidate);
  }
  return candidate;
}

async function discoverLegacySources(legacyRoot) {
  const discovered = [];
  await visit(legacyRoot, '');
  return discovered.sort((left, right) => compareText(left.relative_path, right.relative_path));

  async function visit(directory, relative) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const childRelative = relative
        ? `${relative}/${entry.name}`
        : entry.name;
      const childPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (relative === '' && IGNORED_DIRECTORIES.has(entry.name)) continue;
        await visit(childPath, childRelative);
        continue;
      }
      if (!supportedResidentialFormat(entry.name)) continue;
      if (entry.isFile() || entry.isSymbolicLink()) {
        discovered.push(Object.freeze({
          absolute_path: childPath,
          relative_path: childRelative,
          is_symlink: entry.isSymbolicLink()
        }));
      }
    }
  }
}

async function auditEntry({ entry, metadata, seenLegacy, quarantineHashes }) {
  const base = candidateBase(entry.relative_path, metadata);
  if (entry.is_symlink) {
    return candidateOutcome(base, {
      artifact_sha256: null,
      occupied_extent: null,
      duplicate_of: null,
      outcome: 'rejected',
      reason: 'malformed_or_unsafe_source'
    });
  }

  let artifact;
  let occupiedBoundsLimit = null;
  try {
    const bytes = await readCandidateBytes(entry.absolute_path);
    artifact = parseResidentialArtifact({
      bytes,
      originalFilename: entry.relative_path,
      sourceId: legacySourceId(entry.relative_path),
      occupiedExtentLimit: 64
    });
  } catch (error) {
    if (!(error instanceof TrainingDataError)) throw error;
    if (error.code === 'SOURCE_OCCUPIED_BOUNDS_LIMIT') {
      occupiedBoundsLimit = {
        artifact_sha256: error.metadata.exact_sha256,
        occupied_extent: error.metadata.occupied_extent,
        duplicate_of: null
      };
    } else {
      return candidateOutcome(base, {
        artifact_sha256: null,
        occupied_extent: null,
        duplicate_of: null,
        outcome: parserLimit(error) ? 'deferred' : 'rejected',
        reason: parserLimit(error) ? 'parser_limit' : 'malformed_or_unsafe_source'
      });
    }
  }

  const common = occupiedBoundsLimit ?? {
    artifact_sha256: artifact.exact_sha256,
    occupied_extent: artifact.occupied_bounds.extent,
    duplicate_of: null
  };
  const priorLegacy = seenLegacy.get(common.artifact_sha256);
  if (priorLegacy) {
    return candidateOutcome(base, {
      ...common,
      duplicate_of: `legacy:${priorLegacy}`,
      outcome: 'deferred',
      reason: 'exact_duplicate'
    });
  }
  const quarantined = quarantineHashes.get(common.artifact_sha256);
  if (quarantined) {
    return candidateOutcome(base, {
      ...common,
      duplicate_of: quarantined,
      outcome: 'deferred',
      reason: 'exact_duplicate'
    });
  }
  if (occupiedBoundsLimit !== null) {
    return candidateOutcome(base, {
      ...common,
      outcome: 'deferred',
      reason: 'occupied_bounds_exceed_64'
    });
  }
  if (base.source_url === null) {
    return candidateOutcome(base, {
      ...common,
      outcome: 'deferred',
      reason: 'missing_provenance'
    });
  }
  if (base.lane_hint !== 'houses') {
    return candidateOutcome(base, {
      ...common,
      outcome: 'deferred',
      reason: 'non_residential_reference_only'
    });
  }
  return candidateOutcome(base, {
    ...common,
    outcome: 'parsed',
    reason: 'residential_candidate_requires_review'
  });
}

function candidateBase(relativePath, metadata) {
  const folderHint = relativePath.split('/')[0];
  return {
    relative_path: relativePath,
    title: titleFor(relativePath, metadata?.title),
    folder_hint: folderHint,
    lane_hint: folderHint === 'House' ? 'houses' : 'other-architecture',
    source_url: sourceUrlFor(metadata)
  };
}

function candidateOutcome(base, outcome) {
  return { ...base, ...outcome };
}

async function readMetadata(metadataPath, legacyRoot) {
  const relativeParts = metadataRelativeParts(legacyRoot, metadataPath);
  const bytes = relativeParts === null
    ? null
    : await readPinnedMetadataFile(legacyRoot, relativeParts);
  if (bytes === null) return new Map();
  const records = new Map();
  for (const line of bytes.toString('utf8').split(/\r?\n/u)) {
    if (line.trim() === '') continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (!value || Array.isArray(value) || typeof value !== 'object') continue;
    const normalized = normalizeRelativePath(value.file);
    if (!normalized || records.has(normalized)) continue;
    records.set(normalized, Object.freeze({
      title: typeof value.title === 'string' ? value.title : null,
      source_url: validHttpUrl(value.source_url)
        ? value.source_url
        : (validHttpUrl(value.source) ? value.source : null)
    }));
  }
  return records;
}

async function readQuarantineHashes(root, projectRoot) {
  const artifacts = await readVerifiedQuarantineArtifacts({ root, projectRoot });
  const hashes = new Map();
  for (const artifact of artifacts) {
    hashes.set(artifact.sha256, artifact.case_id);
  }
  return hashes;
}

function metadataRelativeParts(legacyRoot, metadataPath) {
  const relative = path.relative(legacyRoot, metadataPath);
  const normalized = path.normalize(relative);
  if (
    normalized === '.'
    || normalized === '..'
    || normalized.startsWith(`..${path.sep}`)
    || path.isAbsolute(normalized)
  ) return null;
  const parts = normalized.split(path.sep);
  if (
    parts[0] !== 'analysis'
    || parts.length < 2
    || parts.some((part) => part === '' || part === '.' || part === '..')
  ) return null;
  return parts;
}

async function readPinnedMetadataFile(legacyRoot, relativeParts) {
  const handles = [];
  let file;
  try {
    let parent = await openPinnedMetadataDirectory(legacyRoot);
    handles.push(parent);
    for (const part of relativeParts.slice(0, -1)) {
      parent = await openPinnedMetadataDirectory(part, parent);
      handles.push(parent);
    }
    const descriptorRoot = await metadataDescriptorRoot(parent);
    file = await fs.open(
      path.join(descriptorRoot, relativeParts.at(-1)),
      FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW
    );
    const before = await file.stat();
    if (!before.isFile() || before.size > RESIDENTIAL_INTAKE_LIMITS.maxRawBytes) {
      return null;
    }
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) return null;
      offset += bytesRead;
    }
    const after = await file.stat();
    if (after.size !== before.size || !after.isFile()) return null;
    return bytes;
  } catch {
    return null;
  } finally {
    await file?.close();
    await Promise.all(handles.reverse().map((handle) => handle.close()));
  }
}

async function openPinnedMetadataDirectory(directory, parent) {
  const directoryPath = parent === undefined
    ? directory
    : path.join(await metadataDescriptorRoot(parent), directory);
  const handle = await fs.open(
    directoryPath,
    FS_CONSTANTS.O_RDONLY |
      FS_CONSTANTS.O_DIRECTORY |
      FS_CONSTANTS.O_NOFOLLOW
  );
  try {
    const metadata = await handle.stat();
    if (!metadata.isDirectory()) throw new Error('METADATA_DIRECTORY_INVALID');
    await metadataDescriptorRoot(handle, metadata);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function metadataDescriptorRoot(handle, metadata = undefined) {
  const expected = metadata ?? await handle.stat();
  if (!expected.isDirectory()) throw new Error('METADATA_DIRECTORY_INVALID');
  const descriptorRoot = `/proc/self/fd/${handle.fd}`;
  const observed = await fs.stat(descriptorRoot);
  if (
    !observed.isDirectory()
    || observed.dev !== expected.dev
    || observed.ino !== expected.ino
  ) throw new Error('METADATA_DESCRIPTOR_INVALID');
  return descriptorRoot;
}

function titleFor(relativePath, title) {
  if (typeof title === 'string' && title.length > 0) return title.slice(0, 512);
  const basename = path.posix.basename(relativePath);
  const extension = path.posix.extname(basename);
  return basename.slice(0, -extension.length).replace(/ - \(mcbuild_org\)$/u, '').slice(0, 512);
}

function sourceUrlFor(metadata) {
  return validHttpUrl(metadata?.source_url) && metadata.source_url.length <= 4096
    ? metadata.source_url
    : null;
}

function validHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  if (
    normalized === '.'
    || normalized.startsWith('../')
    || path.posix.isAbsolute(normalized)
  ) return null;
  return normalized;
}

function legacySourceId(relativePath) {
  return `legacy-${canonicalSha256(relativePath).slice(0, 24)}`;
}

function parserLimit(error) {
  return error.code.endsWith('_LIMIT')
    || error.code === 'RAW_BYTES_LIMIT'
    || error.code === 'NBT_COMPRESSION_RATIO';
}

function summaryFor(candidates) {
  return {
    candidate_count: candidates.length,
    house_hint_count: candidates.filter((item) => item.lane_hint === 'houses').length,
    other_hint_count: candidates.filter((item) => item.lane_hint === 'other-architecture').length,
    parsed_count: candidates.filter((item) => item.outcome === 'parsed').length,
    deferred_count: candidates.filter((item) => item.outcome === 'deferred').length,
    rejected_count: candidates.filter((item) => item.outcome === 'rejected').length,
    duplicate_count: candidates.filter((item) => item.reason === 'exact_duplicate').length,
    missing_provenance_count: candidates.filter(
      (item) => item.reason === 'missing_provenance'
    ).length
  };
}

function isDescendant(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..'
    && !path.isAbsolute(relative);
}

function compareText(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

async function safeLstat(filePath) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
