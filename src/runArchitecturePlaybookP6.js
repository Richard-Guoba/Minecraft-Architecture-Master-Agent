import { constants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveFixedViewManifest, deriveSharedFraming } from './playbook/p6/cameras.js';
import {
  createCaptureSession,
  renderCaptureChecklist as renderFormalCaptureChecklist,
  validateImportedCaptures
} from './playbook/p6/captures.js';
import { admitP6CohortInputs } from './playbook/p6/cohort.js';
import { p6Error, sanitizeP6Error } from './playbook/p6/contracts.js';
import {
  compileBlindComparison,
  sealPreferences,
  validateBlindComparisonPackage,
  validatePrivateComparisonAuthority
} from './playbook/p6/comparisons.js';
import { renderReferenceViews } from './playbook/p6/offlineRenderer.js';
import {
  compileObservationSet,
  renderObservationReport
} from './playbook/p6/observations.js';
import {
  admitP6Run,
  createP6Run,
  publishP6Generation,
  readCurrentP6Generation
} from './playbook/p6/storage.js';
import { P6_VIEW_IDS, P6_VISUAL_SETTINGS } from './playbook/p6/constants.js';
import { sha256, stableJson } from './playbook/shadow/canonical.js';

const ACTIONS = new Set([
  'prepare', 'prepare-capture-session', 'capture', 'import-captures', 'import-observations',
  'prepare-comparisons', 'import-preferences'
]);
const PREPARE_FLAGS = new Set(['--playbook-run', '--baseline-run', '--run-dir']);
const CAPTURE_VALUE_FLAGS = new Set(['--world', '--expected-world-identity']);
const CAPTURE_BOOLEAN_FLAGS = new Set(['--authorize-disposable-world']);
const IMPORT_FLAGS = new Set(['--run-dir', '--capture-root']);
const SESSION_FLAGS = new Set(['--run-dir', '--expected-world-identity', '--plot-origin']);
const OBSERVATION_FLAGS = new Set(['--run-dir', '--file']);
const COMPARISON_FLAGS = new Set(['--run-dir']);
const PREFERENCE_FLAGS = new Set(['--run-dir', '--file']);
const HASH = /^[a-f0-9]{64}$/u;
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const MAX_OBSERVATION_IMPORT_BYTES = 4 * 1024 * 1024;

export function parseP6Args(argv) {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string')) invalid();
  if (argv.length === 1 && argv[0] === '--help') return Object.freeze({ action: 'help' });
  const action = argv[0];
  if (!ACTIONS.has(action)) invalid();
  const values = new Map();
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const allowed = action === 'prepare' ? PREPARE_FLAGS
      : action === 'import-captures' ? IMPORT_FLAGS
        : action === 'prepare-capture-session' ? SESSION_FLAGS
          : action === 'import-observations' ? OBSERVATION_FLAGS
            : action === 'prepare-comparisons' ? COMPARISON_FLAGS
              : action === 'import-preferences' ? PREFERENCE_FLAGS
        : new Set([...CAPTURE_VALUE_FLAGS, ...CAPTURE_BOOLEAN_FLAGS]);
    if (!allowed.has(flag) || values.has(flag)) invalid();
    if (CAPTURE_BOOLEAN_FLAGS.has(flag)) {
      values.set(flag, true);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) invalid();
    values.set(flag, value);
    index += 1;
  }
  if (action === 'capture') {
    const world = values.get('--world');
    const identity = values.get('--expected-world-identity');
    if (world !== undefined && !safeAbsolutePath(world)) invalid();
    if (identity !== undefined && !HASH.test(identity)) invalid();
    return Object.freeze({
      action,
      authorize_disposable_world: values.get('--authorize-disposable-world') === true,
      world: world ?? null,
      expected_world_identity: identity ?? null
    });
  }
  if (action === 'import-captures') {
    const runDir = values.get('--run-dir');
    const captureRoot = values.get('--capture-root');
    if (!safeAbsolutePath(runDir) || !safeAbsolutePath(captureRoot)) invalid();
    return Object.freeze({ action, runDir, captureRoot });
  }
  if (action === 'prepare-capture-session') {
    const runDir = values.get('--run-dir');
    const worldIdentityHash = values.get('--expected-world-identity');
    const plotOrigin = parsePlotOrigin(values.get('--plot-origin'));
    if (!safeAbsolutePath(runDir) || !HASH.test(worldIdentityHash) || !plotOrigin) invalid();
    return Object.freeze({ action, runDir, worldIdentityHash, plotOrigin });
  }
  if (action === 'import-observations') {
    const runDir = values.get('--run-dir');
    const file = values.get('--file');
    if (!safeAbsolutePath(runDir) || !safeAbsolutePath(file)) invalid();
    return Object.freeze({ action, runDir, file });
  }
  if (action === 'prepare-comparisons') {
    const runDir = values.get('--run-dir');
    if (!safeAbsolutePath(runDir)) invalid();
    return Object.freeze({ action, runDir });
  }
  if (action === 'import-preferences') {
    const runDir = values.get('--run-dir');
    const file = values.get('--file');
    if (!safeAbsolutePath(runDir) || !safeAbsolutePath(file)) invalid();
    return Object.freeze({ action, runDir, file });
  }
  const required = [...PREPARE_FLAGS].map(flag => values.get(flag));
  if (required.some(value => !safeAbsolutePath(value))) invalid();
  return Object.freeze({
    action,
    playbookRunDir: values.get('--playbook-run'),
    baselineRunDir: values.get('--baseline-run'),
    runDir: values.get('--run-dir')
  });
}

export async function runP6Cli(argv, deps = defaultDependencies) {
  let created;
  try {
    const options = parseP6Args(argv);
    if (options.action === 'help') return Object.freeze({ status: 'help' });
    // Capture is intentionally unimplemented: the flags are parsed only so a
    // future reviewed action has an explicit authorization shape.
    if (options.action === 'capture') throw p6Error('P6_CAPTURE_AUTHORIZATION_REQUIRED');
    if (options.action === 'prepare-capture-session') {
      const authority = await deps.admitP6Run({
        p6Dir: path.join(options.runDir, 'playbook-p6')
      });
      created = { authority };
      const current = await deps.readCurrentP6Generation({ authority, kind: 'cohort' });
      const cohortDocument = parseJsonBytes(current?.files?.['cohort.json']);
      if (!plain(cohortDocument) || !plain(cohortDocument.cohort)
        || !HASH.test(cohortDocument.cohort_input_sha256)) invalid();
      const cameraManifests = cohortDocument.cohort.solutions?.map(solution => (
        parseJsonBytes(current.files[`camera-${solution?.solution_id}.json`])
      ));
      const session = deps.createCaptureSession({
        cohort: {
          input_sha256: cohortDocument.cohort_input_sha256,
          manifest: cohortDocument.cohort
        },
        cameraManifests,
        settings: P6_VISUAL_SETTINGS,
        worldIdentityHash: options.worldIdentityHash,
        plotOrigin: options.plotOrigin
      });
      const publication = await deps.publishP6Generation({
        authority,
        kind: 'capture-session',
        files: {
          'capture-session.json': bytes(deps.stableJson(session)),
          'capture-checklist.md': bytes(deps.renderFormalCaptureChecklist(session))
        }
      });
      return Object.freeze({
        status: 'capture-session-prepared',
        capture_session_sha256: session.capture_session_sha256,
        environment_sha256: session.environment_sha256,
        publication_manifest_sha256: publication.manifest_sha256,
        output: `capture-session/${publication.generation}`,
        next_action: 'import-captures'
      });
    }
    if (options.action === 'import-captures') {
      const authority = await deps.admitP6Run({
        p6Dir: path.join(options.runDir, 'playbook-p6')
      });
      created = { authority };
      const current = await deps.readCurrentP6Generation({
        authority,
        kind: 'capture-session'
      });
      const sessionBytes = current?.files?.['capture-session.json'];
      if (!Buffer.isBuffer(sessionBytes)) throw p6Error('P6_CAPTURE_INVALID');
      let session;
      try { session = JSON.parse(sessionBytes.toString('utf8')); }
      catch { throw p6Error('P6_CAPTURE_INVALID'); }
      return await deps.validateImportedCaptures({
        authority,
        session,
        captureRoot: options.captureRoot
      });
    }
    if (options.action === 'import-observations') {
      const authority = await deps.admitP6Run({
        p6Dir: path.join(options.runDir, 'playbook-p6')
      });
      created = { authority };
      const cohortCurrent = await deps.readCurrentP6Generation({ authority, kind: 'cohort' });
      const capturesCurrent = await deps.readCurrentP6Generation({
        authority, kind: 'minecraft-captures'
      });
      const cohortDocument = parseJsonBytes(cohortCurrent?.files?.['cohort.json']);
      const cohort = cohortDocument?.cohort;
      const captureManifest = parseJsonBytes(capturesCurrent?.files?.['capture-manifest.json']);
      const submitted = await readObservationImport(options.file);
      if (!plain(submitted)
        || !sameExactKeys(submitted, ['schema_version', 'protocol_version', 'status', 'observations'])
        || submitted.schema_version !== 1 || submitted.protocol_version !== '0.1.0'
        || !['complete', 'partial'].includes(submitted.status)
        || !Array.isArray(submitted.observations)) throw p6Error('P6_OBSERVATION_INVALID');
      const observationSet = compileObservationSet({
        cohort, captureManifest, observations: submitted.observations
      });
      if (submitted.status !== observationSet.status) throw p6Error('P6_OBSERVATION_INVALID');
      const observationBytes = bytes(deps.stableJson?.(observationSet) ?? stableJson(observationSet));
      const publication = await deps.publishP6Generation({
        authority,
        kind: 'observations',
        files: {
          'observations.json': observationBytes,
          'observation-report.md': bytes(renderObservationReport(observationSet, {
            cohort, captureManifest
          }))
        },
        expectedCurrent: {
          kind: 'minecraft-captures',
          generation: capturesCurrent.generation,
          manifest_sha256: capturesCurrent.manifest_sha256
        }
      });
      return Object.freeze({
        status: 'observations-imported',
        completeness: observationSet.status,
        observation_count: observationSet.observation_count,
        required_observation_count: observationSet.required_observation_count,
        gate_ready: observationSet.gate_ready,
        observation_set_sha256: deps.sha256?.(observationBytes) ?? sha256(observationBytes),
        output: `observations/${publication.generation}`
      });
    }
    if (options.action === 'prepare-comparisons') {
      const authority = await deps.admitP6Run({ p6Dir: path.join(options.runDir, 'playbook-p6') });
      created = { authority };
      const cohortCurrent = await deps.readCurrentP6Generation({ authority, kind: 'cohort' });
      const capturesCurrent = await deps.readCurrentP6Generation({ authority, kind: 'minecraft-captures' });
      const cohort = parseJsonBytes(cohortCurrent?.files?.['cohort.json'])?.cohort;
      const captureManifest = parseJsonBytes(capturesCurrent?.files?.['capture-manifest.json']);
      const bundle = deps.compileBlindComparison({
        cohort,
        captureManifest,
        randomBytes: deps.randomBytes,
        generatedAt: deps.now().toISOString()
      });
      const files = {
        'comparison-manifest.json': bytes(deps.stableJson(bundle.publicManifest)),
        'presentation-order.json': bytes(deps.stableJson(bundle.publicPresentation)),
        'private/identity-map.json': bytes(deps.stableJson(bundle.privateIdentityMap)),
        'private/randomization.json': bytes(deps.stableJson(bundle.privateRandomization))
      };
      for (const comparison of bundle.publicComparisons) {
        files[comparison.filename] = bytes(deps.stableJson(comparison));
      }
      for (const mapping of bundle.privateIdentityMap.screenshot_mappings) {
        const source = capturesCurrent.files[mapping.source_filename];
        if (!Buffer.isBuffer(source) || deps.sha256(source) !== mapping.source_image_sha256
          || files[mapping.presentation_filename]) throw p6Error('P6_COMPARISON_INVALID');
        files[mapping.presentation_filename] = Buffer.from(source);
      }
      const publication = await deps.publishP6Generation({
        authority,
        kind: 'blind-comparison',
        files,
        expectedCurrent: [
          currentReference('cohort', cohortCurrent),
          currentReference('minecraft-captures', capturesCurrent),
          { kind: 'blind-comparison', generation: null, manifest_sha256: null }
        ]
      });
      return Object.freeze({
        status: 'comparisons-prepared',
        comparison_manifest_hash: deps.sha256(deps.stableJson(bundle.publicManifest)),
        comparison_count: 6,
        output: `blind-comparison/${publication.generation}`,
        next_action: 'P6_HUMAN_PREFERENCE_REQUIRED'
      });
    }
    if (options.action === 'import-preferences') {
      const authority = await deps.admitP6Run({ p6Dir: path.join(options.runDir, 'playbook-p6') });
      created = { authority };
      const current = await deps.readCurrentP6Generation({
        authority, kind: 'blind-comparison', includePrivate: true
      });
      if (current?.files?.['preference-seal.json']) throw p6Error('P6_COMPARISON_INVALID');
      const cohortCurrent = await deps.readCurrentP6Generation({ authority, kind: 'cohort' });
      const capturesCurrent = await deps.readCurrentP6Generation({
        authority, kind: 'minecraft-captures'
      });
      const cohort = parseJsonBytes(cohortCurrent?.files?.['cohort.json'])?.cohort;
      const publicManifest = parseJsonBytes(current?.files?.['comparison-manifest.json']);
      const publicPresentation = parseJsonBytes(current?.files?.['presentation-order.json']);
      const publicComparisons = publicPresentation.pair_ids?.map(pairId => (
        parseJsonBytes(current?.files?.[`${pairId}.json`])
      ));
      deps.validateBlindComparisonPackage({ publicManifest, publicPresentation, publicComparisons });
      if (deps.sha256(current.files['presentation-order.json']) !== publicManifest.presentation_order_sha256
        || publicComparisons.some(row => (
          deps.sha256(current.files[row.filename]) !== publicManifest.pair_artifact_hashes[row.pair_id]
        ))) throw p6Error('P6_COMPARISON_INVALID');
      const captureManifestBytes = capturesCurrent?.files?.['capture-manifest.json'];
      if (!Buffer.isBuffer(captureManifestBytes)
        || deps.sha256(captureManifestBytes) !== publicManifest.capture_manifest_hash) {
        throw p6Error('P6_COMPARISON_INVALID');
      }
      const captureManifest = parseJsonBytes(captureManifestBytes);
      const identityMapBytes = current?.privateFiles?.['identity-map.json'];
      const randomizationBytes = current?.privateFiles?.['randomization.json'];
      if (!Buffer.isBuffer(identityMapBytes) || !Buffer.isBuffer(randomizationBytes)
        || deps.sha256(identityMapBytes) !== publicManifest.identity_map_sha256
        || deps.sha256(randomizationBytes) !== publicManifest.randomization_sha256) {
        throw p6Error('P6_COMPARISON_INVALID');
      }
      const identityMap = parseJsonBytes(identityMapBytes);
      const privateRandomization = parseJsonBytes(randomizationBytes);
      const expectedPublicNames = new Set([
        'comparison-manifest.json', 'presentation-order.json',
        ...publicComparisons.map(row => row.filename),
        ...publicComparisons.flatMap(row => [row.left, row.right]
          .flatMap(side => side.screenshots.map(screenshot => screenshot.filename)))
      ]);
      if (expectedPublicNames.size !== 80
        || Object.keys(current.files).length !== expectedPublicNames.size
        || Object.keys(current.files).some(name => !expectedPublicNames.has(name))
        || Object.keys(current.privateFiles).sort().join(',') !== 'identity-map.json,randomization.json') {
        throw p6Error('P6_COMPARISON_INVALID');
      }
      deps.validatePrivateComparisonAuthority({
        publicManifest, publicComparisons, publicPresentation,
        privateIdentityMap: identityMap, privateRandomization, cohort, captureManifest
      });
      const expectedPublicImages = new Set(identityMap.screenshot_mappings?.map(row => row.presentation_filename));
      if (expectedPublicImages.size !== 72) throw p6Error('P6_COMPARISON_INVALID');
      for (const mapping of identityMap.screenshot_mappings) {
        const image = current.files[mapping.presentation_filename];
        if (!Buffer.isBuffer(image) || deps.sha256(image) !== mapping.source_image_sha256) {
          throw p6Error('P6_COMPARISON_INVALID');
        }
      }
      const submitted = await readPreferenceImport(options.file);
      const sealed = deps.sealPreferences({
        publicManifest,
        records: submitted.records,
        reviewerPseudonym: submitted.reviewer_pseudonym
      });
      const files = Object.fromEntries(Object.entries(current.files).map(([name, value]) => [name, Buffer.from(value)]));
      files['preference-seal.json'] = bytes(deps.stableJson({
        schema_version: sealed.schema_version,
        protocol_version: sealed.protocol_version,
        status: sealed.status,
        comparison_manifest_hash: sealed.comparison_manifest_hash,
        preference_record_count: sealed.records.length,
        sealed_preference_hashes: sealed.sealed_preference_hashes
      }));
      for (const [name, value] of Object.entries(current.privateFiles)) {
        files[`private/${name}`] = Buffer.from(value);
      }
      files['private/sealed-preferences.json'] = bytes(deps.stableJson(sealed));
      const publication = await deps.publishP6Generation({
        authority,
        kind: 'blind-comparison',
        files,
        expectedCurrent: [
          currentReference('cohort', cohortCurrent),
          currentReference('minecraft-captures', capturesCurrent),
          currentReference('blind-comparison', current)
        ]
      });
      return Object.freeze({
        status: 'preferences-sealed',
        preference_record_count: sealed.records.length,
        comparison_manifest_hash: sealed.comparison_manifest_hash,
        output: `blind-comparison/${publication.generation}`
      });
    }

    created = await deps.createP6Run({ runDir: options.runDir });
    const cohort = await deps.admitP6CohortInputs({
      p6Authority: created.authority,
      playbookRunDir: options.playbookRunDir,
      baselineRunDir: options.baselineRunDir,
      fixedRequestPath: path.resolve(
        import.meta.dirname, '..', 'docs/architecture-playbook/evaluation/p6-v0.1/fixed-request.json'
      )
    });
    const renderSolutions = renderSnapshotsFromCohort(cohort);
    const sharedFraming = deps.deriveSharedFraming({ solutions: cohort.solutions });
    const cameraManifests = renderSolutions.map(solution => deps.deriveFixedViewManifest({
      solutionId: solution.solution_id,
      blueprintSha256: solution.blueprint_sha256,
      buildFunctionSha256: solution.build_function_sha256,
      bounds: solution.bounds,
      mainEntry: solution.main_entry,
      sharedFraming
    }));
    const cohortFiles = {
      'cohort.json': bytes(deps.stableJson({
        schema_version: 1,
        cohort: cohort.manifest,
        cohort_input_sha256: cohort.input_sha256,
        selection_rank: cohort.selection_rank ?? []
      }))
    };
    for (const manifest of cameraManifests) {
      cohortFiles[`camera-${manifest.solution_id}.json`] = bytes(deps.stableJson(manifest));
    }
    const cohortPublication = await deps.publishP6Generation({
      authority: created.authority, kind: 'cohort', files: cohortFiles
    });

    const images = [];
    for (const solution of renderSolutions) {
      const manifest = cameraManifests.find(item => item.solution_id === solution.solution_id);
      const rendered = deps.renderReferenceViews({
        solution, cameraManifest: manifest, settings: P6_VISUAL_SETTINGS
      });
      if (!Array.isArray(rendered) || rendered.length !== 6) throw p6Error('P6_RENDER_FAILED');
      const viewIds = rendered.map(image => image?.view_id);
      if (new Set(viewIds).size !== P6_VIEW_IDS.length
        || P6_VIEW_IDS.some(viewId => !viewIds.includes(viewId))) {
        throw p6Error('P6_RENDER_FAILED');
      }
      images.push(...rendered.map(image => Object.freeze({
        ...image,
        solution_id: solution.solution_id
      })));
    }
    if (images.length !== 24 || new Set(images.map(image => image.filename)).size !== 24) {
      throw p6Error('P6_RENDER_FAILED');
    }
    const referenceFiles = Object.fromEntries(images.map(image => [image.filename, image.bytes]));
    const referenceManifest = {
      schema_version: 1,
      kind: 'reference-render',
      cohort_input_sha256: cohort.input_sha256,
      camera_manifest_sha256: deps.sha256(deps.stableJson(cameraManifests)),
      images: images.map(({ filename, sha256: image_sha256, view_id, solution_id, width, height }) => ({
        filename, image_sha256, view_id, solution_id, width, height
      }))
    };
    referenceFiles['reference-renders.json'] = bytes(deps.stableJson(referenceManifest));
    const referencesPublication = await deps.publishP6Generation({
      authority: created.authority, kind: 'reference-renders', files: referenceFiles
    });
    const captureSession = {
      schema_version: 1,
      status: 'prepared-not-executed',
      cohort_input_sha256: cohort.input_sha256,
      cohort_manifest_sha256: cohortPublication.manifest_sha256,
      camera_manifest_sha256: referenceManifest.camera_manifest_sha256,
      reference_render_manifest_sha256: deps.sha256(deps.stableJson(referenceManifest)),
      required_capture_count: 24,
      next_action: 'P6_CAPTURE_AUTHORIZATION_REQUIRED'
    };
    const capturePublication = await deps.publishP6Generation({
      authority: created.authority,
      kind: 'capture-session',
      files: {
        'capture-session.json': bytes(deps.stableJson(captureSession)),
        'capture-checklist.md': bytes(renderCaptureChecklist(captureSession))
      }
    });
    return Object.freeze({
      status: 'prepared',
      cohort_input_sha256: cohort.input_sha256,
      cohort_manifest_sha256: cohortPublication.manifest_sha256,
      reference_render_manifest_sha256: captureSession.reference_render_manifest_sha256,
      capture_session_sha256: capturePublication.manifest_sha256,
      reference_image_count: 24,
      outputs: Object.freeze({
        cohort: `cohort/${cohortPublication.generation}`,
        reference_renders: `reference-renders/${referencesPublication.generation}`,
        capture_session: `capture-session/${capturePublication.generation}`
      }),
      next_action: 'P6_CAPTURE_AUTHORIZATION_REQUIRED'
    });
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_AUTHORITY_INVALID');
  } finally {
    await created?.authority?.close();
  }
}

const defaultDependencies = Object.freeze({
  admitP6Run,
  createCaptureSession,
  createP6Run,
  admitP6CohortInputs,
  deriveSharedFraming,
  deriveFixedViewManifest,
  renderReferenceViews,
  publishP6Generation,
  readCurrentP6Generation,
  renderFormalCaptureChecklist,
  validateImportedCaptures,
  compileBlindComparison,
  sealPreferences,
  validateBlindComparisonPackage,
  validatePrivateComparisonAuthority,
  randomBytes,
  now: () => new Date(),
  sha256,
  stableJson
});

function renderSnapshotsFromCohort(cohort) {
  if (!plain(cohort) || !Array.isArray(cohort.solutions) || cohort.solutions.length !== 4
    || !Array.isArray(cohort.render_solutions) || cohort.render_solutions.length !== 4) invalid();
  if (cohort.render_solutions.some((snapshot, index) => (
    !plain(snapshot) || snapshot.solution_id !== cohort.solutions[index]?.solution_id
    || snapshot.blueprint_sha256 !== cohort.solutions[index]?.blueprint_sha256
    || snapshot.operation_list_sha256 !== cohort.solutions[index]?.operation_list_sha256
    || snapshot.build_function_sha256 !== cohort.solutions[index]?.build_function_sha256
  ))) invalid();
  return cohort.render_solutions;
}

function renderCaptureChecklist(session) {
  return [
    '# P6 Minecraft capture checklist',
    '',
    'This session is prepared only. Do not launch Minecraft from this command.',
    `Cohort input SHA-256: ${session.cohort_input_sha256}`,
    `Camera manifest SHA-256: ${session.camera_manifest_sha256}`,
    `Reference-render manifest SHA-256: ${session.reference_render_manifest_sha256}`,
    `Required formal captures: ${session.required_capture_count}`,
    '',
    'Formal capture needs later explicit authorization for one exact disposable world, then human blind preferences after validated imports.'
  ].join('\n') + '\n';
}

function safeAbsolutePath(value) {
  return typeof value === 'string' && value.length > 1 && path.isAbsolute(value)
    && path.resolve(value) === value && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value);
}

function parsePlotOrigin(value) {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*),-?(?:0|[1-9]\d*),-?(?:0|[1-9]\d*)$/u.test(value)) return null;
  const [x, y, z] = value.split(',').map(Number);
  return [x, y, z].every(Number.isSafeInteger) ? Object.freeze({ x, y, z }) : null;
}

function parseJsonBytes(value) {
  if (!Buffer.isBuffer(value)) invalid();
  try { return JSON.parse(value.toString('utf8')); }
  catch { invalid(); }
}

function bytes(value) { return Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function invalid() { throw p6Error('P6_OPTIONS_INVALID'); }

async function readObservationImport(filename) {
  let handle;
  try {
    const before = await fs.lstat(filename);
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1
      || before.size <= 0 || before.size > MAX_OBSERVATION_IMPORT_BYTES) {
      throw p6Error('P6_OBSERVATION_INVALID');
    }
    handle = await fs.open(filename, READ_FLAGS);
    const opened = await handle.stat();
    if (!sameFileIdentity(before, opened) || !opened.isFile() || opened.nlink !== 1) {
      throw p6Error('P6_OBSERVATION_INVALID');
    }
    const content = await handle.readFile();
    const after = await handle.stat();
    if (!sameFileIdentity(opened, after) || after.size !== content.length) {
      throw p6Error('P6_OBSERVATION_INVALID');
    }
    return JSON.parse(content.toString('utf8'));
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_OBSERVATION_INVALID');
  } finally {
    await handle?.close();
  }
}

async function readPreferenceImport(filename) {
  let value;
  try {
    value = await readBoundedJsonFile(filename, MAX_OBSERVATION_IMPORT_BYTES);
  } catch (error) {
    throw sanitizeP6Error(error, 'P6_COMPARISON_INVALID');
  }
  if (!plain(value) || !sameExactKeys(value, ['reviewer_pseudonym', 'records'])
    || !Array.isArray(value.records)) throw p6Error('P6_COMPARISON_INVALID');
  return value;
}

async function readBoundedJsonFile(filename, maxBytes) {
  let handle;
  try {
    const before = await fs.lstat(filename);
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1
      || before.size <= 0 || before.size > maxBytes) throw new Error('invalid input');
    handle = await fs.open(filename, READ_FLAGS);
    const opened = await handle.stat();
    if (!sameFileIdentity(before, opened) || !opened.isFile() || opened.nlink !== 1) throw new Error('invalid input');
    const content = await handle.readFile();
    const after = await handle.stat();
    if (!sameFileIdentity(opened, after) || after.size !== content.length) throw new Error('invalid input');
    return JSON.parse(content.toString('utf8'));
  } finally {
    await handle?.close();
  }
}

function currentReference(kind, current) {
  if (!plain(current) || typeof current.generation !== 'string' || !HASH.test(current.manifest_sha256)) invalid();
  return Object.freeze({ kind, generation: current.generation, manifest_sha256: current.manifest_sha256 });
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function sameExactKeys(value, fields) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const HELP = `Usage:\n  npm run playbook:p6 -- prepare --playbook-run <absolute-p5-run> --baseline-run <absolute-baseline-run> --run-dir <absolute-run>\n  npm run playbook:p6 -- prepare-capture-session --run-dir <absolute-run> --expected-world-identity <sha256> --plot-origin <x,y,z>\n  npm run playbook:p6 -- import-captures --run-dir <absolute-run> --capture-root <absolute-capture-root>\n  npm run playbook:p6 -- import-observations --run-dir <absolute-run> --file <absolute-json>\n  npm run playbook:p6 -- prepare-comparisons --run-dir <absolute-run>\n  npm run playbook:p6 -- import-preferences --run-dir <absolute-run> --file <absolute-json>\n  npm run playbook:p6 -- capture [--authorize-disposable-world --world <absolute-path> --expected-world-identity <sha256>]\n\nprepare creates offline reference-render outputs only. prepare-capture-session publishes commands and a checklist for one exact world identity without opening or changing it. import-captures validates one complete current-session-bound batch without changing its source. import-observations publishes complete or explicitly partial image-grounded records; partial records keep the gate blocked. prepare-comparisons publishes six anonymous public pair files while retaining the identity map privately. import-preferences validates and seals exactly six user-supplied choices. No action launches Minecraft or changes a world; capture remains deliberately unavailable.\n`;

async function main(argv = process.argv.slice(2)) {
  try {
    const result = await runP6Cli(argv);
    if (result.status === 'help') process.stdout.write(HELP);
    else process.stdout.write(`${stableJson(result)}\n`);
  } catch (error) {
    process.stderr.write(`${sanitizeP6Error(error, 'P6_AUTHORITY_INVALID').code}\n`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
