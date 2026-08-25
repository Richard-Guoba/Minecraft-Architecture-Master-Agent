import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCourseManifestFromBilibiliSnapshot
} from './playbook/course/bilibiliCourseSnapshot.js';
import { failPlaybookContract } from './playbook/contracts/playbookContractError.js';

const PRIVATE_ROOT = '.local/architecture-playbook';
const MANIFEST_PATH = 'docs/architecture-playbook/course/course-manifest.json';
const COURSE_BVID = 'BV1HhEuzZEyZ';
const EXPECTED_EPISODE_COUNT = 50;
const VALUE_OPTIONS = new Set([
  '--bvid',
  '--snapshot',
  '--output',
  '--captured-at'
]);
const BOOLEAN_OPTIONS = new Set(['--replace']);

export function parseArchitecturePlaybookCourseArgs(
  argv,
  { projectRoot = path.resolve(import.meta.dirname, '..') } = {}
) {
  const root = path.resolve(projectRoot);
  const command = argv[0];
  if (!['fetch', 'manifest'].includes(command)) {
    failPlaybookContract(
      'PLAYBOOK_ARGUMENT_COMMAND_INVALID',
      'argv[0]',
      String(command)
    );
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!VALUE_OPTIONS.has(flag) && !BOOLEAN_OPTIONS.has(flag)) {
      failPlaybookContract(
        'PLAYBOOK_ARGUMENT_UNKNOWN',
        `argv[${index}]`,
        String(flag)
      );
    }
    if (values.has(flag)) {
      failPlaybookContract(
        'PLAYBOOK_ARGUMENT_DUPLICATE',
        `argv[${index}]`,
        flag
      );
    }
    if (BOOLEAN_OPTIONS.has(flag)) {
      values.set(flag, true);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      failPlaybookContract(
        'PLAYBOOK_ARGUMENT_VALUE_MISSING',
        `argv[${index}]`,
        flag
      );
    }
    values.set(flag, value);
    index += 1;
  }

  const snapshotPath = assertPrivateSnapshotPath(
    requiredValue(values, '--snapshot'),
    root
  );
  if (command === 'fetch') {
    assertOnlyOptions(values, ['--bvid', '--snapshot', '--replace']);
    const bvid = requiredValue(values, '--bvid');
    if (bvid !== COURSE_BVID) {
      failPlaybookContract(
        'PLAYBOOK_COURSE_BVID_INVALID',
        '--bvid',
        bvid
      );
    }
    return Object.freeze({
      command,
      bvid,
      snapshotPath,
      replace: values.get('--replace') === true,
      projectRoot: root
    });
  }

  assertOnlyOptions(values, ['--snapshot', '--output', '--captured-at']);
  const outputPath = assertManifestPath(
    requiredValue(values, '--output'),
    root
  );
  const capturedAt = requiredValue(values, '--captured-at');
  assertTimestamp(capturedAt, '--captured-at');
  return Object.freeze({
    command,
    snapshotPath,
    outputPath,
    capturedAt,
    projectRoot: root
  });
}

export async function fetchCourseSnapshot({
  bvid,
  snapshotPath,
  projectRoot,
  replace = false,
  fetchImpl = globalThis.fetch
}) {
  const root = path.resolve(projectRoot);
  const target = assertPrivateSnapshotPath(snapshotPath, root);
  await assertPrivateSnapshotStorage(target, root, { createParent: true });
  if (bvid !== COURSE_BVID) {
    failPlaybookContract('PLAYBOOK_COURSE_BVID_INVALID', 'bvid', bvid);
  }
  if (typeof fetchImpl !== 'function') {
    failPlaybookContract(
      'PLAYBOOK_FETCH_UNAVAILABLE',
      'fetchImpl',
      'expected function'
    );
  }
  const endpoint = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Minecraft-Architecture-Playbook/0.1 metadata-probe'
    }
  });
  if (!response?.ok) {
    failPlaybookContract(
      'PLAYBOOK_FETCH_FAILED',
      endpoint,
      response?.status ?? 'no response'
    );
  }
  const bytes = await response.text();
  let snapshot;
  try {
    snapshot = JSON.parse(bytes);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_JSON_INVALID',
      target,
      error?.message || 'invalid JSON'
    );
  }
  const manifest = buildCourseManifestFromBilibiliSnapshot(snapshot, {
    capturedAt: new Date().toISOString(),
    sourceUrl: `https://www.bilibili.com/video/${bvid}/`,
    expectedEpisodeCount: EXPECTED_EPISODE_COUNT,
    sourceSnapshotSha256: sha256(bytes)
  });
  const status = await writeAtomicContent(target, bytes, { replace });
  return Object.freeze({
    status,
    seasonId: manifest.course.season_id,
    episodeCount: manifest.episodes.length
  });
}

export async function writeManifestFromSnapshot({
  snapshotPath,
  outputPath,
  capturedAt,
  projectRoot
}) {
  const root = path.resolve(projectRoot);
  const source = assertPrivateSnapshotPath(snapshotPath, root);
  const target = assertManifestPath(outputPath, root);
  await assertPrivateSnapshotStorage(source, root, { createParent: false });
  assertTimestamp(capturedAt, 'capturedAt');
  const bytes = await fs.readFile(source, 'utf8');
  let snapshot;
  try {
    snapshot = JSON.parse(bytes);
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_JSON_INVALID',
      source,
      error?.message || 'invalid JSON'
    );
  }
  const manifest = buildCourseManifestFromBilibiliSnapshot(snapshot, {
    capturedAt,
    sourceUrl: `https://www.bilibili.com/video/${COURSE_BVID}/`,
    expectedEpisodeCount: EXPECTED_EPISODE_COUNT,
    sourceSnapshotSha256: sha256(bytes)
  });
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  const status = await writeAtomicContent(target, output, { replace: true });
  return Object.freeze({
    status,
    seasonId: manifest.course.season_id,
    episodeCount: manifest.episodes.length
  });
}

export async function main(argv = process.argv.slice(2)) {
  const projectRoot = process.env.PLAYBOOK_PROJECT_ROOT
    ? path.resolve(process.env.PLAYBOOK_PROJECT_ROOT)
    : path.resolve(import.meta.dirname, '..');
  const options = parseArchitecturePlaybookCourseArgs(argv, { projectRoot });
  const result = options.command === 'fetch'
    ? await fetchCourseSnapshot(options)
    : await writeManifestFromSnapshot(options);
  const prefix = options.command === 'fetch' ? 'snapshot' : 'manifest';
  process.stdout.write([
    `${prefix}_status=${result.status}`,
    `season_id=${result.seasonId}`,
    `episode_count=${result.episodeCount}`
  ].join('\n') + '\n');
}

function requiredValue(values, flag) {
  if (!values.has(flag)) {
    failPlaybookContract(
      'PLAYBOOK_ARGUMENT_REQUIRED',
      flag,
      'missing option'
    );
  }
  return values.get(flag);
}

function assertOnlyOptions(values, allowedValues) {
  const allowed = new Set(allowedValues);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) {
      failPlaybookContract(
        'PLAYBOOK_ARGUMENT_INVALID_FOR_COMMAND',
        flag,
        'not supported by command'
      );
    }
  }
}

function assertPrivateSnapshotPath(value, projectRoot) {
  const resolved = path.resolve(projectRoot, value);
  const privateRoot = path.resolve(projectRoot, PRIVATE_ROOT);
  if (
    resolved === privateRoot
    || !resolved.startsWith(`${privateRoot}${path.sep}`)
  ) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_PATH_INVALID',
      'snapshotPath',
      resolved
    );
  }
  return resolved;
}

function assertManifestPath(value, projectRoot) {
  const resolved = path.resolve(projectRoot, value);
  const expected = path.resolve(projectRoot, MANIFEST_PATH);
  if (resolved !== expected) {
    failPlaybookContract(
      'PLAYBOOK_MANIFEST_PATH_INVALID',
      'outputPath',
      resolved
    );
  }
  return resolved;
}

async function assertPrivateSnapshotStorage(
  target,
  projectRoot,
  { createParent }
) {
  const privateRoot = path.resolve(projectRoot, PRIVATE_ROOT);
  const projectReal = await fs.realpath(projectRoot);
  const nearest = await nearestExistingAncestor(path.dirname(target));
  const nearestReal = await fs.realpath(nearest);
  if (!isWithin(nearestReal, projectReal)) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_SYMLINK_ESCAPE',
      'snapshotPath',
      nearestReal
    );
  }

  let privateReal = null;
  try {
    privateReal = await fs.realpath(privateRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (privateReal && !isWithin(privateReal, projectReal)) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_SYMLINK_ESCAPE',
      'snapshotPath',
      privateReal
    );
  }
  if (
    privateReal
    && nearest.startsWith(`${privateRoot}${path.sep}`)
    && !isWithin(nearestReal, privateReal)
  ) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_SYMLINK_ESCAPE',
      'snapshotPath',
      nearestReal
    );
  }

  if (createParent) await fs.mkdir(path.dirname(target), { recursive: true });
  const parentReal = await fs.realpath(path.dirname(target));
  const finalPrivateReal = await fs.realpath(privateRoot);
  if (
    !isWithin(finalPrivateReal, projectReal)
    || !isWithin(parentReal, finalPrivateReal)
  ) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_SYMLINK_ESCAPE',
      'snapshotPath',
      parentReal
    );
  }
}

async function nearestExistingAncestor(start) {
  let current = path.resolve(start);
  while (true) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`no existing ancestor for ${start}`);
    current = parent;
  }
}

function isWithin(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function assertTimestamp(value, valuePath) {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    failPlaybookContract(
      'PLAYBOOK_TIMESTAMP_INVALID',
      valuePath,
      String(value)
    );
  }
}

async function writeAtomicContent(target, content, { replace }) {
  let existing = null;
  try {
    existing = await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (existing === content) return 'unchanged';
  if (existing !== null && !replace) {
    failPlaybookContract(
      'PLAYBOOK_SNAPSHOT_CONFLICT',
      target,
      'target contains different bytes; pass --replace explicitly'
    );
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return existing === null ? 'created' : 'updated';
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const code = error?.code || 'PLAYBOOK_COURSE_FAILED';
    const detail = error?.detail || error?.message || String(error);
    process.stderr.write(`${code}: ${detail}\n`);
    process.exitCode = 1;
  });
}
