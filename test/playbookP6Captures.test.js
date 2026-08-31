import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createCaptureSession,
  renderCaptureChecklist,
  validateImportedCaptures
} from '../src/playbook/p6/captures.js';
import { P6_PROTOCOL_FILE_HASHES, P6_VIEW_IDS, P6_VISUAL_SETTINGS } from '../src/playbook/p6/constants.js';
import { createP6Run, publishP6Generation, readCurrentP6Generation } from '../src/playbook/p6/storage.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import { p6CapturePngHeader } from './fixtures/playbookP6Captures.js';

const SOLUTION_IDS = [
  'playbook-candidate-01',
  'playbook-candidate-02',
  'playbook-candidate-03',
  'baseline-current'
];

test('capture session fixes four equal plots, exact environment, build/camera commands, and 24 anonymous files', () => {
  const session = captureSession();

  assert.equal(session.status, 'prepared-not-executed');
  assert.equal(session.environment.minecraft_version, '1.21.9');
  assert.equal(session.environment.world_identifier_sha256, hashFor('world'));
  assert.equal(session.environment.default_resource_pack, true);
  assert.equal(session.environment.shader_pack, 'none');
  assert.equal(session.environment.width_px, 1920);
  assert.equal(session.environment.height_px, 1080);
  assert.equal(session.plots.length, 4);
  assert.deepEqual(new Set(session.plots.map(plot => plot.ground_block)), new Set(['minecraft:grass_block']));
  assert.deepEqual(new Set(session.plots.map(plot => plot.biome)), new Set(['minecraft:plains']));
  assert.deepEqual(session.plots.map(plot => plot.origin.x), [100, 356, 612, 868]);
  assert.equal(session.captures.length, 24);
  assert.equal(new Set(session.captures.map(row => row.filename)).size, 24);
  assert.equal(session.captures.every(row => /^capture-\d{2}-opaque\.png$/u.test(row.filename)), true);
  assert.deepEqual(session.captures.map(row => `${row.solution_id}/${row.view_id}`),
    SOLUTION_IDS.flatMap(solution => P6_VIEW_IDS.map(view => `${solution}/${view}`)));
  assert.equal(session.plots.every(plot => plot.build_command.startsWith('/execute positioned ')), true);
  assert.equal(session.captures.every(row => row.camera_command.startsWith('/tp @s ')), true);

  const checklist = renderCaptureChecklist(session);
  assert.match(checklist, /default Minecraft resource pack/u);
  assert.match(checklist, /Do not launch, install, open, or change Minecraft/u);
  assert.equal(checklist.includes('/execute positioned'), true);
  assert.equal(checklist.includes('/tp @s'), true);
  assert.equal(checklist.includes('capture-24-opaque.png'), true);
});

test('formal import accepts one complete identity-bound batch and publishes opaque managed captures only', async t => {
  const fixture = await importFixture(t);
  const before = await snapshotCaptureRoot(fixture.captureRoot);
  const result = await validateImportedCaptures({
    authority: fixture.authority,
    session: fixture.session,
    captureRoot: fixture.captureRoot
  });

  assert.equal(result.status, 'imported');
  assert.equal(result.capture_count, 24);
  assert.equal(result.output, 'minecraft-captures/generation-000001');
  assert.equal(JSON.stringify(result).includes(fixture.root), false);
  assert.deepEqual(await snapshotCaptureRoot(fixture.captureRoot), before);

  const published = await readCurrentP6Generation({ authority: fixture.authority, kind: 'minecraft-captures' });
  assert.deepEqual(Object.keys(published.files).sort(), [
    'capture-manifest.json',
    ...fixture.session.captures.map(row => row.filename)
  ].sort());
  const manifest = JSON.parse(published.files['capture-manifest.json']);
  assert.equal(result.capture_manifest_sha256, sha256(stableJson(manifest)));
  assert.equal(manifest.images.length, 24);
  assert.equal(new Set(manifest.images.map(row => row.solution_id)).size, 4);
  assert.equal(manifest.images.every(row => /^opaque-solution-[a-z]+$/u.test(row.solution_id)), true);
  assert.equal(manifest.images.every(row => !JSON.stringify(row).includes('candidate')), true);
  assert.deepEqual(manifest.images.map(row => row.image_sha256),
    fixture.session.captures.map(row => sha256(pngHeader())));
});

test('formal import fails closed for incomplete, extra, corrupt, wrong-size, linked, leaking, and mixed-provenance batches', async t => {
  const cases = [
    ['missing image', async fixture => fs.unlink(path.join(fixture.captureRoot, 'capture-01-opaque.png'))],
    ['extra image', async fixture => fs.writeFile(path.join(fixture.captureRoot, 'capture-25-opaque.png'), pngHeader())],
    ['corrupt image', async fixture => fs.writeFile(path.join(fixture.captureRoot, 'capture-01-opaque.png'), Buffer.from('not png'))],
    ['wrong dimensions', async fixture => fs.writeFile(path.join(fixture.captureRoot, 'capture-01-opaque.png'), pngHeader(1280, 720))],
    ['hardlinked image', async fixture => {
      await fs.unlink(path.join(fixture.captureRoot, 'capture-02-opaque.png'));
      await fs.link(path.join(fixture.captureRoot, 'capture-01-opaque.png'), path.join(fixture.captureRoot, 'capture-02-opaque.png'));
    }],
    ['symlinked image', async fixture => {
      await fs.unlink(path.join(fixture.captureRoot, 'capture-02-opaque.png'));
      await fs.symlink('capture-01-opaque.png', path.join(fixture.captureRoot, 'capture-02-opaque.png'));
    }],
    ['identity label leakage', async fixture => {
      await fs.appendFile(path.join(fixture.captureRoot, 'capture-01-opaque.png'), Buffer.from('baseline-current'));
    }],
    ['mixed environment', async fixture => mutateProvenance(fixture, value => {
      value.files[0].environment_sha256 = hashFor('different-environment');
    })],
    ['duplicate solution view', async fixture => mutateProvenance(fixture, value => {
      value.files[1].view_id = value.files[0].view_id;
    })],
    ['wrong session provenance', async fixture => mutateProvenance(fixture, value => {
      value.capture_session_sha256 = hashFor('different-session');
    })]
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async t2 => {
      const fixture = await importFixture(t2);
      await mutate(fixture);
      await assert.rejects(
        validateImportedCaptures({ authority: fixture.authority, session: fixture.session, captureRoot: fixture.captureRoot }),
        error => error?.code === 'P6_CAPTURE_INVALID' && !String(error.message).includes(fixture.root)
      );
      await assert.rejects(
        readCurrentP6Generation({ authority: fixture.authority, kind: 'minecraft-captures' }),
        { code: 'P6_AUTHORITY_INVALID' }
      );
    });
  }
});

test('formal import requires the exact current capture session', async t => {
  const fixture = await importFixture(t);
  const replacement = captureSession({ worldIdentityHash: hashFor('replacement-world') });
  await publishSession(fixture.authority, replacement);

  await assert.rejects(
    validateImportedCaptures({ authority: fixture.authority, session: fixture.session, captureRoot: fixture.captureRoot }),
    { code: 'P6_CAPTURE_INVALID' }
  );
});

test('formal import rejects a capture root reached through an intermediate symlink', async t => {
  const fixture = await importFixture(t);
  const alias = path.join(fixture.root, 'capture-alias');
  await fs.symlink(fixture.root, alias);
  await assert.rejects(
    validateImportedCaptures({
      authority: fixture.authority,
      session: fixture.session,
      captureRoot: path.join(alias, 'submitted')
    }),
    { code: 'P6_CAPTURE_INVALID' }
  );
  await assert.rejects(
    readCurrentP6Generation({ authority: fixture.authority, kind: 'minecraft-captures' }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
});

test('formal import revalidates every named capture-root ancestor and preserves its replacement', async t => {
  const fixture = await importFixture(t);
  const parent = path.dirname(fixture.captureRoot);
  const parked = path.join(fixture.root, 'capture-parent-parked');
  const foreignMarker = path.join(parent, 'foreign-marker.txt');
  let replaced = false;
  const interleaving = {
    async readdir(target, options) {
      if (!replaced) {
        replaced = true;
        await fs.rename(parent, parked);
        await fs.mkdir(parent);
        await fs.mkdir(path.join(parent, 'submitted'));
        await fs.writeFile(foreignMarker, 'foreign');
      }
      return fs.readdir(target, options);
    }
  };

  await assert.rejects(
    validateImportedCaptures({
      authority: fixture.authority,
      session: fixture.session,
      captureRoot: fixture.captureRoot,
      fsImpl: interleaving
    }),
    { code: 'P6_CAPTURE_INVALID' }
  );
  assert.equal(await fs.readFile(foreignMarker, 'utf8'), 'foreign');
  await assert.rejects(
    readCurrentP6Generation({ authority: fixture.authority, kind: 'minecraft-captures' }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
});

test('formal import rechecks exact membership and file identities immediately before publication', async t => {
  for (const [name, mutate, verify] of [
    ['add', async fixture => {
      await fs.writeFile(path.join(fixture.captureRoot, 'foreign-preserved.png'), Buffer.from('foreign'));
    }, async fixture => {
      assert.equal(await fs.readFile(path.join(fixture.captureRoot, 'foreign-preserved.png'), 'utf8'), 'foreign');
    }],
    ['remove', async fixture => {
      await fs.unlink(path.join(fixture.captureRoot, 'capture-24-opaque.png'));
    }, async fixture => {
      await assert.rejects(fs.lstat(path.join(fixture.captureRoot, 'capture-24-opaque.png')), { code: 'ENOENT' });
    }],
    ['replace', async fixture => {
      const target = path.join(fixture.captureRoot, 'capture-24-opaque.png');
      fixture.parkedCapture = path.join(fixture.root, 'parked-capture-24.png');
      await fs.rename(target, fixture.parkedCapture);
      await fs.writeFile(target, p6CapturePngHeader());
    }, async fixture => {
      assert.deepEqual(await fs.readFile(fixture.parkedCapture), p6CapturePngHeader());
    }]
  ]) {
    await t.test(name, async t2 => {
      const fixture = await importFixture(t2);
      let reads = 0;
      const interleaving = {
        async readdir(target, options) {
          reads += 1;
          if (reads === 2) await mutate(fixture);
          return fs.readdir(target, options);
        }
      };
      await assert.rejects(
        validateImportedCaptures({
          authority: fixture.authority,
          session: fixture.session,
          captureRoot: fixture.captureRoot,
          fsImpl: interleaving
        }),
        { code: 'P6_CAPTURE_INVALID' }
      );
      await verify(fixture);
      await assert.rejects(
        readCurrentP6Generation({ authority: fixture.authority, kind: 'minecraft-captures' }),
        { code: 'P6_AUTHORITY_INVALID' }
      );
    });
  }
});

test('formal import rejects a current session whose environment or authority hash was tampered', async t => {
  for (const [name, mutate] of [
    ['environment', session => { session.environment.shader_pack = 'custom-shader'; }],
    ['authority hash', session => { session.capture_session_sha256 = hashFor('forged-session'); }]
  ]) {
    await t.test(name, async t2 => {
      const fixture = await importFixture(t2);
      const tampered = structuredClone(fixture.session);
      mutate(tampered);
      await publishSession(fixture.authority, tampered, { unchecked: true });
      await assert.rejects(
        validateImportedCaptures({ authority: fixture.authority, session: tampered, captureRoot: fixture.captureRoot }),
        { code: 'P6_CAPTURE_INVALID' }
      );
    });
  }
});

async function importFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-capture-disposable-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'run');
  const captureParent = path.join(root, 'capture-parent');
  const captureRoot = path.join(captureParent, 'submitted');
  await fs.mkdir(runDir);
  await fs.mkdir(captureParent);
  await fs.mkdir(captureRoot);
  const created = await createP6Run({ runDir });
  t.after(() => created.authority.close());
  const session = captureSession();
  await publishSession(created.authority, session);
  for (const row of session.captures) await fs.writeFile(path.join(captureRoot, row.filename), pngHeader());
  await fs.writeFile(path.join(captureRoot, 'capture-provenance.json'), stableJson(session.required_provenance));
  return { root, captureRoot, authority: created.authority, session };
}

async function publishSession(authority, session, { unchecked = false } = {}) {
  return publishP6Generation({
    authority,
    kind: 'capture-session',
    files: {
      'capture-session.json': Buffer.from(stableJson(session)),
      'capture-checklist.md': Buffer.from(unchecked ? '# untrusted current session\n' : renderCaptureChecklist(session))
    }
  });
}

async function mutateProvenance(fixture, mutate) {
  const provenancePath = path.join(fixture.captureRoot, 'capture-provenance.json');
  const value = JSON.parse(await fs.readFile(provenancePath, 'utf8'));
  mutate(value);
  await fs.writeFile(provenancePath, stableJson(value));
}

async function snapshotCaptureRoot(captureRoot) {
  const names = (await fs.readdir(captureRoot)).sort();
  return Promise.all(names.map(async name => {
    const filename = path.join(captureRoot, name);
    const [stat, bytes] = await Promise.all([fs.lstat(filename), fs.readFile(filename)]);
    return { name, dev: stat.dev, ino: stat.ino, mode: stat.mode, nlink: stat.nlink, bytes };
  }));
}

function captureSession({ worldIdentityHash = hashFor('world') } = {}) {
  const cohort = {
    input_sha256: hashFor('cohort-input'),
    manifest: {
      schema_version: 1,
      protocol_version: '0.1.0',
      cohort_id: 'p6-v0.1',
      request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
      visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
      solutions: SOLUTION_IDS.map((solution_id, index) => ({
        solution_id,
        playbook_mode: index === 3 ? 'off' : 'execute',
        slot_index: index === 3 ? 0 : index + 1,
        root_seed: 424242,
        prompt_sha256: hashFor('prompt'),
        blueprint_sha256: hashFor(`blueprint-${index}`),
        operation_list_sha256: hashFor(`operations-${index}`),
        build_function_sha256: hashFor(`build-${index}`),
        hard_qa_ok: true,
        minecraft_version: '1.21.9'
      }))
    }
  };
  const cameraManifests = cohort.manifest.solutions.map((solution, solutionIndex) => ({
    schema_version: 1,
    protocol_version: '0.1.0',
    solution_id: solution.solution_id,
    blueprint_sha256: solution.blueprint_sha256,
    build_function_sha256: solution.build_function_sha256,
    request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
    settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
    bounds: { min_x: 0, min_y: 4, min_z: 0, max_x: 20, max_y: 18, max_z: 14 },
    main_entry: { center_x: '10.000000', center_y: '5.000000', center_z: '14.000000', facing: 'south' },
    views: P6_VIEW_IDS.map((view_id, viewIndex) => ({
      view_id,
      purpose: [
        'principal-facade-hierarchy', 'side-facade-depth', 'volume-attachment-roof-silhouette',
        'opposite-volume-relationship', 'roof-composition-footprint', 'approach-scale-entrance-legibility'
      ][viewIndex],
      horizontal_fov_degrees: 70,
      framing_multiplier: '1.000000',
      position: { x: `${10 + solutionIndex}.000000`, y: `${20 + viewIndex}.000000`, z: `${30 + viewIndex}.000000` },
      target: { x: '10.000000', y: '10.000000', z: '7.000000' },
      ...(view_id === 'entry-eye' ? { entry_offset_blocks: 8 } : {})
    }))
  }));
  return createCaptureSession({
    cohort,
    cameraManifests,
    settings: P6_VISUAL_SETTINGS,
    worldIdentityHash,
    plotOrigin: { x: 100, y: 64, z: 200 }
  });
}

function pngHeader(width = 1920, height = 1080) {
  return p6CapturePngHeader(width, height);
}

function hashFor(value) { return sha256(String(value)); }
