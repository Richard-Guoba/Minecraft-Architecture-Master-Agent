import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BlueprintQAAgent } from '../src/construction/agents/blueprintQaAgent.js';
import {
  buildFrozenGeneratorContext,
  compileDesignLayers,
  prepareConstructionDesign
} from '../src/construction/designStages.js';
import { compilePreparedConstruction } from '../src/construction/workflow.js';
import {
  chainManifestBytes,
  chainManifestHash,
  checkpointBytes,
  createChainManifest,
  createCheckpointEnvelope
} from '../src/playbook/execute/checkpoints.js';
import { validateExecuteSelectionManifest } from '../src/playbook/execute/contracts.js';
import { buildDeterministicShadowReview } from '../src/playbook/shadow/runShadowReview.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import {
  admitExecuteRun,
  appendCandidateFailureEvidence,
  installCandidateSnapshot,
  installExecuteSelection,
  readCurrentCandidateSnapshot
} from '../src/playbook/execute/storage.js';

const LAYERS = Object.freeze(['brief', 'massing', 'structure', 'roof', 'facade']);
const INVALIDATES = Object.freeze({
  brief: ['massing', 'structure', 'roof', 'facade'],
  massing: ['structure', 'roof', 'facade'],
  structure: ['roof', 'facade'],
  roof: ['facade'],
  facade: []
});
const STAGE_PREFIX = '.playbook-execute.stage-';
const BACKUP_PREFIX = '.playbook-execute.backup-';
const ARTIFACT_HASH = 'a'.repeat(64);
const TRANSACTION_HASH = 'b'.repeat(64);
const CRASH_WORKER = path.join(import.meta.dirname, 'fixtures', 'playbookExecuteCrashWorker.js');
const STORAGE_AUTHORITIES = await buildStorageAuthorities();

test('failure evidence append rolls back every precommit write sync move and inspection fault', async (t) => {
  const cases = [
    ['exclusiveWrite', 1], ['chmod', 1], ['fileSync', 1], ['fileSync', 2],
    ['stageDirSync', 1], ['failureRename', 1], ['candidateSync', 1],
    ['candidatesSync', 1], ['postAttachInspect', 1]
  ];
  for (const [category, failAt] of cases) await t.test(`${category}-${failAt}`, async (t) => {
    const fixture = await installedFixture(t); const currentPath = path.join(candidateDirectory(fixture.runDir, 'candidate-01'), 'current-chain.json');
    const before = await fs.stat(currentPath); const beforeBytes = await fs.readFile(currentPath);
    await assert.rejects(appendCandidateFailureEvidence({
      authority: fixture.authority, candidateId: 'candidate-01',
      expectedCurrentChainSha256: fixture.initial.chainHash,
      evidence: failureEvidence(fixture.initial.chainHash),
      fsImpl: failureAppendFs({ failCategory: category, failAt })
    }), { code: 'P5_INSTALL_FAILED' });
    assert.deepEqual(await fs.readFile(currentPath), beforeBytes);
    assert.equal((await fs.stat(currentPath)).ino, before.ino);
    await assert.rejects(fs.lstat(path.join(candidateDirectory(fixture.runDir, 'candidate-01'), 'failures')), { code: 'ENOENT' });
  });
});

test('failure evidence rollback cleanup faults retain only a generated sibling and never attach evidence', async (t) => {
  const fixture = await installedFixture(t); const candidatePath = candidateDirectory(fixture.runDir, 'candidate-01');
  const before = await fs.stat(path.join(candidatePath, 'current-chain.json'));
  await assert.rejects(appendCandidateFailureEvidence({
    authority: fixture.authority, candidateId: 'candidate-01', expectedCurrentChainSha256: fixture.initial.chainHash,
    evidence: failureEvidence(fixture.initial.chainHash),
    fsImpl: failureAppendFs({ failCategory: 'candidateSync', failAt: 1, failRollbackCleanup: true })
  }), { code: 'P5_INSTALL_FAILED' });
  await assert.rejects(fs.lstat(path.join(candidatePath, 'failures')), { code: 'ENOENT' });
  assert.equal((await fs.stat(path.join(candidatePath, 'current-chain.json'))).ino, before.ino);
  const siblings = await fs.readdir(path.dirname(candidatePath));
  assert.ok(siblings.some((name) => name.startsWith(STAGE_PREFIX)));
});

test('failure evidence post-attach file identity swap is detached without deleting foreign data', async (t) => {
  const fixture = await installedFixture(t); const candidatePath = candidateDirectory(fixture.runDir, 'candidate-01');
  const currentPath = path.join(candidatePath, 'current-chain.json'); const before = await fs.stat(currentPath); const beforeBytes = await fs.readFile(currentPath);
  let attached = false; let swapped = false;
  const fsImpl = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
      if (destinationName === 'failures') attached = true;
      return result;
    },
    async readdir(target, ...args) {
      const resolved = await descriptorTargetFromPath(String(target));
      if (attached && !swapped && resolved.endsWith('/candidate-01/failures')) {
        const canonical = path.join(resolved, 'attempt-01.json');
        await fs.rename(canonical, path.join(resolved, 'attempt-01.original.json'));
        await fs.writeFile(canonical, '{"foreign":"must-survive"}\n');
        swapped = true;
      }
      return fs.readdir(target, ...args);
    }
  });
  await assert.rejects(appendCandidateFailureEvidence({
    authority: fixture.authority, candidateId: 'candidate-01', expectedCurrentChainSha256: fixture.initial.chainHash,
    evidence: failureEvidence(fixture.initial.chainHash), fsImpl
  }), { code: 'P5_INSTALL_FAILED' });
  assert.equal(swapped, true);
  assert.deepEqual(await fs.readFile(currentPath), beforeBytes); assert.equal((await fs.stat(currentPath)).ino, before.ino);
  await assert.rejects(fs.lstat(path.join(candidatePath, 'failures')), { code: 'ENOENT' });
  const generated = (await fs.readdir(path.dirname(candidatePath))).find((name) => name.startsWith(STAGE_PREFIX));
  assert.ok(generated);
  assert.equal(await fs.readFile(path.join(path.dirname(candidatePath), generated, 'attempt-01.json'), 'utf8'), '{"foreign":"must-survive"}\n');
  assert.equal(JSON.parse(await fs.readFile(path.join(path.dirname(candidatePath), generated, 'attempt-01.original.json'))).candidate_id, 'candidate-01');
});

test('admits only an existing absolute non-symlink run and exposes no descriptor', async (t) => {
  const fixture = await storageFixture(t);
  const authority = await admitExecuteRun({ runDir: fixture.runDir });
  t.after(() => authority.close());

  assert.deepEqual(Object.keys(authority), ['close']);
  assert.equal('fd' in authority, false);
  assert.equal('handle' in authority, false);
  await authority.close();
  await assertP5Failure(
    installCandidateSnapshot({ authority, candidateId: 'candidate-01', ...initialSnapshot() }),
    'P5_AUTHORITY_INVALID',
    fixture.root
  );
});

test('admission rejects missing, non-directory, relative, and unsafe path components', async (t) => {
  const fixture = await storageFixture(t);
  const nonDirectory = path.join(fixture.root, 'not-a-directory');
  await fs.writeFile(nonDirectory, 'provider-secret RAW_OS_TEXT\n');
  const unsafe = [
    'line\nfeed', 'tab\tcomponent', 'unit\u001fseparator', 'delete\u007f',
    'next\u0085line', 'line\u2028separator', 'paragraph\u2029separator'
  ];
  for (const runDir of [
    path.join(fixture.root, 'missing'),
    nonDirectory,
    'relative/run',
    ...unsafe.map((component) => path.join(fixture.root, component))
  ]) {
    await assertP5Failure(
      admitExecuteRun({ runDir }),
      'P5_AUTHORITY_INVALID',
      fixture.root,
      'provider-secret|RAW_OS_TEXT'
    );
  }
});

test('admission rejects a symlink in each caller-controlled position', async (t) => {
  const fixture = await storageFixture(t);
  const realParent = path.join(fixture.root, 'real-parent');
  const realRun = path.join(realParent, 'run');
  await fs.mkdir(realRun, { recursive: true });
  const linkedRoot = `${fixture.root}-link`;
  const linkedParent = path.join(fixture.root, 'linked-parent');
  const linkedRun = path.join(fixture.root, 'linked-run');
  await fs.symlink(fixture.root, linkedRoot);
  await fs.symlink(realParent, linkedParent);
  await fs.symlink(realRun, linkedRun);
  t.after(() => fs.rm(linkedRoot, { force: true }));

  for (const runDir of [
    path.join(linkedRoot, 'run'),
    path.join(linkedParent, 'run'),
    linkedRun
  ]) {
    await assertP5Failure(admitExecuteRun({ runDir }), 'P5_OUTPUT_OWNERSHIP', fixture.root);
  }
});

test('admission catches a directory swapped between lstat and descriptor open', async (t) => {
  const fixture = await storageFixture(t);
  const parked = `${fixture.runDir}-parked`;
  const outside = path.join(fixture.root, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.txt'), 'fixture-secret\n');
  let swapped = false;
  const fsImpl = fsWith({
    async lstat(target, ...args) {
      const stat = await fs.lstat(target, ...args);
      if (!swapped && String(target).endsWith('/run')) {
        swapped = true;
        await fs.rename(fixture.runDir, parked);
        await fs.symlink(outside, fixture.runDir);
      }
      return stat;
    }
  });

  await assertP5Failure(
    admitExecuteRun({ runDir: fixture.runDir, fsImpl }),
    'P5_OUTPUT_OWNERSHIP',
    fixture.root,
    'fixture-secret'
  );
  assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'fixture-secret\n');
});

test('candidate IDs are exactly candidate-01, candidate-02, and candidate-03', async (t) => {
  for (const candidateId of ['candidate-01', 'candidate-02', 'candidate-03']) {
    await t.test(candidateId, async (t) => {
      const fixture = await storageFixture(t);
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());
      const snapshot = initialSnapshot(candidateId);
      assert.equal((await installCandidateSnapshot({ authority, candidateId, ...snapshot })).status, 'created');
    });
  }
  for (const candidateId of ['candidate-00', 'candidate-04', 'candidate-1', '../candidate-01', 'candidate-01\n']) {
    await t.test(`reject ${JSON.stringify(candidateId)}`, async (t) => {
      const fixture = await storageFixture(t);
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());
      await assertP5Failure(
        installCandidateSnapshot({ authority, candidateId, ...initialSnapshot() }),
        'P5_AUTHORITY_INVALID',
        fixture.root
      );
    });
  }
});

test('selection manifest validator accepts only the exact canonical authority shape', () => {
  const files = selectionFiles('selected');
  const manifest = JSON.parse(files['manifest.json']);
  assert.deepEqual(validateExecuteSelectionManifest(manifest), manifest);
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.schema_version = 2; },
    (value) => { value.managed_paths.reverse(); },
    (value) => { value.managed_paths[0] = '../manifest.json'; },
    (value) => { value.artifact_hashes['manifest.json'] = '0'.repeat(64); }
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    assert.throws(() => validateExecuteSelectionManifest(invalid), { code: 'P5_AUTHORITY_INVALID' });
  }
});

test('installs and reads a complete first candidate snapshot with immutable bodies', async (t) => {
  const fixture = await storageFixture(t);
  const snapshot = initialSnapshot();
  const authority = await admitExecuteRun({ runDir: fixture.runDir });
  t.after(() => authority.close());

  const result = await installCandidateSnapshot({
    authority,
    candidateId: 'candidate-01',
    ...snapshot
  });
  assert.deepEqual(result, {
    status: 'created',
    candidate_id: 'candidate-01',
    current_chain_sha256: snapshot.chainHash
  });

  const candidatePath = candidateDirectory(fixture.runDir, 'candidate-01');
  const expectedFiles = expectedInstalledFiles(snapshot);
  assert.deepEqual(await readTreeBytes(candidatePath), expectedFiles);
  for (const relative of Object.keys(expectedFiles)) {
    const mode = (await fs.lstat(path.join(candidatePath, ...relative.split('/')))).mode & 0o777;
    assert.equal(mode, relative === 'current-chain.json' ? 0o600 : 0o400, relative);
  }

  const read = await readCurrentCandidateSnapshot({ authority, candidateId: 'candidate-01' });
  assert.equal(read.candidate_id, 'candidate-01');
  assert.equal(read.current_chain_sha256, snapshot.chainHash);
  assert.deepEqual(read.current_chain, snapshot.currentChain);
  assert.deepEqual(read.files, expectedFiles);
  read.current_chain.fill(0);
  read.files['current-chain.json'].fill(0);
  const reread = await readCurrentCandidateSnapshot({ authority, candidateId: 'candidate-01' });
  assert.deepEqual(reread.current_chain, snapshot.currentChain);
  assert.deepEqual(reread.files['current-chain.json'], expectedFiles['current-chain.json']);
});

test('closes every descriptor opened by admission and candidate installation', async (t) => {
  const fixture = await storageFixture(t);
  const openHandles = new Map();
  const fsImpl = fsWith({
    async open(target, ...args) {
      const handle = await fs.open(target, ...args);
      openHandles.set(handle.fd, String(target));
      return wrapFileHandle(handle, {
        async close() {
          openHandles.delete(handle.fd);
          return handle.close();
        }
      });
    }
  });
  const authority = await admitExecuteRun({ runDir: fixture.runDir, fsImpl });
  await installCandidateSnapshot({
    authority,
    candidateId: 'candidate-01',
    ...initialSnapshot()
  });
  const initial = initialSnapshot();
  await installCandidateSnapshot({
    authority,
    candidateId: 'candidate-01',
    ...initial,
    expectedPreviousChainSha256: initial.chainHash
  });
  await installCandidateSnapshot({
    authority,
    candidateId: 'candidate-01',
    ...replaySnapshot(initial),
    expectedPreviousChainSha256: initial.chainHash
  });
  await authority.close();
  assert.deepEqual([...openHandles.values()], []);
});

test('identical candidate installation is inode-for-inode unchanged', async (t) => {
  const fixture = await installedFixture(t);
  const before = await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01'));

  const result = await installCandidateSnapshot({
    authority: fixture.authority,
    candidateId: 'candidate-01',
    ...fixture.initial,
    expectedPreviousChainSha256: fixture.initial.chainHash
  });

  assert.equal(result.status, 'unchanged');
  assert.deepEqual(await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01')), before);
  assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
});

test('owned replacement requires the exact prior chain and retains every immutable body', async (t) => {
  const fixture = await installedFixture(t);
  const replacement = replaySnapshot(fixture.initial);

  const result = await installCandidateSnapshot({
    authority: fixture.authority,
    candidateId: 'candidate-01',
    ...replacement,
    expectedPreviousChainSha256: fixture.initial.chainHash
  });

  assert.equal(result.status, 'replaced');
  assert.equal(result.current_chain_sha256, replacement.chainHash);
  const expected = expectedInstalledFiles(replacement);
  assert.deepEqual(await readTreeBytes(candidateDirectory(fixture.runDir, 'candidate-01')), expected);
  for (const [name, bytes] of Object.entries(expectedInstalledFiles(fixture.initial))) {
    if (name !== 'current-chain.json') assert.deepEqual(expected[name], bytes, name);
  }
  assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
  assert.deepEqual(await generatedCandidateEntries(fixture.runDir), []);
});

test('revision 2 requires the complete bound attempt-01 evidence triplet', async (t) => {
  const fixture = await installedFixture(t);
  const replay = replaySnapshot(fixture.initial);
  for (const name of [
    'repairs/attempt-01-request.json',
    'repairs/attempt-01-patch.json',
    'repairs/attempt-01-result.json'
  ]) delete replay.files[name];

  await assert.rejects(installCandidateSnapshot({
    authority: fixture.authority,
    candidateId: 'candidate-01',
    files: replay.files,
    currentChain: replay.currentChain,
    expectedPreviousChainSha256: fixture.initial.chainHash
  }), { code: /P5_(?:AUTHORITY_INVALID|CHECKPOINT_INVALID|REPAIR_INVALID)/u });
});

test('replay promotion preserves every historical immutable body inode', async (t) => {
  const fixture = await installedFixture(t);
  const candidateDir = candidateDirectory(fixture.runDir, 'candidate-01');
  const historicalPaths = [
    'chains/chain-0001.json',
    ...LAYERS.map((layer) => `checkpoints/${layer}/r0001.json`),
    'reviews/chain-0001-hard-qa.json',
    'reviews/chain-0001-review.json'
  ];
  const before = Object.fromEntries(await Promise.all(historicalPaths.map(async (name) => [
    name, (await fs.stat(path.join(candidateDir, name))).ino
  ])));
  const replay = replaySnapshot(fixture.initial);
  await installCandidateSnapshot({
    authority: fixture.authority,
    candidateId: 'candidate-01',
    files: replay.files,
    currentChain: replay.currentChain,
    expectedPreviousChainSha256: fixture.initial.chainHash
  });
  for (const name of historicalPaths) {
    assert.equal((await fs.stat(path.join(candidateDir, name))).ino, before[name], name);
  }
});

test('stale previous chain hash leaves the exact current snapshot authoritative', async (t) => {
  const fixture = await installedFixture(t);
  const before = await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01'));
  await assertP5Failure(
    installCandidateSnapshot({
      authority: fixture.authority,
      candidateId: 'candidate-01',
      ...replaySnapshot(fixture.initial),
      expectedPreviousChainSha256: '0'.repeat(64)
    }),
    'P5_STALE_BASE',
    fixture.root
  );
  assert.deepEqual(await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01')), before);
});

test('rejects caller file-map shape before staging', async (t) => {
  for (const [name, mutate] of [
    ['missing', (snapshot) => { delete snapshot.files['checkpoints/roof/r0001.json']; }],
    ['extra', (snapshot) => { snapshot.files['unknown/provider-secret.json'] = Buffer.from('RAW_EXTRA'); }],
    ['pointer-supplied', (snapshot) => { snapshot.files['current-chain.json'] = snapshot.currentChain; }],
    ['current-chain-body-supplied', (snapshot) => { snapshot.files['chains/chain-0001.json'] = snapshot.currentChain; }],
    ['non-buffer', (snapshot) => { snapshot.files['checkpoints/roof/r0001.json'] = '{}\n'; }],
    ['reserved-repair', (snapshot) => { snapshot.files['repairs/attempt-01-request.json'] = canonicalBytes({ reserved: true }); }],
    ['reserved-failure', (snapshot) => { snapshot.files['failures/attempt-01.json'] = canonicalBytes({ reserved: true }); }]
  ]) {
    await t.test(name, async (t) => {
      const fixture = await storageFixture(t);
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());
      const snapshot = initialSnapshot();
      mutate(snapshot);
      await assertP5Failure(
        installCandidateSnapshot({ authority, candidateId: 'candidate-01', ...snapshot }),
        'P5_AUTHORITY_INVALID',
        fixture.root,
        'provider-secret|RAW_EXTRA'
      );
      assert.equal(await p5Exists(fixture.runDir), false);
    });
  }
});

test('rejects malformed, noncanonical, path-drifted, and hash-drifted checkpoint or chain bodies', async (t) => {
  for (const [name, mutate] of [
    ['corrupt-checkpoint', (snapshot) => { snapshot.files['checkpoints/roof/r0001.json'] = Buffer.from('{provider-secret'); }],
    ['noncanonical-checkpoint', (snapshot) => {
      const key = 'checkpoints/roof/r0001.json';
      snapshot.files[key] = Buffer.from(JSON.stringify(JSON.parse(snapshot.files[key])));
    }],
    ['checkpoint-path-drift', (snapshot) => {
      snapshot.files['checkpoints/roof/r0002.json'] = snapshot.files['checkpoints/roof/r0001.json'];
      delete snapshot.files['checkpoints/roof/r0001.json'];
    }],
    ['checkpoint-hash-drift', (snapshot) => {
      const key = 'checkpoints/roof/r0001.json';
      const value = JSON.parse(snapshot.files[key]);
      value.design_intent.purpose = 'provider-secret';
      snapshot.files[key] = canonicalBytes(value);
    }],
    ['unreferenced-checkpoint', (snapshot) => {
      const [extra] = buildEnvelopes('candidate-01', 3, snapshot.chainHash, TRANSACTION_HASH);
      snapshot.files['checkpoints/brief/r0003.json'] = checkpointBytes(extra);
    }],
    ['review-without-chain', (snapshot) => {
      snapshot.files['reviews/chain-9999-review.json'] = canonicalBytes({ status: 'orphaned' });
    }],
    ['missing-frozen-authority', (snapshot) => {
      delete snapshot.files['frozen/frozen-design.json'];
      delete snapshot.files['frozen/frozen-generator-context.json'];
    }],
    ['draft-checkpoint', (snapshot) => {
      rebindCheckpoint(snapshot, 'roof', (checkpoint) => { checkpoint.status = 'draft'; });
    }],
    ['spliced-upstream', (snapshot) => {
      rebindCheckpoint(snapshot, 'massing', (checkpoint) => {
        checkpoint.upstream_accepted_hashes[0].checkpoint_sha256 = '0'.repeat(64);
      });
    }],
    ['initial-revision-two', (snapshot) => rewriteCurrentCheckpoints(snapshot, (checkpoint) => {
      checkpoint.revision = 2;
    })],
    ['initial-replay-origin', (snapshot) => {
      rebindCheckpoint(snapshot, 'roof', (checkpoint) => {
        checkpoint.replay_origin = {
          kind: 'replay',
          base_chain_sha256: STORAGE_AUTHORITIES.get('candidate-01').designHash,
          repair_transaction_sha256: TRANSACTION_HASH
        };
      });
    }],
    ['chain-final-authority-drift', (snapshot) => {
      const chain = JSON.parse(snapshot.currentChain);
      chain.hard_qa_sha256 = '8'.repeat(64);
      snapshot.currentChain = canonicalBytes(chain);
    }],
    ['corrupt-chain', (snapshot) => { snapshot.currentChain = Buffer.from('{RAW_CHAIN_FAILURE'); }],
    ['noncanonical-chain', (snapshot) => { snapshot.currentChain = Buffer.from(JSON.stringify(JSON.parse(snapshot.currentChain))); }],
    ['chain-candidate-drift', (snapshot) => {
      const value = JSON.parse(snapshot.currentChain);
      value.candidate_id = 'candidate-02';
      snapshot.currentChain = canonicalBytes(value);
    }]
  ]) {
    await t.test(name, async (t) => {
      const fixture = await storageFixture(t);
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());
      const snapshot = initialSnapshot();
      mutate(snapshot);
      await assertP5Failure(
        installCandidateSnapshot({ authority, candidateId: 'candidate-01', ...snapshot }),
        'P5_CHECKPOINT_INVALID',
        fixture.root,
        'provider-secret|RAW_CHAIN_FAILURE'
      );
      assert.equal(await p5Exists(fixture.runDir), false);
    });
  }
});

test('rejects replay origin gaps and origins not bound to the parent transaction', async (t) => {
  for (const [name, mutate] of [
    ['origin-gap', (checkpoint, layer) => {
      if (layer === 'structure') checkpoint.replay_origin = null;
    }],
    ['wrong-parent', (checkpoint, layer) => {
      if (layer === 'roof') checkpoint.replay_origin.base_chain_sha256 = '7'.repeat(64);
    }],
    ['wrong-transaction', (checkpoint, layer) => {
      if (layer === 'facade') checkpoint.replay_origin.repair_transaction_sha256 = '6'.repeat(64);
    }]
  ]) {
    await t.test(name, async (t) => {
      const fixture = await installedFixture(t);
      const replacement = replaySnapshot(fixture.initial);
      rewriteCurrentCheckpoints(replacement, mutate);
      await assertP5Failure(
        installCandidateSnapshot({
          authority: fixture.authority,
          candidateId: 'candidate-01',
          ...replacement,
          expectedPreviousChainSha256: fixture.initial.chainHash
        }),
        'P5_CHECKPOINT_INVALID',
        fixture.root
      );
    });
  }
});

test('rejects replay chains that drift immutable frozen authority hashes', async (t) => {
  for (const [field, value] of [
    ['frozen_design_sha256', '1'.repeat(64)],
    ['frozen_generator_context_sha256', '2'.repeat(64)]
  ]) {
    await t.test(field, async (t) => {
      const fixture = await installedFixture(t);
      const replacement = replaySnapshot(fixture.initial);
      const chain = JSON.parse(replacement.currentChain);
      chain[field] = value;
      replacement.currentChain = canonicalBytes(chain);
      await assertP5Failure(
        installCandidateSnapshot({
          authority: fixture.authority,
          candidateId: 'candidate-01',
          ...replacement,
          expectedPreviousChainSha256: fixture.initial.chainHash
        }),
        'P5_CHECKPOINT_INVALID',
        fixture.root
      );
    });
  }
});

test('rejects an existing unowned candidate, unknown body, or symlink without touching targets', async (t) => {
  for (const scenario of ['unowned-root', 'unknown-body', 'candidate-symlink', 'body-symlink']) {
    await t.test(scenario, async (t) => {
      const fixture = await storageFixture(t);
      const outside = path.join(fixture.root, 'outside');
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, 'provider-secret.txt'), 'outside immutable bytes\n');
      if (scenario === 'unowned-root') {
        await fs.mkdir(path.join(fixture.runDir, 'playbook-execute'));
        await fs.writeFile(path.join(fixture.runDir, 'playbook-execute', 'foreign.txt'), 'foreign\n');
      } else if (scenario === 'candidate-symlink') {
        await fs.mkdir(path.join(fixture.runDir, 'playbook-execute', 'candidates'), { recursive: true });
        await fs.symlink(outside, candidateDirectory(fixture.runDir, 'candidate-01'));
      } else {
        const authority = await admitExecuteRun({ runDir: fixture.runDir });
        await installCandidateSnapshot({ authority, candidateId: 'candidate-01', ...initialSnapshot() });
        await authority.close();
        const candidatePath = candidateDirectory(fixture.runDir, 'candidate-01');
        if (scenario === 'unknown-body') {
          await fs.writeFile(path.join(candidatePath, 'unknown.txt'), 'foreign\n');
        } else {
          const target = path.join(outside, 'provider-secret.txt');
          const body = path.join(candidatePath, 'current-chain.json');
          await fs.rename(body, `${body}.parked`);
          await fs.symlink(target, body);
        }
      }
      const before = await snapshotTree(fixture.root);
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());
      await assertP5Failure(
        installCandidateSnapshot({ authority, candidateId: 'candidate-01', ...initialSnapshot() }),
        'P5_OUTPUT_OWNERSHIP',
        fixture.root,
        'provider-secret'
      );
      assert.deepEqual(await snapshotTree(fixture.root), before);
    });
  }
});

test('read rejects unknown, missing, drifted, and symlinked candidate bodies', async (t) => {
  for (const [name, mutate] of [
    ['unknown', async (candidatePath) => fs.writeFile(path.join(candidatePath, 'foreign.txt'), 'x')],
    ['missing', async (candidatePath) => fs.unlink(path.join(candidatePath, 'current-chain.json'))],
    ['drifted', async (candidatePath) => fs.chmod(path.join(candidatePath, 'current-chain.json'), 0o600).then(() => fs.writeFile(path.join(candidatePath, 'current-chain.json'), '{}\n'))],
    ['symlinked', async (candidatePath, fixture) => {
      const body = path.join(candidatePath, 'current-chain.json');
      const outside = path.join(fixture.root, 'outside-chain.json');
      await fs.writeFile(outside, '{}\n');
      await fs.unlink(body);
      await fs.symlink(outside, body);
    }]
  ]) {
    await t.test(name, async (t) => {
      const fixture = await installedFixture(t);
      await mutate(candidateDirectory(fixture.runDir, 'candidate-01'), fixture);
      await assertP5Failure(
        readCurrentCandidateSnapshot({ authority: fixture.authority, candidateId: 'candidate-01' }),
        'P5_OUTPUT_OWNERSHIP',
        fixture.root
      );
    });
  }
});

test('a private stage collision is retried and the colliding bytes are preserved', async (t) => {
  const fixture = await storageFixture(t);
  let collisionName;
  const fsImpl = fsWith({
    async mkdir(target, options) {
      if (!collisionName && path.basename(String(target)).startsWith(STAGE_PREFIX)) {
        collisionName = path.basename(String(target));
        await fs.mkdir(target, options);
        await fs.writeFile(path.join(String(target), 'foreign.txt'), 'collision bytes\n');
        throw Object.assign(new Error('RAW_STAGE_COLLISION'), { code: 'EEXIST' });
      }
      return fs.mkdir(target, options);
    }
  });
  const authority = await admitExecuteRun({ runDir: fixture.runDir });
  t.after(() => authority.close());

  assert.equal((await installCandidateSnapshot({
    authority,
    candidateId: 'candidate-01',
    ...initialSnapshot(),
    fsImpl
  })).status, 'created');
  assert.equal(
    await fs.readFile(path.join(
      fixture.runDir,
      'playbook-execute',
      'candidates',
      collisionName,
      'foreign.txt'
    ), 'utf8'),
    'collision bytes\n'
  );
});

test('first-install precommit failure removes only the topology created by that call', async (t) => {
  const fixture = await storageFixture(t);
  const before = await snapshotTree(fixture.root);
  const fsImpl = fsWith({
    async open(target, flags, ...args) {
      if (
        (flags & constants.O_WRONLY) !== 0
        && await pathContainsGeneratedName(String(target), STAGE_PREFIX)
      ) throw new Error('RAW_FIRST_INSTALL_WRITE_FAILURE');
      return fs.open(target, flags, ...args);
    }
  });
  const authority = await admitExecuteRun({ runDir: fixture.runDir });
  t.after(() => authority.close());

  await assertP5Failure(
    installCandidateSnapshot({
      authority,
      candidateId: 'candidate-01',
      ...initialSnapshot(),
      fsImpl
    }),
    'P5_INSTALL_FAILED',
    fixture.root,
    'RAW_FIRST_INSTALL_WRITE_FAILURE'
  );
  assert.deepEqual(await snapshotTree(fixture.root), before);
});

test('mkdir followed by directory open failure removes only the directory created by that call', async (t) => {
  for (const basename of ['playbook-execute', 'candidates']) {
    await t.test(basename, async (t) => {
      const fixture = await storageFixture(t);
      const before = await snapshotTree(fixture.root);
      const created = new Set();
      let failed = false;
      const fsImpl = fsWith({
        async mkdir(target, options) {
          const result = await fs.mkdir(target, options);
          if (path.basename(String(target)) === basename) created.add(String(target));
          return result;
        },
        async open(target, flags, ...args) {
          if (!failed && created.has(String(target))) {
            failed = true;
            throw new Error('RAW_CREATED_DIRECTORY_OPEN_FAILURE');
          }
          return fs.open(target, flags, ...args);
        }
      });
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());

      await assertP5Failure(
        installCandidateSnapshot({
          authority,
          candidateId: 'candidate-01',
          ...initialSnapshot(),
          fsImpl
        }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_CREATED_DIRECTORY_OPEN_FAILURE'
      );
      assert.equal(failed, true);
      assert.deepEqual(await snapshotTree(fixture.root), before);
    });
  }
});

test('mkdir followed by parent sync failure restores exact first-install topology', async (t) => {
  for (const basename of ['playbook-execute', 'candidates']) {
    await t.test(basename, async (t) => {
      const fixture = await storageFixture(t);
      const before = await snapshotTree(fixture.root);
      let created = false;
      let failed = false;
      const fsImpl = fsWith({
        async mkdir(target, options) {
          const result = await fs.mkdir(target, options);
          if (path.basename(String(target)) === basename) created = true;
          return result;
        },
        async open(target, flags, ...args) {
          const handle = await fs.open(target, flags, ...args);
          const targetBasename = path.basename(String(target));
          const parentForCreated = basename === 'playbook-execute'
            ? targetBasename === path.basename(fixture.runDir)
            : targetBasename === 'playbook-execute';
          if (!parentForCreated) return handle;
          return wrapFileHandle(handle, {
            async sync() {
              if (created && !failed) {
                failed = true;
                throw new Error('RAW_CREATED_DIRECTORY_SYNC_FAILURE');
              }
              return handle.sync();
            }
          });
        }
      });
      const authority = await admitExecuteRun({ runDir: fixture.runDir, fsImpl });
      t.after(() => authority.close());

      await assertP5Failure(
        installCandidateSnapshot({ authority, candidateId: 'candidate-01', ...initialSnapshot() }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_CREATED_DIRECTORY_SYNC_FAILURE'
      );
      assert.equal(failed, true);
      assert.deepEqual(await snapshotTree(fixture.root), before);
    });
  }
});

test('post-mkdir authority failure restores exact first-install topology', async (t) => {
  for (const basename of ['playbook-execute', 'candidates']) {
    await t.test(basename, async (t) => {
      const fixture = await storageFixture(t);
      const before = await snapshotTree(fixture.root);
      let createdTarget;
      let failed = false;
      const fsImpl = fsWith({
        async mkdir(target, options) {
          const result = await fs.mkdir(target, options);
          if (path.basename(String(target)) === basename) createdTarget = String(target);
          return result;
        },
        async lstat(target, ...args) {
          if (
            createdTarget
            && !failed
            && path.basename(String(target)) === path.basename(fixture.runDir)
          ) {
            failed = true;
            throw new Error('RAW_POST_MKDIR_AUTHORITY_FAILURE');
          }
          return fs.lstat(target, ...args);
        }
      });
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());

      await assertP5Failure(
        installCandidateSnapshot({
          authority,
          candidateId: 'candidate-01',
          ...initialSnapshot(),
          fsImpl
        }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_POST_MKDIR_AUTHORITY_FAILURE'
      );
      assert.equal(failed, true);
      assert.deepEqual(await snapshotTree(fixture.root), before);
    });
  }
});

test('first post-mkdir identity-probe ambiguity preserves created and foreign inodes', async (t) => {
  for (const basename of ['playbook-execute', 'candidates']) {
    await t.test(basename, async (t) => {
      const fixture = await storageFixture(t);
      const canonical = basename === 'playbook-execute'
        ? path.join(fixture.runDir, 'playbook-execute')
        : path.join(fixture.runDir, 'playbook-execute', 'candidates');
      const parked = basename === 'playbook-execute'
        ? path.join(fixture.runDir, 'parked-ambiguous-playbook-execute')
        : path.join(fixture.runDir, 'playbook-execute', 'parked-ambiguous-candidates');
      let createdTarget;
      let parkedBefore;
      let foreignBefore;
      let failed = false;
      const postMkdirLstats = [];
      const fsImpl = fsWith({
        async mkdir(target, options) {
          const result = await fs.mkdir(target, options);
          if (path.basename(String(target)) === basename) createdTarget = String(target);
          return result;
        },
        async lstat(target, ...args) {
          if (createdTarget && !failed) {
            postMkdirLstats.push(String(target));
            if (String(target) === createdTarget) {
              failed = true;
              parkedBefore = await inodeTree(canonical);
              await fs.rename(canonical, parked);
              await fs.mkdir(canonical);
              await fs.writeFile(path.join(canonical, 'foreign.txt'), 'foreign ambiguous directory\n');
              foreignBefore = await inodeTree(canonical);
              throw new Error('RAW_FIRST_IDENTITY_PROBE_FAILURE');
            }
          }
          return fs.lstat(target, ...args);
        }
      });
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());

      await assertP5Failure(
        installCandidateSnapshot({
          authority,
          candidateId: 'candidate-01',
          ...initialSnapshot(),
          fsImpl
        }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_FIRST_IDENTITY_PROBE_FAILURE|foreign ambiguous directory'
      );
      assert.equal(failed, true);
      assert.deepEqual(postMkdirLstats, [createdTarget]);
      assert.deepEqual(await inodeTree(parked), parkedBefore);
      assert.deepEqual(await inodeTree(canonical), foreignBefore);
    });
  }
});

test('EEXIST adoption is never rolled back as a directory created by this call', async (t) => {
  for (const basename of ['playbook-execute', 'candidates']) {
    await t.test(basename, async (t) => {
      const fixture = await storageFixture(t);
      let actorPath;
      let actorIdentity;
      let raced = false;
      const fsImpl = fsWith({
        async mkdir(target, options) {
          if (!raced && path.basename(String(target)) === basename) {
            await fs.mkdir(target, options);
            actorPath = basename === 'playbook-execute'
              ? path.join(fixture.runDir, 'playbook-execute')
              : path.join(fixture.runDir, 'playbook-execute', 'candidates');
            actorIdentity = fileIdentity(await fs.lstat(actorPath));
            raced = true;
            throw Object.assign(new Error('RAW_ACTOR_EEXIST'), { code: 'EEXIST' });
          }
          return fs.mkdir(target, options);
        },
        async open(target, flags, ...args) {
          if (
            raced
            && (flags & constants.O_WRONLY) !== 0
            && await pathContainsGeneratedName(String(target), STAGE_PREFIX)
          ) throw new Error('RAW_AFTER_EEXIST_FAILURE');
          return fs.open(target, flags, ...args);
        }
      });
      const authority = await admitExecuteRun({ runDir: fixture.runDir });
      t.after(() => authority.close());

      await assertP5Failure(
        installCandidateSnapshot({
          authority,
          candidateId: 'candidate-01',
          ...initialSnapshot(),
          fsImpl
        }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_AFTER_EEXIST_FAILURE'
      );
      assert.equal(raced, true);
      assert.deepEqual(fileIdentity(await fs.lstat(actorPath)), actorIdentity);
      assert.deepEqual(await fs.readdir(actorPath), []);
    });
  }
});

test('first-install cleanup identity swap preserves both created and foreign directories', async (t) => {
  const fixture = await storageFixture(t);
  const candidatesPath = path.join(fixture.runDir, 'playbook-execute', 'candidates');
  const parked = path.join(fixture.runDir, 'playbook-execute', 'parked-created-candidates');
  let parkedBefore;
  let foreignIdentity;
  let swapped = false;
  const fsImpl = fsWith({
    async open(target, flags, ...args) {
      if (
        (flags & constants.O_WRONLY) !== 0
        && await pathContainsGeneratedName(String(target), STAGE_PREFIX)
      ) throw new Error('RAW_TRIGGER_CREATED_CLEANUP');
      const handle = await fs.open(target, flags, ...args);
      if (path.basename(String(target)) !== 'candidates') return handle;
      return wrapFileHandle(handle, {
        async close() {
          if (!swapped) {
            await fs.rename(candidatesPath, parked);
            parkedBefore = await inodeTree(parked);
            await fs.mkdir(candidatesPath);
            foreignIdentity = fileIdentity(await fs.lstat(candidatesPath));
            swapped = true;
          }
          return handle.close();
        }
      });
    }
  });
  const authority = await admitExecuteRun({ runDir: fixture.runDir });
  t.after(() => authority.close());

  await assertP5Failure(
    installCandidateSnapshot({
      authority,
      candidateId: 'candidate-01',
      ...initialSnapshot(),
      fsImpl
    }),
    'P5_INSTALL_FAILED',
    fixture.root,
    'RAW_TRIGGER_CREATED_CLEANUP'
  );
  assert.equal(swapped, true);
  assert.deepEqual(await inodeTree(parked), parkedBefore);
  assert.deepEqual(fileIdentity(await fs.lstat(candidatesPath)), foreignIdentity);
});

test('candidate immutable-body and pointer precommit faults preserve old authority', async (t) => {
  const categories = [
    'exclusiveWrite', 'stageWrite', 'fileSync', 'chmod', 'bodyMove',
    'parentSync', 'pointerWrite', 'backupLink', 'pointerMove', 'pointerDirSync'
  ];
  for (const category of categories) {
    await t.test(category, async (t) => {
      const fixture = await installedFixture(t);
      const candidatePath = candidateDirectory(fixture.runDir, 'candidate-01');
      const beforeTree = await inodeTree(candidatePath);
      const pointerPath = path.join(candidatePath, 'current-chain.json');
      const beforePointer = await fs.readFile(pointerPath);
      const beforePointerStat = await fs.stat(pointerPath);
      await assertP5Failure(
        installCandidateSnapshot({
          authority: fixture.authority,
          candidateId: 'candidate-01',
          ...replaySnapshot(fixture.initial),
          expectedPreviousChainSha256: fixture.initial.chainHash,
          fsImpl: candidatePointerFaultFs(category)
        }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_POINTER_FAULT'
      );
      assert.deepEqual(await fs.readFile(pointerPath), beforePointer);
      assert.equal((await fs.stat(pointerPath)).ino, beforePointerStat.ino);
      const current = await readCurrentCandidateSnapshot({
        authority: fixture.authority,
        candidateId: 'candidate-01'
      });
      assert.equal(current.current_chain_sha256, fixture.initial.chainHash);
      assertHistoricalRowsUnchanged(beforeTree, await inodeTree(candidatePath));
      assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
    });
  }
});

test('candidate pointer cleanup faults are postcommit and preserve historical bodies', async (t) => {
  const fixture = await installedFixture(t);
  const beforeTree = await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01'));
  const replacement = replaySnapshot(fixture.initial);
  let backupLinked = false;
  const fsImpl = fsWith({
    async link(source, destination) {
      const result = await fs.link(source, destination);
      if (path.basename(String(destination)).startsWith(BACKUP_PREFIX)) backupLinked = true;
      return result;
    },
    async unlink(target) {
      if (backupLinked && path.basename(String(target)).startsWith(BACKUP_PREFIX)) {
        throw new Error('RAW_POINTER_FAULT:cleanup');
      }
      return fs.unlink(target);
    }
  });
  const result = await installCandidateSnapshot({
    authority: fixture.authority,
    candidateId: 'candidate-01',
    ...replacement,
    expectedPreviousChainSha256: fixture.initial.chainHash,
    fsImpl
  });
  assert.equal(result.status, 'replaced');
  const current = await readCurrentCandidateSnapshot({
    authority: fixture.authority,
    candidateId: 'candidate-01'
  });
  assert.equal(current.current_chain_sha256, replacement.chainHash);
  assertHistoricalRowsUnchanged(beforeTree.filter((row) => row.relative !== 'current-chain.json'),
    await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01')));
  assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
});

test('candidate subprocess crashes reopen to one complete old-or-new chain', async (t) => {
  for (const killPoint of [
    'body-write:1', 'body-file-sync:1', 'body-file-sync:2', 'body-chmod:1',
    'body-move:1', 'candidate-dir-sync:1', 'pointer-write:1', 'backup-link:1',
    'pointer-move:1', 'pointer-dir-sync:1'
  ]) {
    await t.test(killPoint, async (t) => {
      const fixture = await installedFixture(t);
      const candidatePath = candidateDirectory(fixture.runDir, 'candidate-01');
      const historical = (await inodeTree(candidatePath)).filter((row) => row.relative !== 'current-chain.json');
      const replacement = replaySnapshot(fixture.initial);
      const jobPath = path.join(fixture.root, `candidate-crash-${killPoint.replace(':', '-')}.json`);
      await fs.writeFile(jobPath, JSON.stringify({
        kind: 'candidate',
        killPoint,
        runDir: fixture.runDir,
        candidateId: 'candidate-01',
        files: encodeFiles(replacement.files),
        currentChain: replacement.currentChain.toString('base64'),
        expectedPreviousChainSha256: fixture.initial.chainHash
      }));
      const child = spawnSync(process.execPath, [CRASH_WORKER, jobPath], {
        cwd: path.resolve(import.meta.dirname, '..'),
        encoding: 'utf8',
        timeout: 30000
      });
      assert.equal(child.signal, 'SIGKILL', `${killPoint}: ${child.stderr}`);
      const current = await readCurrentCandidateSnapshot({
        authority: fixture.authority,
        candidateId: 'candidate-01'
      });
      assert.ok([fixture.initial.chainHash, replacement.chainHash].includes(current.current_chain_sha256));
      assertHistoricalRowsUnchanged(historical, await inodeTree(candidatePath));
      assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
    });
  }
});

function candidatePointerFaultFs(failCategory) {
  let pointerMoved = false;
  let failed = false;
  const fail = (category) => {
    if (!failed && category === failCategory) {
      failed = true;
      throw new Error(`RAW_POINTER_FAULT:${category}`);
    }
  };
  return fsWith({
    async open(target, flags, ...args) {
      const targetText = String(target);
      const inStage = await pathContainsGeneratedName(targetText, STAGE_PREFIX);
      if (inStage && (flags & constants.O_WRONLY) !== 0) fail('exclusiveWrite');
      const handle = await fs.open(target, flags, ...args);
      const stat = await handle.stat();
      const candidateDirectoryHandle = stat.isDirectory() && path.basename(targetText) === 'candidate-01';
      return wrapFileHandle(handle, {
        async writeFile(value, ...writeArgs) {
          const pointer = isCandidatePointerBytes(value);
          if (inStage) fail(pointer ? 'pointerWrite' : 'stageWrite');
          return handle.writeFile(value, ...writeArgs);
        },
        async sync(...syncArgs) {
          if (inStage && stat.isFile()) fail('fileSync');
          if (candidateDirectoryHandle) fail(pointerMoved ? 'pointerDirSync' : 'parentSync');
          return handle.sync(...syncArgs);
        },
        async chmod(...chmodArgs) {
          if (inStage) fail('chmod');
          return handle.chmod(...chmodArgs);
        }
      });
    },
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      if (sourceName.startsWith(STAGE_PREFIX) && destinationName !== 'current-chain.json') fail('bodyMove');
      return next(sourceHandle, sourceName, destinationHandle, destinationName);
    },
    async link(source, destination) {
      if (path.basename(String(destination)).startsWith(BACKUP_PREFIX)) fail('backupLink');
      return fs.link(source, destination);
    },
    async rename(source, destination) {
      if (path.basename(String(destination)) === 'current-chain.json') {
        fail('pointerMove');
        const result = await fs.rename(source, destination);
        pointerMoved = true;
        return result;
      }
      return fs.rename(source, destination);
    }
  });
}

function isCandidatePointerBytes(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value).toString('utf8'));
    return Object.keys(parsed).sort().join(',') ===
      'candidate_id,chain_revision,chain_sha256,schema_version';
  } catch {
    return false;
  }
}

function assertHistoricalRowsUnchanged(before, after) {
  const byPath = new Map(after.map((row) => [row.relative, row]));
  for (const row of before) assert.deepEqual(byPath.get(row.relative), row, row.relative);
}


test('selection installs only after all candidates and exact manifest hashes validate', async (t) => {
  const fixture = await storageFixture(t);
  const authority = await admitExecuteRun({ runDir: fixture.runDir });
  t.after(() => authority.close());
  const files = selectionFiles();

  await assertP5Failure(
    installExecuteSelection({ authority, files }),
    'P5_INSTALL_FAILED',
    fixture.root
  );
  for (const candidateId of ['candidate-01', 'candidate-02']) {
    await installCandidateSnapshot({ authority, candidateId, ...initialSnapshot(candidateId) });
  }
  await assertP5Failure(
    installExecuteSelection({ authority, files }),
    'P5_INSTALL_FAILED',
    fixture.root
  );
  await installCandidateSnapshot({
    authority,
    candidateId: 'candidate-03',
    ...initialSnapshot('candidate-03')
  });
  const result = await installExecuteSelection({ authority, files });
  assert.equal(result.status, 'created');
  assert.deepEqual(result.artifact_hashes, {
    'selection.json': testHash(files['selection.json']),
    'selection-report.md': testHash(files['selection-report.md'])
  });
  assert.match(result.generation, /^selection-generations\/selection-[a-f0-9]{64}$/u);
  const pointer = JSON.parse(await fs.readFile(path.join(fixture.runDir, 'playbook-execute', 'manifest.json')));
  assert.equal(pointer.generation, result.generation);
  for (const name of Object.keys(files)) {
    assert.deepEqual(await fs.readFile(path.join(fixture.runDir, 'playbook-execute', result.generation, name)), files[name]);
  }
});

test('selection publishes immutable complete generations through one current pointer', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const executeRoot = path.join(fixture.runDir, 'playbook-execute');
  await installExecuteSelection({ authority: fixture.authority, files: selectionFiles('first') });
  const firstPointer = JSON.parse(await fs.readFile(path.join(executeRoot, 'manifest.json')));
  assert.deepEqual(Object.keys(firstPointer), [
    'generation', 'manifest_sha256', 'schema_version'
  ]);
  const firstGeneration = path.join(executeRoot, firstPointer.generation);
  const firstInodes = await inodeTree(firstGeneration);

  await installExecuteSelection({ authority: fixture.authority, files: selectionFiles('second') });
  const secondPointer = JSON.parse(await fs.readFile(path.join(executeRoot, 'manifest.json')));
  assert.notEqual(secondPointer.generation, firstPointer.generation);
  assert.deepEqual(await inodeTree(firstGeneration), firstInodes);
  for (const name of ['manifest.json', 'selection.json', 'selection-report.md']) {
    await fs.access(path.join(executeRoot, secondPointer.generation, name));
  }
});

test('selection identical and replacement paths update only one current pointer', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const root = path.join(fixture.runDir, 'playbook-execute');
  const candidatesBefore = await allCandidateInodes(fixture.runDir);
  const oldFiles = selectionFiles('old');
  const first = await installExecuteSelection({ authority: fixture.authority, files: oldFiles });
  const pointerPath = path.join(root, 'manifest.json');
  const pointerBefore = await fs.readFile(pointerPath);
  const pointerStatBefore = await fs.stat(pointerPath);
  const oldGenerationBefore = await inodeTree(path.join(root, first.generation));

  const unchanged = await installExecuteSelection({ authority: fixture.authority, files: oldFiles });
  assert.equal(unchanged.status, 'unchanged');
  assert.equal(unchanged.generation, first.generation);
  assert.deepEqual(await fs.readFile(pointerPath), pointerBefore);
  assert.equal((await fs.stat(pointerPath)).ino, pointerStatBefore.ino);

  const newFiles = selectionFiles('new');
  const replaced = await installExecuteSelection({ authority: fixture.authority, files: newFiles });
  assert.equal(replaced.status, 'replaced');
  assert.notEqual(replaced.generation, first.generation);
  assert.deepEqual(await inodeTree(path.join(root, first.generation)), oldGenerationBefore);
  for (const [name, body] of Object.entries(newFiles)) {
    assert.deepEqual(await fs.readFile(path.join(root, replaced.generation, name)), body);
  }
  assert.deepEqual(await allCandidateInodes(fixture.runDir), candidatesBefore);
});

test('selection generation and pointer precommit faults preserve old logical authority', async (t) => {
  const categories = [
    'exclusiveWrite', 'stageWrite', 'fileSync', 'chmod', 'stageDirSync',
    'generationMove', 'pointerWrite', 'backupLink', 'pointerMove', 'rootSyncAfterPointer'
  ];
  for (const category of categories) {
    await t.test(category, async (t) => {
      const fixture = await threeCandidateFixture(t);
      const root = path.join(fixture.runDir, 'playbook-execute');
      const first = await installExecuteSelection({
        authority: fixture.authority,
        files: selectionFiles('old')
      });
      const pointerPath = path.join(root, 'manifest.json');
      const pointerBefore = await fs.readFile(pointerPath);
      const pointerStatBefore = await fs.stat(pointerPath);
      const generationBefore = await inodeTree(path.join(root, first.generation));
      const candidatesBefore = await allCandidateInodes(fixture.runDir);
      const unrelated = path.join(fixture.runDir, 'world-region.bin');
      await fs.writeFile(unrelated, Buffer.from([0, 1, 2, 255]));
      await assertP5Failure(
        installExecuteSelection({
          authority: fixture.authority,
          files: selectionFiles('new'),
          fsImpl: selectionPointerFaultFs(category)
        }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_SELECTION_POINTER_FAULT'
      );
      assert.deepEqual(await fs.readFile(pointerPath), pointerBefore);
      assert.equal((await fs.stat(pointerPath)).ino, pointerStatBefore.ino);
      assert.deepEqual(await inodeTree(path.join(root, first.generation)), generationBefore);
      assert.deepEqual(await allCandidateInodes(fixture.runDir), candidatesBefore);
      assert.deepEqual(await fs.readFile(unrelated), Buffer.from([0, 1, 2, 255]));
      const current = JSON.parse(await fs.readFile(pointerPath));
      assert.equal(current.generation, first.generation);
    });
  }
});

test('selection pointer backup cleanup faults are postcommit', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const root = path.join(fixture.runDir, 'playbook-execute');
  const first = await installExecuteSelection({ authority: fixture.authority, files: selectionFiles('old') });
  const firstGeneration = await inodeTree(path.join(root, first.generation));
  const replacementFiles = selectionFiles('new');
  const result = await installExecuteSelection({
    authority: fixture.authority,
    files: replacementFiles,
    fsImpl: fsWith({
      async unlink(target) {
        if (path.basename(String(target)).startsWith(BACKUP_PREFIX)) {
          throw new Error('RAW_SELECTION_POINTER_FAULT:cleanup');
        }
        return fs.unlink(target);
      }
    })
  });
  assert.equal(result.status, 'replaced');
  const pointer = JSON.parse(await fs.readFile(path.join(root, 'manifest.json')));
  assert.equal(pointer.generation, result.generation);
  for (const [name, body] of Object.entries(replacementFiles)) {
    assert.deepEqual(await fs.readFile(path.join(root, result.generation, name)), body);
  }
  assert.deepEqual(await inodeTree(path.join(root, first.generation)), firstGeneration);
});

test('selection subprocess crashes reopen to one complete old-or-new generation', async (t) => {
  for (const killPoint of [
    'generation-write:1', 'generation-file-sync:1', 'generation-file-sync:2',
    'generation-chmod:1', 'generation-dir-sync:1', 'generation-move:1',
    'pointer-write:1', 'backup-link:1', 'pointer-move:1', 'pointer-dir-sync:1'
  ]) {
    await t.test(killPoint, async (t) => {
      const fixture = await threeCandidateFixture(t);
      const root = path.join(fixture.runDir, 'playbook-execute');
      const oldFiles = selectionFiles('old');
      const old = await installExecuteSelection({ authority: fixture.authority, files: oldFiles });
      const oldGeneration = await inodeTree(path.join(root, old.generation));
      const candidates = await allCandidateInodes(fixture.runDir);
      const unrelated = path.join(fixture.runDir, 'world-region.bin');
      const unrelatedBytes = Buffer.from([0, 1, 2, 255]);
      await fs.writeFile(unrelated, unrelatedBytes);
      const newFiles = selectionFiles('new');
      const jobPath = path.join(fixture.root, `selection-crash-${killPoint.replace(':', '-')}.json`);
      await fs.writeFile(jobPath, JSON.stringify({
        kind: 'selection',
        killPoint,
        runDir: fixture.runDir,
        files: encodeFiles(newFiles)
      }));
      const child = spawnSync(process.execPath, [CRASH_WORKER, jobPath], {
        cwd: path.resolve(import.meta.dirname, '..'),
        encoding: 'utf8',
        timeout: 30000
      });
      assert.equal(child.signal, 'SIGKILL', `${killPoint}: ${child.stderr}`);
      const pointer = JSON.parse(await fs.readFile(path.join(root, 'manifest.json')));
      const isOld = pointer.generation === old.generation;
      const currentFiles = isOld ? oldFiles : newFiles;
      const reopened = await installExecuteSelection({ authority: fixture.authority, files: currentFiles });
      assert.equal(reopened.status, 'unchanged');
      assert.equal(reopened.generation, pointer.generation);
      assert.deepEqual(await inodeTree(path.join(root, old.generation)), oldGeneration);
      assert.deepEqual(await allCandidateInodes(fixture.runDir), candidates);
      assert.deepEqual(await fs.readFile(unrelated), unrelatedBytes);
    });
  }
});

test('selection rejects input authority and current generation drift', async (t) => {
  for (const [name, mutate] of [
    ['missing', (files) => { delete files['selection-report.md']; }],
    ['extra', (files) => { files['extra.txt'] = Buffer.from('provider-secret'); }],
    ['non-buffer', (files) => { files['selection-report.md'] = 'not bytes'; }],
    ['corrupt-manifest', (files) => { files['manifest.json'] = Buffer.from('{RAW_MANIFEST'); }],
    ['hash-drift', (files) => { files['selection-report.md'] = Buffer.from('drift\n'); }]
  ]) {
    await t.test(name, async (t) => {
      const fixture = await threeCandidateFixture(t);
      const files = selectionFiles();
      mutate(files);
      await assertP5Failure(
        installExecuteSelection({ authority: fixture.authority, files }),
        'P5_AUTHORITY_INVALID',
        fixture.root,
        'provider-secret|RAW_MANIFEST'
      );
    });
  }

  await t.test('existing-drift', async (t) => {
    const fixture = await threeCandidateFixture(t);
    const first = await installExecuteSelection({
      authority: fixture.authority,
      files: selectionFiles('old')
    });
    const report = path.join(fixture.runDir, 'playbook-execute', first.generation, 'selection-report.md');
    await fs.chmod(report, 0o600);
    await fs.writeFile(report, 'foreign provider-secret\n');
    const before = await snapshotTree(fixture.root);
    await assertP5Failure(
      installExecuteSelection({
        authority: fixture.authority,
        files: selectionFiles('replacement')
      }),
      'P5_INSTALL_FAILED',
      fixture.root,
      'provider-secret'
    );
    assert.deepEqual(await snapshotTree(fixture.root), before);
  });
});

function selectionPointerFaultFs(failCategory) {
  let pointerMoved = false;
  let failed = false;
  const fail = (category) => {
    if (!failed && category === failCategory) {
      failed = true;
      throw new Error(`RAW_SELECTION_POINTER_FAULT:${category}`);
    }
  };
  return fsWith({
    async open(target, flags, ...args) {
      const targetText = String(target);
      const inStage = await pathContainsGeneratedName(targetText, STAGE_PREFIX);
      if (inStage && (flags & constants.O_WRONLY) !== 0) fail('exclusiveWrite');
      const handle = await fs.open(target, flags, ...args);
      const stat = await handle.stat();
      const isStageDirectory = stat.isDirectory() && inStage;
      const isExecuteRoot = stat.isDirectory() && path.basename(targetText) === 'playbook-execute';
      return wrapFileHandle(handle, {
        async writeFile(value, ...writeArgs) {
          const pointer = isSelectionPointerBytes(value);
          if (inStage) fail(pointer ? 'pointerWrite' : 'stageWrite');
          return handle.writeFile(value, ...writeArgs);
        },
        async sync(...syncArgs) {
          if (inStage && stat.isFile()) fail('fileSync');
          if (isStageDirectory) fail('stageDirSync');
          if (isExecuteRoot && pointerMoved) fail('rootSyncAfterPointer');
          return handle.sync(...syncArgs);
        },
        async chmod(...chmodArgs) {
          if (inStage && stat.isFile()) fail('chmod');
          return handle.chmod(...chmodArgs);
        }
      });
    },
    async renameNoReplace(directoryHandle, sourceName, destinationName, next) {
      if (sourceName.startsWith(STAGE_PREFIX)
        && destinationName.startsWith('selection-')) fail('generationMove');
      return next(directoryHandle, sourceName, destinationName);
    },
    async link(source, destination) {
      if (path.basename(String(destination)).startsWith(BACKUP_PREFIX)) fail('backupLink');
      return fs.link(source, destination);
    },
    async rename(source, destination) {
      if (path.basename(String(destination)) === 'manifest.json') {
        fail('pointerMove');
        const result = await fs.rename(source, destination);
        pointerMoved = true;
        return result;
      }
      return fs.rename(source, destination);
    }
  });
}

function isSelectionPointerBytes(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value).toString('utf8'));
    return Object.keys(parsed).sort().join(',') === 'generation,manifest_sha256,schema_version';
  } catch {
    return false;
  }
}

function encodeFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([name, body]) => [
    name,
    body.toString('base64')
  ]));
}

async function buildStorageAuthorities() {
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p5-storage-authority-'));
  try {
    const baseDesign = {
      schema_version: 1,
      candidate_id: 'candidate-01',
      seed: 11,
      brief_intent: 'storage authority fixture',
      layer_intents: LAYERS.map((layer) => ({ layer, intent: `${layer} authority` })),
      selected_rule_ids: ['rule:medieval.show-load-path'],
      rejected_rule_ids: ['rule:facade.break-repetitive-bays'],
      repair_variant_preferences: []
    };
    const designBytes = Buffer.from(stableJson(baseDesign));
    const prepared = await prepareConstructionDesign({
      prompt: 'three-volume medieval storage authority fixture',
      mode: 'mock',
      outputDir,
      seed: 11,
      seedSource: 'manual-candidate',
      candidateId: 'candidate-01',
      frozenDesign: baseDesign,
      frozenDesignSha256: sha256(designBytes),
      critics: false,
      cwd: projectRoot
    });
    const compiledLayers = compileDesignLayers({ prepared, resolvedEffectsByLayer: {} });
    const compiled = await compilePreparedConstruction({ prepared, compiledLayers, outputDir });
    const blueprintBytes = await fs.readFile(compiled.artifacts.blueprint);
    const hardQa = new BlueprintQAAgent().run(compiled.blueprint);
    assert.equal(hardQa.ok, true);
    const review = await buildDeterministicShadowReview({
      projectRoot,
      blueprintBytes,
      blueprintRelativePath: 'blueprint.json'
    });
    const hardQaBytes = Buffer.from(stableJson(hardQa));
    const reviewBytes = Buffer.from(stableJson(review));
    return new Map(['candidate-01', 'candidate-02', 'candidate-03'].map((candidateId) => {
      const frozenDesign = { ...structuredClone(baseDesign), candidate_id: candidateId };
      const frozenDesignBytes = Buffer.from(stableJson(frozenDesign));
      const context = buildFrozenGeneratorContext({
        ...structuredClone(prepared.frozen_generator_context),
        candidate_id: candidateId,
        frozen_design_sha256: sha256(frozenDesignBytes)
      });
      const contextBytes = Buffer.from(stableJson(context));
      return [candidateId, Object.freeze({
        designBytes: frozenDesignBytes,
        designHash: sha256(frozenDesignBytes),
        contextBytes,
        contextHash: sha256(contextBytes),
        blueprintBytes: Buffer.from(blueprintBytes),
        blueprintHash: sha256(blueprintBytes),
        hardQaBytes: Buffer.from(hardQaBytes),
        hardQaHash: sha256(hardQaBytes),
        reviewBytes: Buffer.from(reviewBytes),
        reviewHash: sha256(reviewBytes)
      })];
    }));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}


async function storageFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-execute-storage-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'nested', 'run');
  await fs.mkdir(runDir, { recursive: true });
  return { root, runDir };
}

async function installedFixture(t) {
  const fixture = await storageFixture(t);
  const authority = await admitExecuteRun({ runDir: fixture.runDir });
  t.after(() => authority.close());
  const initial = initialSnapshot();
  await installCandidateSnapshot({ authority, candidateId: 'candidate-01', ...initial });
  const unrelatedPath = path.join(fixture.runDir, 'world-region.bin');
  const unrelatedBytes = Buffer.from([0, 1, 2, 255, 17]);
  await fs.writeFile(unrelatedPath, unrelatedBytes);
  return { ...fixture, authority, initial, unrelatedPath, unrelatedBytes };
}

async function threeCandidateFixture(t) {
  const fixture = await storageFixture(t);
  const authority = await admitExecuteRun({ runDir: fixture.runDir });
  t.after(() => authority.close());
  for (const candidateId of ['candidate-01', 'candidate-02', 'candidate-03']) {
    await installCandidateSnapshot({ authority, candidateId, ...initialSnapshot(candidateId) });
  }
  return { ...fixture, authority };
}

function initialSnapshot(candidateId = 'candidate-01') {
  const authority = STORAGE_AUTHORITIES.get(candidateId);
  const envelopes = buildEnvelopes(candidateId, 1, null, null);
  const chain = createChainManifest(chainInput(candidateId, envelopes, {
    chain_revision: 1,
    parent_chain_sha256: null,
    repair_transaction_sha256: null,
    created_from: 'initial'
  }));
  const currentChain = chainManifestBytes(chain);
  return {
    files: {
      ...checkpointFileMap(envelopes),
      'frozen/frozen-design.json': Buffer.from(authority.designBytes),
      'frozen/frozen-generator-context.json': Buffer.from(authority.contextBytes),
      'blueprints/chain-0001.json': Buffer.from(authority.blueprintBytes),
      'reviews/chain-0001-hard-qa.json': Buffer.from(authority.hardQaBytes),
      'reviews/chain-0001-review.json': Buffer.from(authority.reviewBytes)
    },
    currentChain,
    chain,
    chainHash: chainManifestHash(chain),
    envelopes,
    expectedPreviousChainSha256: null
  };
}

function replaySnapshot(initial) {
  const candidateId = initial.chain.candidate_id;
  const operation = {
    schema_version: 1,
    compiler_version: 1,
    candidate_id: candidateId,
    rule_id: 'rule:medieval.show-load-path',
    repair_operation_id: 'repair:structure:connect-support-path',
    variant_id: 'connect-known-structural-anchors',
    target_layer: 'structure',
    base_checkpoint_sha256: initial.chain.checkpoint_hashes[2].checkpoint_sha256,
    precondition_hashes: [
      { kind: 'structural-anchor', id: 'upper', sha256: '1'.repeat(64) },
      { kind: 'structural-anchor', id: 'frame', sha256: '2'.repeat(64) },
      { kind: 'structural-anchor', id: 'base', sha256: '3'.repeat(64) }
    ],
    effects: [{ type: 'set-load-path', from: 'upper', through: 'frame', to: 'base' }],
    invalidates_layers: ['roof', 'facade']
  };
  const transaction = {
    schema_version: 1,
    compiler_version: 1,
    candidate_id: candidateId,
    base_chain_sha256: initial.chainHash,
    repair_budget: 1,
    earliest_target_layer: 'structure',
    operations: [operation],
    invalidates_layers: ['roof', 'facade']
  };
  const transactionBytes = canonicalBytes(transaction);
  const transactionHash = testHash(transactionBytes);
  const request = canonicalBytes({
    schema_version: 1,
    candidate_id: candidateId,
    attempt: 1,
    base_chain_sha256: initial.chainHash,
    repair_transaction_sha256: transactionHash,
    requests: [{
      schema_version: operation.schema_version,
      candidate_id: operation.candidate_id,
      rule_id: operation.rule_id,
      repair_operation_id: operation.repair_operation_id,
      variant_id: operation.variant_id,
      base_checkpoint_sha256: operation.base_checkpoint_sha256
    }]
  });
  const eligibility = {
    status: 'eligible',
    hard_qa_ok: true,
    unresolved_violated_core_rule_ids: [],
    neutral_unknown_rule_ids: [],
    neutral_not_applicable_rule_ids: [],
    repair_budget_used: 1
  };
  const result = canonicalBytes({
    schema_version: 1,
    candidate_id: candidateId,
    attempt: 1,
    base_chain_sha256: initial.chainHash,
    repair_request_sha256: testHash(request),
    repair_transaction_sha256: transactionHash,
    blueprint_sha256: initial.chain.blueprint_sha256,
    hard_qa_sha256: initial.chain.hard_qa_sha256,
    p4_review_sha256: initial.chain.p4_review_sha256,
    eligibility
  });
  const envelopes = buildReplayEnvelopes(initial, transactionHash, testHash(result));
  const chain = createChainManifest(chainInput(candidateId, envelopes, {
    chain_revision: 2,
    parent_chain_sha256: initial.chainHash,
    repair_transaction_sha256: transactionHash,
    created_from: 'replay'
  }));
  const currentChain = chainManifestBytes(chain);
  return {
    files: {
      ...cloneBuffers(initial.files),
      [`chains/chain-${padRevision(initial.chain.chain_revision)}.json`]: Buffer.from(initial.currentChain),
      ...checkpointFileMap(envelopes),
      'blueprints/chain-0002.json': Buffer.from(initial.files['blueprints/chain-0001.json']),
      'reviews/chain-0002-hard-qa.json': Buffer.from(initial.files['reviews/chain-0001-hard-qa.json']),
      'reviews/chain-0002-review.json': Buffer.from(initial.files['reviews/chain-0001-review.json']),
      'repairs/attempt-01-request.json': request,
      'repairs/attempt-01-patch.json': transactionBytes,
      'repairs/attempt-01-result.json': result
    },
    currentChain,
    chain,
    chainHash: chainManifestHash(chain),
    envelopes
  };
}

function rebindCheckpoint(snapshot, layer, mutate) {
  const chain = JSON.parse(snapshot.currentChain);
  const row = chain.checkpoint_hashes.find((item) => item.layer === layer);
  const sourceName = Object.keys(snapshot.files).find((name) => (
    name.startsWith(`checkpoints/${layer}/`) && testHash(snapshot.files[name]) === row.checkpoint_sha256
  ));
  assert.ok(sourceName, layer);
  const checkpoint = JSON.parse(snapshot.files[sourceName]);
  mutate(checkpoint);
  const bytes = canonicalBytes(checkpoint);
  snapshot.files[sourceName] = bytes;
  row.checkpoint_sha256 = testHash(bytes);
  snapshot.currentChain = canonicalBytes(chain);
}

function rewriteCurrentCheckpoints(snapshot, mutate) {
  const chain = JSON.parse(snapshot.currentChain);
  const rewritten = [];
  for (const layer of LAYERS) {
    const row = chain.checkpoint_hashes.find((item) => item.layer === layer);
    const sourceName = Object.keys(snapshot.files).find((name) => (
      name.startsWith(`checkpoints/${layer}/`) && testHash(snapshot.files[name]) === row.checkpoint_sha256
    ));
    assert.ok(sourceName, layer);
    const checkpoint = JSON.parse(snapshot.files[sourceName]);
    mutate(checkpoint, layer);
    checkpoint.upstream_accepted_hashes = rewritten.map((item) => ({
      layer: item.layer,
      checkpoint_sha256: item.hash
    }));
    const bytes = canonicalBytes(checkpoint);
    const destinationName = `checkpoints/${layer}/r${padRevision(checkpoint.revision)}.json`;
    delete snapshot.files[sourceName];
    snapshot.files[destinationName] = bytes;
    row.checkpoint_sha256 = testHash(bytes);
    rewritten.push({ layer, hash: row.checkpoint_sha256 });
  }
  snapshot.currentChain = canonicalBytes(chain);
}

function buildEnvelopes(candidateId, revision, baseChainSha256, transactionSha256, repairResultSha256) {
  const authority = STORAGE_AUTHORITIES.get(candidateId);
  const envelopes = [];
  for (const layer of LAYERS) {
    envelopes.push(createCheckpointEnvelope({
      build_id: 'build-01',
      candidate_id: candidateId,
      layer,
      revision,
      status: 'accepted',
      preceding_envelopes: envelopes,
      selected_rule_ids: ['rule:medieval.show-load-path'],
      rejected_rule_ids: ['rule:facade.break-repetitive-bays'],
      design_intent: { layer, purpose: `${layer}-revision-${revision}` },
      recipe_fragment: { layer, payload: { revision } },
      field_patches: [],
      compiled_artifact_hashes: layer === 'facade' && revision === 2 ? {
        layer_payload_sha256: ARTIFACT_HASH,
        operation_list_sha256: '4'.repeat(64),
        build_function_sha256: '5'.repeat(64),
        datapack_tree_sha256: '6'.repeat(64),
        repair_result_sha256: repairResultSha256
      } : { layer_payload_sha256: ARTIFACT_HASH },
      hard_qa: { hard_qa_ok: true, hard_qa_sha256: authority.hardQaHash },
      design_review: { p4_review_sha256: authority.reviewHash },
      invalidates_downstream: INVALIDATES[layer],
      replay_origin: revision === 1 ? null : {
        kind: 'replay',
        base_chain_sha256: baseChainSha256,
        repair_transaction_sha256: transactionSha256
      }
    }));
  }
  return envelopes;
}

function buildReplayEnvelopes(initial, transactionSha256, repairResultSha256) {
  const candidateId = initial.chain.candidate_id;
  const authority = STORAGE_AUTHORITIES.get(candidateId);
  const envelopes = initial.envelopes.slice(0, 2);
  for (const layer of LAYERS.slice(2)) {
    envelopes.push(createCheckpointEnvelope({
      build_id: 'build-01',
      candidate_id: candidateId,
      layer,
      revision: 2,
      status: 'accepted',
      preceding_envelopes: envelopes,
      selected_rule_ids: ['rule:medieval.show-load-path'],
      rejected_rule_ids: ['rule:facade.break-repetitive-bays'],
      design_intent: { layer, purpose: `${layer}-revision-2` },
      recipe_fragment: { layer, payload: { revision: 2 } },
      field_patches: [],
      compiled_artifact_hashes: layer === 'facade' ? {
        layer_payload_sha256: ARTIFACT_HASH,
        operation_list_sha256: '4'.repeat(64),
        build_function_sha256: '5'.repeat(64),
        datapack_tree_sha256: '6'.repeat(64),
        repair_result_sha256: repairResultSha256
      } : { layer_payload_sha256: ARTIFACT_HASH },
      hard_qa: { hard_qa_ok: true, hard_qa_sha256: authority.hardQaHash },
      design_review: { p4_review_sha256: authority.reviewHash },
      invalidates_downstream: INVALIDATES[layer],
      replay_origin: {
        kind: 'replay',
        base_chain_sha256: initial.chainHash,
        repair_transaction_sha256: transactionSha256
      }
    }));
  }
  return envelopes;
}

function chainInput(candidateId, checkpoint_envelopes, overrides) {
  const authority = STORAGE_AUTHORITIES.get(candidateId);
  return {
    candidate_id: candidateId,
    checkpoint_envelopes,
    frozen_design_sha256: authority.designHash,
    frozen_generator_context_sha256: authority.contextHash,
    blueprint_sha256: authority.blueprintHash,
    hard_qa_sha256: authority.hardQaHash,
    p4_review_sha256: authority.reviewHash,
    eligibility: {
      status: 'eligible',
      hard_qa_ok: true,
      unresolved_violated_core_rule_ids: [],
      neutral_unknown_rule_ids: [],
      neutral_not_applicable_rule_ids: [],
      repair_budget_used: overrides.chain_revision === 1 ? 0 : 1
    },
    ...overrides
  };
}

function checkpointFileMap(envelopes) {
  return Object.fromEntries(envelopes.map((envelope) => [
    `checkpoints/${envelope.checkpoint.layer}/r${padRevision(envelope.checkpoint.revision)}.json`,
    checkpointBytes(envelope)
  ]));
}

function expectedInstalledFiles(snapshot) {
  return sortObject({
    ...cloneBuffers(snapshot.files),
    [`chains/chain-${padRevision(snapshot.chain.chain_revision)}.json`]: Buffer.from(snapshot.currentChain),
    'current-chain.json': canonicalBytes({
      schema_version: 1,
      candidate_id: snapshot.chain.candidate_id,
      chain_revision: snapshot.chain.chain_revision,
      chain_sha256: snapshot.chainHash
    })
  });
}

function selectionFiles(marker = 'selected') {
  const snapshots = ['candidate-01', 'candidate-02', 'candidate-03'].map((candidateId) => initialSnapshot(candidateId));
  const selection = canonicalBytes({
    schema_version: 1,
    mode: 'execute',
    candidate_count: 3,
    candidates: snapshots.map((snapshot, index) => ({
      candidate_id: snapshot.chain.candidate_id,
      seed: 11,
      current_chain_sha256: snapshot.chainHash,
      hard_qa_sha256: snapshot.chain.hard_qa_sha256,
      p4_review_sha256: snapshot.chain.p4_review_sha256,
      eligibility: snapshot.chain.eligibility,
      repair_attempt_count: 0
    })),
    selected_candidate_id: 'candidate-01',
    selected_chain_sha256: snapshots[0].chainHash,
    repair_attempt_count: 0,
    ranker_result: { marker }
  });
  const report = Buffer.from(`# Execute selection\n\n${marker}\n`, 'utf8');
  const manifest = canonicalBytes({
    schema_version: 1,
    managed_paths: ['manifest.json', 'selection.json', 'selection-report.md'],
    artifact_hashes: {
      'selection.json': testHash(selection),
      'selection-report.md': testHash(report)
    }
  });
  return { 'manifest.json': manifest, 'selection.json': selection, 'selection-report.md': report };
}

async function replacementOperationCounts(t) {
  const fixture = await installedFixture(t);
  const counts = {};
  await installCandidateSnapshot({
    authority: fixture.authority,
    candidateId: 'candidate-01',
    ...replaySnapshot(fixture.initial),
    expectedPreviousChainSha256: fixture.initial.chainHash,
    fsImpl: instrumentedFs({ counts })
  });
  return counts;
}

async function candidateRetirementOperationCounts(t) {
  const fixture = await installedFixture(t);
  const counts = {};
  await installCandidateSnapshot({
    authority: fixture.authority,
    candidateId: 'candidate-01',
    ...replaySnapshot(fixture.initial),
    expectedPreviousChainSha256: fixture.initial.chainHash,
    fsImpl: instrumentedFs({ counts })
  });
  return counts;
}

async function selectionRetirementOperationCounts(t) {
  const fixture = await threeCandidateFixture(t);
  await installExecuteSelection({ authority: fixture.authority, files: selectionFiles('old') });
  const counts = {};
  await installExecuteSelection({
    authority: fixture.authority,
    files: selectionFiles('new'),
    fsImpl: retirementFs({ counts })
  });
  return counts;
}

function retirementFs({ failCategory, failAt, counts = {} }) {
  const tick = (category) => {
    counts[category] = (counts[category] ?? 0) + 1;
    if (category === failCategory && counts[category] === failAt) {
      throw new Error(`RAW_INJECTED_${category}_${failAt}`);
    }
  };
  return fsWith({
    async unlink(target) {
      if (await pathContainsGeneratedName(String(target), BACKUP_PREFIX)) tick('retireUnlink');
      return fs.unlink(target);
    },
    async rmdir(target) {
      if (await pathContainsGeneratedName(String(target), BACKUP_PREFIX)) tick('retireRmdir');
      return fs.rmdir(target);
    }
  });
}

function instrumentedFs({ failCategory, failAt, counts = {} }) {
  const tick = (category) => {
    counts[category] = (counts[category] ?? 0) + 1;
    if (failCategory === category && counts[category] === failAt) {
      throw new Error(`RAW_INJECTED_${category}_${failAt}`);
    }
  };
  return fsWith({
    async open(target, flags, ...args) {
      const targetText = String(target);
      const inStage = await pathContainsGeneratedName(targetText, STAGE_PREFIX);
      if (inStage && (flags & constants.O_WRONLY) !== 0) tick('exclusiveWrite');
      const handle = await fs.open(target, flags, ...args);
      const stat = await handle.stat();
      const isDirectory = stat.isDirectory();
      return wrapFileHandle(handle, {
        async chmod(...chmodArgs) {
          if (inStage) tick('chmod');
          return handle.chmod(...chmodArgs);
        },
        async writeFile(...writeArgs) {
          if (inStage && path.basename(targetText) === 'current-chain.json') tick('pointerWrite');
          return handle.writeFile(...writeArgs);
        },
        async sync(...syncArgs) {
          tick(isDirectory ? 'directorySync' : 'fileSync');
          return handle.sync(...syncArgs);
        }
      });
    },
    async renameNoReplace(directoryHandle, sourceName, destinationName, next) {
      if (sourceName === 'candidate-01' && destinationName.startsWith(BACKUP_PREFIX)) tick('backupRename');
      if (sourceName.startsWith(STAGE_PREFIX) && destinationName === 'candidate-01') tick('finalRename');
      return next(directoryHandle, sourceName, destinationName);
    },
    async unlink(target) {
      if (await pathContainsGeneratedName(String(target), BACKUP_PREFIX)) {
        tick('cleanup');
        tick('retireUnlink');
      }
      return fs.unlink(target);
    },
    async rmdir(target) {
      if (await pathContainsGeneratedName(String(target), BACKUP_PREFIX)) tick('retireRmdir');
      return fs.rmdir(target);
    }
  });
}

function failureAppendFs({ failCategory, failAt, failRollbackCleanup = false }) {
  const counts = {}; let attached = false;
  const tick = (category) => {
    counts[category] = (counts[category] ?? 0) + 1;
    if (category === failCategory && counts[category] === failAt) throw new Error(`RAW_FAILURE_APPEND_${category}_${failAt}`);
  };
  return fsWith({
    async open(target, flags, ...args) {
      const targetText = String(target); const inStage = await pathContainsGeneratedName(targetText, STAGE_PREFIX);
      if (inStage && (flags & constants.O_WRONLY) !== 0) tick('exclusiveWrite');
      const handle = await fs.open(target, flags, ...args); const stat = await handle.stat();
      const resolved = await descriptorTarget(handle);
      return wrapFileHandle(handle, {
        async chmod(...chmodArgs) { if (inStage) tick('chmod'); return handle.chmod(...chmodArgs); },
        async sync(...syncArgs) {
          if (stat.isDirectory()) {
            if (inStage) tick('stageDirSync');
            else if (resolved.endsWith('/candidate-01')) tick('candidateSync');
            else if (resolved.endsWith('/candidates')) tick('candidatesSync');
          } else if (inStage) tick('fileSync');
          return handle.sync(...syncArgs);
        }
      });
    },
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      if (destinationName === 'failures') tick('failureRename');
      const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
      if (destinationName === 'failures') attached = true;
      return result;
    },
    async readdir(target, ...args) {
      const resolved = await descriptorTargetFromPath(String(target));
      if (attached && resolved.includes('/candidate-01')) tick('postAttachInspect');
      return fs.readdir(target, ...args);
    },
    async unlink(target) {
      if (failRollbackCleanup && await pathContainsGeneratedName(String(target), STAGE_PREFIX)) throw new Error('RAW_ROLLBACK_CLEANUP');
      return fs.unlink(target);
    }
  });
}

async function descriptorTarget(handle) {
  try { return await fs.readlink(`/proc/self/fd/${handle.fd}`); } catch { return ''; }
}

async function descriptorTargetFromPath(target) {
  const match = target.match(/^\/proc\/self\/fd\/(\d+)/u);
  if (!match) return target;
  try { return `${await fs.readlink(`/proc/self/fd/${match[1]}`)}${target.slice(match[0].length)}`; } catch { return target; }
}

function failureEvidence(chainHash) {
  return {
    schema_version: 1, candidate_id: 'candidate-01', attempt: 1, code: 'P5_REPLAY_FAILED',
    base_chain_sha256: chainHash, repair_transaction_sha256: TRANSACTION_HASH,
    current_chain_sha256: chainHash
  };
}

async function pathContainsGeneratedName(target, prefix) {
  if (target.includes(prefix)) return true;
  const match = target.match(/^\/proc\/self\/fd\/(\d+)(?:\/|$)/u);
  if (!match) return false;
  try {
    return (await fs.readlink(`/proc/self/fd/${match[1]}`)).includes(prefix);
  } catch {
    return false;
  }
}

async function readTreeBytes(root) {
  const files = {};
  await visit(root, '');
  return sortObject(files);

  async function visit(absolute, relative) {
    for (const name of (await fs.readdir(absolute)).sort()) {
      const target = path.join(absolute, name);
      const child = relative ? `${relative}/${name}` : name;
      const stat = await fs.lstat(target);
      if (stat.isDirectory()) await visit(target, child);
      else files[child] = await fs.readFile(target);
    }
  }
}

async function inodeTree(root) {
  const rows = [];
  await visit(root, '');
  return rows;

  async function visit(absolute, relative) {
    const stat = await fs.lstat(absolute);
    rows.push({
      relative,
      kind: stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'file',
      dev: stat.dev,
      ino: stat.ino,
      mode: stat.mode & 0o777,
      bytes: stat.isFile() ? (await fs.readFile(absolute)).toString('base64') : undefined
    });
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) {
        await visit(path.join(absolute, name), relative ? `${relative}/${name}` : name);
      }
    }
  }
}

async function snapshotTree(root) {
  const rows = [];
  await visit(root, '');
  return rows;

  async function visit(absolute, relative) {
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) {
      rows.push([relative, 'symlink', await fs.readlink(absolute)]);
    } else if (stat.isDirectory()) {
      rows.push([relative, 'directory']);
      for (const name of (await fs.readdir(absolute)).sort()) {
        await visit(path.join(absolute, name), relative ? `${relative}/${name}` : name);
      }
    } else {
      rows.push([relative, 'file', (await fs.readFile(absolute)).toString('base64')]);
    }
  }
}

async function generatedCandidateEntries(runDir, prefix) {
  const parent = path.join(runDir, 'playbook-execute', 'candidates');
  try {
    return (await fs.readdir(parent)).filter((name) => (
      prefix ? name.startsWith(prefix) : name.startsWith(STAGE_PREFIX) || name.startsWith(BACKUP_PREFIX)
    )).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function generatedRootEntries(runDir) {
  const root = path.join(runDir, 'playbook-execute');
  return (await fs.readdir(root)).filter((name) => (
    name.startsWith(STAGE_PREFIX) || name.startsWith(BACKUP_PREFIX)
  )).length;
}

const SELECTION_TEST_PATHS = Object.freeze([
  'manifest.json', 'selection.json', 'selection-report.md'
]);

async function selectionInodes(runDir) {
  const root = path.join(runDir, 'playbook-execute');
  return Promise.all(SELECTION_TEST_PATHS.map(async (name) => {
    const stat = await fs.lstat(path.join(root, name));
    return { name, dev: stat.dev, ino: stat.ino, bytes: (await fs.readFile(path.join(root, name))).toString('base64') };
  }));
}

async function allCandidateInodes(runDir) {
  return Promise.all(['candidate-01', 'candidate-02', 'candidate-03'].map(async (candidateId) => [
    candidateId,
    await inodeTree(candidateDirectory(runDir, candidateId))
  ]));
}

async function p5Exists(runDir) {
  try {
    await fs.lstat(path.join(runDir, 'playbook-execute'));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function candidateDirectory(runDir, candidateId) {
  return path.join(runDir, 'playbook-execute', 'candidates', candidateId);
}

function padRevision(revision) {
  return String(revision).padStart(4, '0');
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(sortJson(value), null, 2)}\n`, 'utf8');
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function cloneBuffers(files) {
  return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes)]));
}

function testHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fsWith(overrides) {
  return new Proxy(fs, {
    get(target, property) {
      return Object.hasOwn(overrides, property) ? overrides[property] : Reflect.get(target, property);
    }
  });
}

function wrapFileHandle(handle, overrides) {
  return new Proxy(handle, {
    get(target, property) {
      if (Object.hasOwn(overrides, property)) return overrides[property];
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function fileIdentity(stat) {
  return { dev: stat.dev, ino: stat.ino };
}

async function assertP5Failure(promise, code, absolutePath, forbidden = '') {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.doesNotMatch(error.message, new RegExp(`${escapeRegex(absolutePath)}${forbidden ? `|${forbidden}` : ''}`, 'u'));
    return true;
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
