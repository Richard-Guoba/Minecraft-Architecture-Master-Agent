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
import { renderReferenceViews } from './playbook/p6/offlineRenderer.js';
import {
  admitP6Run,
  createP6Run,
  publishP6Generation,
  readCurrentP6Generation
} from './playbook/p6/storage.js';
import { P6_VIEW_IDS, P6_VISUAL_SETTINGS } from './playbook/p6/constants.js';
import { sha256, stableJson } from './playbook/shadow/canonical.js';

const ACTIONS = new Set(['prepare', 'prepare-capture-session', 'capture', 'import-captures']);
const PREPARE_FLAGS = new Set(['--playbook-run', '--baseline-run', '--run-dir']);
const CAPTURE_VALUE_FLAGS = new Set(['--world', '--expected-world-identity']);
const CAPTURE_BOOLEAN_FLAGS = new Set(['--authorize-disposable-world']);
const IMPORT_FLAGS = new Set(['--run-dir', '--capture-root']);
const SESSION_FLAGS = new Set(['--run-dir', '--expected-world-identity', '--plot-origin']);
const HASH = /^[a-f0-9]{64}$/u;

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

const HELP = `Usage:\n  npm run playbook:p6 -- prepare --playbook-run <absolute-p5-run> --baseline-run <absolute-baseline-run> --run-dir <absolute-run>\n  npm run playbook:p6 -- prepare-capture-session --run-dir <absolute-run> --expected-world-identity <sha256> --plot-origin <x,y,z>\n  npm run playbook:p6 -- import-captures --run-dir <absolute-run> --capture-root <absolute-capture-root>\n  npm run playbook:p6 -- capture [--authorize-disposable-world --world <absolute-path> --expected-world-identity <sha256>]\n\nprepare creates offline reference-render outputs only. prepare-capture-session publishes commands and a checklist for one exact world identity without opening or changing it. import-captures validates one complete current-session-bound batch without changing its source. No action launches Minecraft or changes a world; capture remains deliberately unavailable.\n`;

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
