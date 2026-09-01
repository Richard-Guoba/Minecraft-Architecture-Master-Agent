import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';
import {
  P6_MINECRAFT_VERSION,
  P6_PROTOCOL_FILE_HASHES,
  P6_PROTOCOL_VERSION,
  P6_SCHEMA_VERSION,
  P6_VIEW_IDS,
  P6_VISUAL_SETTINGS
} from './constants.js';
import {
  p6Error,
  sanitizeP6Error,
  validateCameraManifestCohort,
  validateCaptureManifest,
  validateCohortManifest,
  validateVisualSettings
} from './contracts.js';
import { publishP6Generation, readCurrentP6Generation } from './storage.js';

const HASH = /^[a-f0-9]{64}$/u;
const CAPTURE_NAME = /^capture-(0[1-9]|1\d|2[0-4])-opaque\.png$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
export const P6_MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
const MAX_PROVENANCE_BYTES = 1024 * 1024;
const PLOT_SPACING = 256;
const SOLUTION_IDS = Object.freeze([
  'playbook-candidate-01',
  'playbook-candidate-02',
  'playbook-candidate-03',
  'baseline-current'
]);
const OPAQUE_IDS = Object.freeze([
  'opaque-solution-alpha',
  'opaque-solution-bravo',
  'opaque-solution-charlie',
  'opaque-solution-delta'
]);
const LEAK_LABELS = Object.freeze([
  ...SOLUTION_IDS,
  'playbook-candidate',
  'baseline-current'
]);

export function createCaptureSession({
  cohort,
  cameraManifests,
  settings,
  worldIdentityHash,
  plotOrigin
} = {}) {
  try {
    const cohortManifest = validateCohortManifest(cohort?.manifest ?? cohort);
    if (!plain(cohort) || !HASH.test(cohort.input_sha256)
      || !HASH.test(worldIdentityHash)) invalid();
    const cameras = validateCameraManifestCohort(cameraManifests);
    validateVisualSettings(settings);
    const origin = normalizeOrigin(plotOrigin);
    for (const [index, camera] of cameras.entries()) {
      const solution = cohortManifest.solutions[index];
      if (camera.solution_id !== solution.solution_id
        || camera.blueprint_sha256 !== solution.blueprint_sha256
        || camera.build_function_sha256 !== solution.build_function_sha256) invalid();
    }

    const environment = {
      minecraft_version: P6_MINECRAFT_VERSION,
      client_options_sha256: sha256(stableJson(settings)),
      default_resource_pack: true,
      resource_pack_ids: ['vanilla'],
      shader_pack: 'none',
      fancy_graphics: true,
      clouds: 'off',
      entities_present: false,
      particles_present: false,
      hidden_overlays: [...P6_VISUAL_SETTINGS.hidden_overlays],
      width_px: P6_VISUAL_SETTINGS.width_px,
      height_px: P6_VISUAL_SETTINGS.height_px,
      aspect_ratio: P6_VISUAL_SETTINGS.aspect_ratio,
      horizontal_fov_degrees: P6_VISUAL_SETTINGS.horizontal_fov_degrees,
      time_of_day: P6_VISUAL_SETTINGS.time_of_day,
      weather: P6_VISUAL_SETTINGS.weather,
      world_identifier_sha256: worldIdentityHash
    };
    const environmentSha256 = sha256(stableJson(environment));
    const plots = cameras.map((camera, index) => {
      const plot = {
        plot_id: `plot-${String(index + 1).padStart(2, '0')}`,
        solution_id: camera.solution_id,
        origin: { x: origin.x + index * PLOT_SPACING, y: origin.y, z: origin.z },
        spacing_blocks: PLOT_SPACING,
        ground_block: 'minecraft:grass_block',
        biome: 'minecraft:plains',
        time_of_day: P6_VISUAL_SETTINGS.time_of_day,
        weather: P6_VISUAL_SETTINGS.weather,
        build_function_sha256: camera.build_function_sha256
      };
      plot.build_command = `/execute positioned ${plot.origin.x} ${plot.origin.y} ${plot.origin.z} run function architect:p6/build-${String(index + 1).padStart(2, '0')}`;
      return plot;
    });
    const captures = cameras.flatMap((camera, solutionIndex) => (
      camera.views.map((view, viewIndex) => {
        const plot = plots[solutionIndex];
        const position = translatePoint(view.position, plot.origin);
        const target = translatePoint(view.target, plot.origin);
        const orientation = cameraOrientation(position, target);
        const captureIndex = solutionIndex * P6_VIEW_IDS.length + viewIndex + 1;
        return {
          filename: `capture-${String(captureIndex).padStart(2, '0')}-opaque.png`,
          screenshot_id: `capture-${String(captureIndex).padStart(2, '0')}-opaque`,
          solution_id: camera.solution_id,
          opaque_solution_id: OPAQUE_IDS[solutionIndex],
          view_id: view.view_id,
          build_function_sha256: camera.build_function_sha256,
          camera: { position, orientation },
          camera_command: `/tp @s ${position.x} ${position.y} ${position.z} ${orientation.yaw_degrees} ${orientation.pitch_degrees}`
        };
      })
    ));
    const authority = {
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      kind: 'p6-capture-session',
      status: 'prepared-not-executed',
      cohort_sha256: sha256(stableJson(cohortManifest)),
      camera_manifest_sha256: sha256(stableJson(cameraManifests)),
      request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
      visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
      environment,
      environment_sha256: environmentSha256,
      plots,
      captures,
      required_capture_count: 24,
      next_action: 'import-captures'
    };
    const captureSessionSha256 = sha256(stableJson(authority));
    const requiredProvenance = {
      schema_version: 1,
      kind: 'p6-capture-provenance',
      capture_session_sha256: captureSessionSha256,
      environment_sha256: environmentSha256,
      world_identifier_sha256: worldIdentityHash,
      files: captures.map(row => ({
        filename: row.filename,
        solution_id: row.opaque_solution_id,
        view_id: row.view_id,
        environment_sha256: environmentSha256
      }))
    };
    return deepFreeze({
      ...authority,
      capture_session_sha256: captureSessionSha256,
      required_provenance: requiredProvenance
    });
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_CAPTURE_INVALID');
  }
}

export function renderCaptureChecklist(session) {
  assertSession(session);
  const lines = [
    '# P6 formal Minecraft capture checklist',
    '',
    'Preparation record only. Do not launch, install, open, or change Minecraft from this tooling.',
    `Capture session SHA-256: ${session.capture_session_sha256}`,
    `World identity SHA-256: ${session.environment.world_identifier_sha256}`,
    `Environment SHA-256: ${session.environment_sha256}`,
    '',
    'Use Minecraft Java 1.21.9, the default Minecraft resource pack, no shaders, fancy graphics, clouds off, clear weather, time 6000, and a 1920x1080 viewport.',
    'Use the same disposable world, plains biome, grass ground, lighting, and 256-block plot spacing for all four builds.',
    '',
    '## Build commands',
    ...session.plots.map(plot => `- ${plot.plot_id}: \`${plot.build_command}\``),
    '',
    '## Camera commands and anonymous filenames',
    ...session.captures.map(row => `- ${row.filename}: \`${row.camera_command}\``),
    '',
    'Place all 24 PNGs and the exact capture-provenance.json record in one caller-owned capture root. Import is all-or-nothing.'
  ];
  return `${lines.join('\n')}\n`;
}

export function validateCaptureSession(session, { cohort, cameraManifests, settings } = {}) {
  try {
    assertSession(session);
    const origin = session.plots?.[0]?.origin;
    const replay = createCaptureSession({
      cohort,
      cameraManifests,
      settings,
      worldIdentityHash: session.environment.world_identifier_sha256,
      plotOrigin: origin
    });
    if (stableJson(replay) !== stableJson(session)) invalid();
    return session;
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_CAPTURE_INVALID');
  }
}

export async function validateImportedCaptures({ authority, session, captureRoot, fsImpl } = {}) {
  let captureAuthority;
  try {
    assertSession(session);
    if (!safeAbsolutePath(captureRoot)) invalid();
    const ops = captureFsOperations(fsImpl);
    captureAuthority = await openCaptureRoot(ops, captureRoot);
    await assertCaptureRoot(ops, captureAuthority);
    await assertCurrentSession(authority, session);
    await assertCaptureRoot(ops, captureAuthority);

    const rootDescriptor = descriptor(captureAuthority.captureRootHandle);
    const expectedNames = [
      'capture-provenance.json',
      ...session.captures.map(row => row.filename)
    ].sort();
    const actualNames = (await ops.readdir(rootDescriptor)).sort();
    if (!sameStrings(actualNames, expectedNames)) invalid();
    await assertCaptureRoot(ops, captureAuthority);

    const provenanceRead = await readBoundFile(
      ops, captureAuthority, 'capture-provenance.json', MAX_PROVENANCE_BYTES
    );
    const provenanceBytes = provenanceRead.bytes;
    const provenance = canonicalJson(provenanceBytes);
    if (stableJson(provenance) !== stableJson(session.required_provenance)) invalid();
    assertProvenance(provenance, session);

    const files = {};
    const fileIdentities = new Map([['capture-provenance.json', provenanceRead.identity]]);
    const images = [];
    for (const [index, row] of session.captures.entries()) {
      if (!CAPTURE_NAME.test(row.filename)) invalid();
      const imageRead = await readBoundFile(ops, captureAuthority, row.filename, P6_MAX_CAPTURE_BYTES);
      const imageBytes = imageRead.bytes;
      fileIdentities.set(row.filename, imageRead.identity);
      const header = inspectCapturePng(imageBytes);
      if (header.width !== P6_VISUAL_SETTINGS.width_px
        || header.height !== P6_VISUAL_SETTINGS.height_px) invalid();
      assertNoIdentityLabel(imageBytes);
      files[row.filename] = imageBytes;
      images.push({
        screenshot_id: row.screenshot_id,
        solution_id: OPAQUE_IDS[indexDiv(index, P6_VIEW_IDS.length)],
        camera: {
          view_id: row.view_id,
          position: row.camera.position,
          orientation: row.camera.orientation
        },
        build_function_sha256: row.build_function_sha256,
        image_sha256: sha256(imageBytes)
      });
    }
    const captureManifest = {
      schema_version: P6_SCHEMA_VERSION,
      protocol_version: P6_PROTOCOL_VERSION,
      cohort_sha256: session.cohort_sha256,
      camera_manifest_sha256: session.camera_manifest_sha256,
      request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
      visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
      environment: {
        minecraft_version: session.environment.minecraft_version,
        client_options_sha256: session.environment.client_options_sha256,
        resource_pack_ids: [...session.environment.resource_pack_ids],
        viewport: {
          width_px: session.environment.width_px,
          height_px: session.environment.height_px,
          aspect_ratio: session.environment.aspect_ratio
        },
        horizontal_fov_degrees: session.environment.horizontal_fov_degrees,
        time_of_day: session.environment.time_of_day,
        weather: session.environment.weather,
        world_identifier_sha256: session.environment.world_identifier_sha256
      },
      images
    };
    validateCaptureManifest(captureManifest);
    const captureManifestBytes = Buffer.from(stableJson(captureManifest));
    files['capture-manifest.json'] = captureManifestBytes;
    const currentSession = await assertCurrentSession(authority, session);
    await assertCaptureRoot(ops, captureAuthority);
    const finalNames = (await ops.readdir(rootDescriptor)).sort();
    if (!sameStrings(finalNames, expectedNames)) invalid();
    for (const basename of expectedNames) {
      const retained = await ops.lstat(`${rootDescriptor}/${basename}`);
      if (retained.isSymbolicLink() || !retained.isFile() || retained.nlink !== 1
        || !sameIdentity(retained, fileIdentities.get(basename))) invalid();
    }
    await assertCaptureRoot(ops, captureAuthority);
    const publication = await publishP6Generation({
      authority,
      kind: 'minecraft-captures',
      files,
      expectedCurrent: currentSession
    });
    return Object.freeze({
      status: 'imported',
      capture_count: 24,
      capture_manifest_sha256: sha256(captureManifestBytes),
      environment_sha256: session.environment_sha256,
      output: `minecraft-captures/${publication.generation}`
    });
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_CAPTURE_INVALID');
  } finally {
    await closeCaptureRoot(captureAuthority);
  }
}

async function assertCurrentSession(authority, session) {
  const current = await readCurrentP6Generation({ authority, kind: 'capture-session' });
  const currentBytes = current.files['capture-session.json'];
  if (!Buffer.isBuffer(currentBytes)
    || !currentBytes.equals(Buffer.from(stableJson(session)))) invalid();
  return Object.freeze({
    kind: 'capture-session',
    generation: current.generation,
    manifest_sha256: current.manifest_sha256
  });
}

function assertSession(session) {
  if (!plain(session) || session.schema_version !== 1
    || session.protocol_version !== P6_PROTOCOL_VERSION
    || session.kind !== 'p6-capture-session'
    || session.status !== 'prepared-not-executed'
    || !HASH.test(session.capture_session_sha256)
    || !HASH.test(session.cohort_sha256)
    || !HASH.test(session.camera_manifest_sha256)
    || !HASH.test(session.environment_sha256)
    || !Array.isArray(session.plots) || session.plots.length !== 4
    || !Array.isArray(session.captures) || session.captures.length !== 24
    || !plain(session.required_provenance)) invalid();
  const { capture_session_sha256: persistedHash, required_provenance: provenance, ...authority } = session;
  if (persistedHash !== sha256(stableJson(authority))) invalid();
  const environment = session.environment;
  if (!plain(environment)
    || environment.minecraft_version !== P6_MINECRAFT_VERSION
    || environment.client_options_sha256 !== sha256(stableJson(P6_VISUAL_SETTINGS))
    || environment.default_resource_pack !== true
    || !sameStrings(environment.resource_pack_ids, ['vanilla'])
    || environment.shader_pack !== 'none'
    || environment.fancy_graphics !== true
    || environment.clouds !== 'off'
    || environment.entities_present !== false
    || environment.particles_present !== false
    || !sameStrings(environment.hidden_overlays, P6_VISUAL_SETTINGS.hidden_overlays)
    || environment.width_px !== P6_VISUAL_SETTINGS.width_px
    || environment.height_px !== P6_VISUAL_SETTINGS.height_px
    || environment.aspect_ratio !== P6_VISUAL_SETTINGS.aspect_ratio
    || environment.horizontal_fov_degrees !== P6_VISUAL_SETTINGS.horizontal_fov_degrees
    || environment.time_of_day !== P6_VISUAL_SETTINGS.time_of_day
    || environment.weather !== P6_VISUAL_SETTINGS.weather
    || !HASH.test(environment.world_identifier_sha256)
    || session.environment_sha256 !== sha256(stableJson(environment))) invalid();
  for (const [index, plot] of session.plots.entries()) {
    if (!plain(plot) || plot.plot_id !== `plot-${String(index + 1).padStart(2, '0')}`
      || plot.solution_id !== SOLUTION_IDS[index]
      || !plain(plot.origin) || ![plot.origin.x, plot.origin.y, plot.origin.z].every(Number.isSafeInteger)
      || plot.spacing_blocks !== PLOT_SPACING || plot.ground_block !== 'minecraft:grass_block'
      || plot.biome !== 'minecraft:plains'
      || plot.time_of_day !== P6_VISUAL_SETTINGS.time_of_day
      || plot.weather !== P6_VISUAL_SETTINGS.weather
      || !HASH.test(plot.build_function_sha256)
      || plot.build_command !== `/execute positioned ${plot.origin.x} ${plot.origin.y} ${plot.origin.z} run function architect:p6/build-${String(index + 1).padStart(2, '0')}`) invalid();
    if (index > 0) {
      const previous = session.plots[index - 1].origin;
      if (plot.origin.x - previous.x !== PLOT_SPACING
        || plot.origin.y !== previous.y || plot.origin.z !== previous.z) invalid();
    }
  }
  const pairs = session.captures.map(row => `${row.solution_id}/${row.view_id}`);
  const expectedPairs = SOLUTION_IDS.flatMap(solution => P6_VIEW_IDS.map(view => `${solution}/${view}`));
  if (!sameStrings(pairs, expectedPairs)
    || new Set(session.captures.map(row => row.filename)).size !== 24) invalid();
  for (const [index, row] of session.captures.entries()) {
    const solutionIndex = indexDiv(index, P6_VIEW_IDS.length);
    const plot = session.plots[solutionIndex];
    const number = String(index + 1).padStart(2, '0');
    if (!plain(row) || row.filename !== `capture-${number}-opaque.png`
      || row.screenshot_id !== `capture-${number}-opaque`
      || row.opaque_solution_id !== OPAQUE_IDS[solutionIndex]
      || row.build_function_sha256 !== plot.build_function_sha256
      || !plain(row.camera) || !validPoint(row.camera.position)
      || !plain(row.camera.orientation)
      || !decimal(row.camera.orientation.pitch_degrees)
      || !decimal(row.camera.orientation.yaw_degrees)
      || row.camera_command !== `/tp @s ${row.camera.position.x} ${row.camera.position.y} ${row.camera.position.z} ${row.camera.orientation.yaw_degrees} ${row.camera.orientation.pitch_degrees}`) invalid();
  }
  assertProvenance(provenance, session);
}

function assertProvenance(value, session) {
  if (!plain(value) || value.schema_version !== 1 || value.kind !== 'p6-capture-provenance'
    || value.capture_session_sha256 !== session.capture_session_sha256
    || value.environment_sha256 !== session.environment_sha256
    || value.world_identifier_sha256 !== session.environment.world_identifier_sha256
    || !Array.isArray(value.files) || value.files.length !== 24) invalid();
  const pairs = new Set();
  for (const [index, file] of value.files.entries()) {
    const expected = session.required_provenance.files[index];
    if (!plain(file) || stableJson(file) !== stableJson(expected)
      || file.environment_sha256 !== session.environment_sha256) invalid();
    const pair = `${file.solution_id}/${file.view_id}`;
    if (pairs.has(pair)) invalid();
    pairs.add(pair);
  }
  if (pairs.size !== 24) invalid();
}

async function readBoundFile(ops, captureAuthority, basename, maxBytes) {
  if (!safeBasename(basename)) invalid();
  await assertCaptureRoot(ops, captureAuthority);
  const filename = `${descriptor(captureAuthority.captureRootHandle)}/${basename}`;
  const before = await ops.lstat(filename);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1
    || before.size <= 0 || before.size > maxBytes) invalid();
  let handle;
  try {
    handle = await ops.open(filename, READ_FLAGS);
    const opened = await handle.stat();
    if (!sameIdentity(before, opened) || !opened.isFile() || opened.nlink !== 1) invalid();
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameIdentity(opened, after) || after.nlink !== 1
      || after.size !== bytes.length || after.size !== before.size) invalid();
    return { bytes, identity: identity(opened) };
  } finally {
    await close(handle);
    await assertCaptureRoot(ops, captureAuthority);
  }
}

async function openCaptureRoot(ops, absolutePath) {
  const parsed = path.parse(absolutePath);
  const components = absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let rootHandle;
  const ancestry = [];
  try {
    rootHandle = await ops.open(parsed.root, DIRECTORY_FLAGS);
    const rootStat = await rootHandle.stat();
    if (!rootStat.isDirectory()) invalid();
    let parentHandle = rootHandle;
    for (const basename of components) {
      const named = await ops.lstat(`${descriptor(parentHandle)}/${basename}`);
      if (named.isSymbolicLink() || !named.isDirectory()) invalid();
      const nodeIdentity = identity(named);
      const handle = await ops.open(`${descriptor(parentHandle)}/${basename}`, DIRECTORY_FLAGS);
      const opened = await handle.stat();
      if (!opened.isDirectory() || !sameIdentity(opened, nodeIdentity)) invalid();
      ancestry.push({ parentHandle, handle, basename, identity: nodeIdentity });
      parentHandle = handle;
    }
    if (ancestry.length === 0) invalid();
    return {
      rootHandle,
      rootIdentity: identity(rootStat),
      ancestry,
      captureRootHandle: ancestry.at(-1).handle
    };
  } catch (error) {
    await closeCaptureRoot({ rootHandle, ancestry });
    throw error;
  }
}

async function assertCaptureRoot(ops, authority) {
  const root = await authority?.rootHandle?.stat();
  if (!root?.isDirectory() || !sameIdentity(root, authority.rootIdentity)) invalid();
  for (const node of authority.ancestry) {
    const retained = await node.handle.stat();
    const named = await ops.lstat(`${descriptor(node.parentHandle)}/${node.basename}`);
    if (!retained.isDirectory() || !sameIdentity(retained, node.identity)
      || named.isSymbolicLink() || !named.isDirectory()
      || !sameIdentity(named, node.identity)) invalid();
  }
}

async function closeCaptureRoot(authority) {
  if (!authority) return;
  for (const node of [...(authority.ancestry ?? [])].reverse()) await close(node.handle);
  await close(authority.rootHandle);
}

function captureFsOperations(source) {
  const provided = source?.source ?? source;
  const operation = name => {
    const owner = provided && typeof provided[name] === 'function' ? provided : fs;
    return owner[name].bind(owner);
  };
  return Object.freeze({ open: operation('open'), lstat: operation('lstat'), readdir: operation('readdir') });
}

function inspectCapturePng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33
    || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    || bytes.readUInt32BE(8) !== 13
    || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') invalid();
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0 || bytes[24] !== 8
    || ![0, 2, 3, 4, 6].includes(bytes[25])
    || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) invalid();
  return { width, height };
}

function assertNoIdentityLabel(bytes) {
  const lower = bytes.toString('latin1').toLowerCase();
  if (LEAK_LABELS.some(label => lower.includes(label))) invalid();
}

function translatePoint(point, origin) {
  if (!plain(point)) invalid();
  return {
    x: decimal6(Number(point.x) + origin.x),
    y: decimal6(Number(point.y) + origin.y),
    z: decimal6(Number(point.z) + origin.z)
  };
}

function cameraOrientation(position, target) {
  const dx = Number(target.x) - Number(position.x);
  const dy = Number(target.y) - Number(position.y);
  const dz = Number(target.z) - Number(position.z);
  const horizontal = Math.hypot(dx, dz);
  if (![dx, dy, dz, horizontal].every(Number.isFinite) || horizontal === 0 && dy === 0) invalid();
  return {
    pitch_degrees: decimal6(-Math.atan2(dy, horizontal) * 180 / Math.PI),
    yaw_degrees: decimal6(Math.atan2(-dx, dz) * 180 / Math.PI)
  };
}

function normalizeOrigin(value) {
  if (!plain(value) || ![value.x, value.y, value.z].every(Number.isSafeInteger)) invalid();
  return { x: value.x, y: value.y, z: value.z };
}

function decimal6(value) {
  if (!Number.isFinite(value)) invalid();
  const normalized = Object.is(value, -0) || Math.abs(value) < 0.0000005 ? 0 : value;
  return normalized.toFixed(6);
}

function validPoint(value) {
  return plain(value) && decimal(value.x) && decimal(value.y) && decimal(value.z);
}

function decimal(value) {
  return typeof value === 'string' && /^-?(?:0|[1-9]\d*)\.\d{6}$/u.test(value);
}

function canonicalJson(bytes) {
  try {
    const text = bytes.toString('utf8');
    const value = JSON.parse(text);
    if (stableJson(value) !== text) invalid();
    return value;
  } catch (error) {
    if (error?.code === 'P6_CAPTURE_INVALID') throw error;
    invalid();
  }
}

function descriptor(handle) { return `/proc/self/fd/${handle.fd}`; }
function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function sameStrings(left, right) { return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]); }
function indexDiv(value, divisor) { return Math.floor(value / divisor); }
function safeBasename(value) { return typeof value === 'string' && path.basename(value) === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value); }
function safeAbsolutePath(value) { return typeof value === 'string' && value.length > 1 && path.isAbsolute(value) && path.resolve(value) === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
async function close(handle) { try { await handle?.close(); } catch {} }
function invalid() { throw p6Error('P6_CAPTURE_INVALID'); }
