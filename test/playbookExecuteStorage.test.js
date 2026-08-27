import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  chainManifestBytes,
  chainManifestHash,
  checkpointBytes,
  createChainManifest,
  createCheckpointEnvelope
} from '../src/playbook/execute/checkpoints.js';
import { validateExecuteSelectionManifest } from '../src/playbook/execute/contracts.js';
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
const QA_BYTES = canonicalBytes({ ok: true, source: 'storage-fixture' });
const REVIEW_BYTES = canonicalBytes({ schema_version: 1, source: 'storage-fixture' });
const QA_HASH = testHash(QA_BYTES);
const REVIEW_HASH = testHash(REVIEW_BYTES);
const DESIGN_HASH = 'd'.repeat(64);
const CONTEXT_HASH = 'e'.repeat(64);
const BLUEPRINT_HASH = 'f'.repeat(64);
const TRANSACTION_HASH = '9'.repeat(64);

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
  assert.deepEqual(reread.files['current-chain.json'], snapshot.currentChain);
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
          base_chain_sha256: DESIGN_HASH,
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
      if (layer === 'massing') checkpoint.replay_origin = null;
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

test('a no-replace backup collision preserves the exact old candidate and collision', async (t) => {
  const fixture = await installedFixture(t);
  const old = await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01'));
  let collisionName;
  let collisionIdentity;
  const fsImpl = fsWith({
    async lstat(target, ...args) {
      try {
        return await fs.lstat(target, ...args);
      } catch (error) {
        if (!collisionName && error.code === 'ENOENT' && path.basename(String(target)).startsWith(BACKUP_PREFIX)) {
          collisionName = path.basename(String(target));
          await fs.mkdir(target);
          collisionIdentity = fileIdentity(await fs.lstat(target));
        }
        throw error;
      }
    }
  });

  await assertP5Failure(
    installCandidateSnapshot({
      authority: fixture.authority,
      candidateId: 'candidate-01',
      ...replaySnapshot(fixture.initial),
      expectedPreviousChainSha256: fixture.initial.chainHash,
      fsImpl
    }),
    'P5_INSTALL_FAILED',
    fixture.root
  );
  assert.deepEqual(await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01')), old);
  assert.deepEqual(
    fileIdentity(await fs.lstat(path.join(
      fixture.runDir,
      'playbook-execute',
      'candidates',
      collisionName
    ))),
    collisionIdentity
  );
});

test('a candidate source swap is detected without deleting old or foreign bytes', async (t) => {
  const fixture = await installedFixture(t);
  const candidatePath = candidateDirectory(fixture.runDir, 'candidate-01');
  const held = path.join(path.dirname(candidatePath), 'held-owned-candidate');
  let swapped = false;
  let foreignIdentity;
  const fsImpl = fsWith({
    async renameNoReplace(directoryHandle, sourceName, destinationName, next) {
      if (!swapped && sourceName === 'candidate-01' && destinationName.startsWith(BACKUP_PREFIX)) {
        swapped = true;
        await fs.rename(candidatePath, held);
        await fs.mkdir(candidatePath);
        await fs.writeFile(path.join(candidatePath, 'foreign.txt'), 'foreign bytes\n');
        foreignIdentity = fileIdentity(await fs.lstat(candidatePath));
      }
      return next(directoryHandle, sourceName, destinationName);
    }
  });

  await assertP5Failure(
    installCandidateSnapshot({
      authority: fixture.authority,
      candidateId: 'candidate-01',
      ...replaySnapshot(fixture.initial),
      expectedPreviousChainSha256: fixture.initial.chainHash,
      fsImpl
    }),
    'P5_INSTALL_FAILED',
    fixture.root
  );
  assert.deepEqual(fileIdentity(await fs.lstat(candidatePath)), foreignIdentity);
  assert.deepEqual(await readTreeBytes(held), expectedInstalledFiles(fixture.initial));
});

test('failure injection covers every staged exclusive write, chmod, file sync, and directory sync', async (t) => {
  const counts = await replacementOperationCounts(t);
  assert.ok(counts.exclusiveWrite >= 13, JSON.stringify(counts));
  assert.ok(counts.chmod >= 12, JSON.stringify(counts));
  assert.ok(counts.fileSync >= 13, JSON.stringify(counts));
  assert.ok(counts.directorySync >= 4, JSON.stringify(counts));

  for (const category of ['exclusiveWrite', 'chmod', 'fileSync', 'directorySync']) {
    for (let failAt = 1; failAt <= counts[category]; failAt += 1) {
      await t.test(`${category}-${failAt}`, async (t) => {
        const fixture = await installedFixture(t);
        const before = await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01'));
        const fsImpl = instrumentedFs({ failCategory: category, failAt });
        await assertP5Failure(
          installCandidateSnapshot({
            authority: fixture.authority,
            candidateId: 'candidate-01',
            ...replaySnapshot(fixture.initial),
            expectedPreviousChainSha256: fixture.initial.chainHash,
            fsImpl
          }),
          'P5_INSTALL_FAILED',
          fixture.root,
          'RAW_INJECTED'
        );
        assert.deepEqual(await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01')), before);
        assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
      });
    }
  }
});

test('backup rename, final no-replace rename, and pointer write failures restore exact old inodes', async (t) => {
  for (const category of ['backupRename', 'finalRename', 'pointerWrite']) {
    await t.test(category, async (t) => {
      const fixture = await installedFixture(t);
      const before = await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01'));
      await assertP5Failure(
        installCandidateSnapshot({
          authority: fixture.authority,
          candidateId: 'candidate-01',
          ...replaySnapshot(fixture.initial),
          expectedPreviousChainSha256: fixture.initial.chainHash,
          fsImpl: instrumentedFs({ failCategory: category, failAt: 1 })
        }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_INJECTED'
      );
      assert.deepEqual(await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01')), before);
      assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
      assert.deepEqual(await generatedCandidateEntries(fixture.runDir), []);
    });
  }
});

test('every candidate postcommit backup cleanup failure keeps the complete new generation authoritative', async (t) => {
  const counts = await candidateRetirementOperationCounts(t);
  assert.ok(counts.retireUnlink >= 7, JSON.stringify(counts));
  assert.ok(counts.retireRmdir >= 2, JSON.stringify(counts));

  for (const category of ['retireUnlink', 'retireRmdir']) {
    for (let failAt = 1; failAt <= counts[category]; failAt += 1) {
      await t.test(`${category}-${failAt}`, async (t) => {
        const fixture = await installedFixture(t);
        const replacement = replaySnapshot(fixture.initial);
        const result = await installCandidateSnapshot({
          authority: fixture.authority,
          candidateId: 'candidate-01',
          ...replacement,
          expectedPreviousChainSha256: fixture.initial.chainHash,
          fsImpl: instrumentedFs({ failCategory: category, failAt })
        });
        assert.equal(result.status, 'replaced');
        const current = await readCurrentCandidateSnapshot({
          authority: fixture.authority,
          candidateId: 'candidate-01'
        });
        assert.equal(current.current_chain_sha256, replacement.chainHash);
        assert.deepEqual(current.files, expectedInstalledFiles(replacement));
        assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
      });
    }
  }
});

test('candidate retirement never follows a swapped intermediate directory', async (t) => {
  const fixture = await installedFixture(t);
  const replacement = replaySnapshot(fixture.initial);
  const outside = path.join(fixture.root, 'outside-retirement-target');
  await fs.mkdir(outside);
  const outsideBody = fixture.initial.files['checkpoints/brief/r0001.json'];
  const outsidePath = path.join(outside, 'r0001.json');
  await fs.writeFile(outsidePath, outsideBody);
  const outsideBefore = await inodeTree(outside);
  let parked;
  let parkedBefore;
  let swapped = false;
  let newPromoted = false;
  const fsImpl = fsWith({
    async lstat(target, ...args) {
      const targetText = String(target);
      const safeImmediateChild = targetText.endsWith('/brief')
        && await pathContainsGeneratedName(targetText, BACKUP_PREFIX);
      const unsafeDescendant = targetText.endsWith('/checkpoints/brief/r0001.json')
        && await pathContainsGeneratedName(targetText, BACKUP_PREFIX);
      if (newPromoted && !swapped && (safeImmediateChild || unsafeDescendant)) {
        const descriptorMatch = targetText.match(/^\/proc\/self\/fd\/(\d+)\/(.+)$/u);
        assert.ok(descriptorMatch);
        const descriptorRoot = await fs.readlink(`/proc/self/fd/${descriptorMatch[1]}`);
        const absoluteTarget = path.join(descriptorRoot, descriptorMatch[2]);
        const brief = safeImmediateChild ? absoluteTarget : path.dirname(absoluteTarget);
        parked = `${brief}-parked`;
        await fs.rename(brief, parked);
        parkedBefore = await inodeTree(parked);
        await fs.symlink(outside, brief);
        swapped = true;
      }
      return fs.lstat(target, ...args);
    },
    async renameNoReplace(directoryHandle, sourceName, destinationName, next) {
      const result = await next(directoryHandle, sourceName, destinationName);
      if (sourceName.startsWith(STAGE_PREFIX) && destinationName === 'candidate-01') {
        newPromoted = true;
      }
      return result;
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
  assert.equal(swapped, true);
  assert.deepEqual(await inodeTree(outside), outsideBefore);
  assert.deepEqual(await inodeTree(parked), parkedBefore);
});

test('candidate cleanup root validates the descriptor across swap/open races', async (t) => {
  for (const restoreCanonical of [false, true]) {
    await t.test(restoreCanonical ? 'swap-open-restore' : 'swap-after-open', async (t) => {
      const fixture = await installedFixture(t);
      const replacement = replaySnapshot(fixture.initial);
      let promoted = false;
      let backupOpens = 0;
      let swapped = false;
      let oldParked;
      let oldParkedBefore;
      let foreignParked;
      let foreignBefore;
      const fsImpl = fsWith({
        async open(target, flags, ...args) {
          const handle = await fs.open(target, flags, ...args);
          if (
            !promoted
            || !path.basename(String(target)).startsWith(BACKUP_PREFIX)
            || ++backupOpens !== 2
          ) return handle;
          return wrapFileHandle(handle, {
            async stat(...statArgs) {
              if (!swapped) {
                const canonical = await fs.readlink(`/proc/self/fd/${handle.fd}`);
                oldParked = `${canonical}-parked-old`;
                await fs.rename(canonical, oldParked);
                oldParkedBefore = await inodeTree(oldParked);
                await fs.mkdir(canonical);
                await fs.writeFile(path.join(canonical, 'foreign.txt'), 'foreign cleanup root\n');
                if (restoreCanonical) {
                  foreignParked = `${canonical}-parked-foreign`;
                  await fs.rename(canonical, foreignParked);
                  foreignBefore = await inodeTree(foreignParked);
                  await fs.rename(oldParked, canonical);
                } else {
                  foreignParked = canonical;
                  foreignBefore = await inodeTree(canonical);
                }
                swapped = true;
              }
              return handle.stat(...statArgs);
            }
          });
        },
        async renameNoReplace(directoryHandle, sourceName, destinationName, next) {
          const result = await next(directoryHandle, sourceName, destinationName);
          if (sourceName.startsWith(STAGE_PREFIX) && destinationName === 'candidate-01') {
            promoted = true;
          }
          return result;
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
      assert.equal(swapped, true);
      assert.deepEqual(await inodeTree(foreignParked), foreignBefore);
      if (!restoreCanonical) assert.deepEqual(await inodeTree(oldParked), oldParkedBefore);
      const current = await readCurrentCandidateSnapshot({
        authority: fixture.authority,
        candidateId: 'candidate-01'
      });
      assert.equal(current.current_chain_sha256, replacement.chainHash);
    });
  }
});

test('rollback cleanup failure leaves the exact verified backup recoverable', async (t) => {
  const fixture = await installedFixture(t);
  const before = await inodeTree(candidateDirectory(fixture.runDir, 'candidate-01'));
  let finalFailed = false;
  const fsImpl = fsWith({
    async renameNoReplace(directoryHandle, sourceName, destinationName, next) {
      if (sourceName.startsWith(STAGE_PREFIX) && destinationName === 'candidate-01') {
        finalFailed = true;
        throw new Error('RAW_FINAL_FAILURE');
      }
      if (finalFailed && sourceName.startsWith(BACKUP_PREFIX) && destinationName === 'candidate-01') {
        throw new Error('RAW_ROLLBACK_FAILURE');
      }
      return next(directoryHandle, sourceName, destinationName);
    }
  });

  await assertP5Failure(
    installCandidateSnapshot({
      authority: fixture.authority,
      candidateId: 'candidate-01',
      ...replaySnapshot(fixture.initial),
      expectedPreviousChainSha256: fixture.initial.chainHash,
      fsImpl
    }),
    'P5_INSTALL_FAILED',
    fixture.root,
    'RAW_FINAL_FAILURE|RAW_ROLLBACK_FAILURE'
  );
  const [backupName] = await generatedCandidateEntries(fixture.runDir, BACKUP_PREFIX);
  assert.ok(backupName);
  assert.deepEqual(
    await inodeTree(path.join(fixture.runDir, 'playbook-execute', 'candidates', backupName)),
    before.map((row) => row)
  );
  assert.deepEqual(await fs.readFile(fixture.unrelatedPath), fixture.unrelatedBytes);
});

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
  assert.deepEqual(result, {
    status: 'created',
    artifact_hashes: {
      'selection.json': testHash(files['selection.json']),
      'selection-report.md': testHash(files['selection-report.md'])
    }
  });
  for (const name of Object.keys(files)) {
    assert.deepEqual(await fs.readFile(path.join(fixture.runDir, 'playbook-execute', name)), files[name]);
  }
});

test('selection no-replace promotion preserves an identical-byte late collision inode', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const files = selectionFiles();
  let collisionIdentity;
  const fsImpl = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      if (!collisionIdentity && destinationName === 'selection.json') {
        const destination = path.join(`/proc/self/fd/${destinationHandle.fd}`, destinationName);
        await fs.writeFile(destination, files['selection.json']);
        collisionIdentity = fileIdentity(await fs.lstat(destination));
      }
      return next(sourceHandle, sourceName, destinationHandle, destinationName);
    }
  });

  await assertP5Failure(
    installExecuteSelection({ authority: fixture.authority, files, fsImpl }),
    'P5_INSTALL_FAILED',
    fixture.root
  );
  const destination = path.join(fixture.runDir, 'playbook-execute', 'selection.json');
  assert.deepEqual(fileIdentity(await fs.lstat(destination)), collisionIdentity);
  assert.deepEqual(await fs.readFile(destination), files['selection.json']);
  assert.equal(await generatedRootEntries(fixture.runDir), 0);
});

test('selection identical and replacement paths preserve candidates and replace the complete owned set', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const oldFiles = selectionFiles('old');
  const newFiles = selectionFiles('new');
  await installExecuteSelection({ authority: fixture.authority, files: oldFiles });
  const oldSelectionInodes = await selectionInodes(fixture.runDir);
  const candidateInodes = await allCandidateInodes(fixture.runDir);

  assert.equal((await installExecuteSelection({
    authority: fixture.authority,
    files: oldFiles
  })).status, 'unchanged');
  assert.deepEqual(await selectionInodes(fixture.runDir), oldSelectionInodes);

  assert.equal((await installExecuteSelection({
    authority: fixture.authority,
    files: newFiles
  })).status, 'replaced');
  for (const name of SELECTION_TEST_PATHS) {
    assert.deepEqual(await fs.readFile(path.join(fixture.runDir, 'playbook-execute', name)), newFiles[name]);
  }
  assert.deepEqual(await allCandidateInodes(fixture.runDir), candidateInodes);
  assert.equal(await generatedRootEntries(fixture.runDir), 0);
});

test('selection root-sync failure after promotion restores exact old selection and candidate inodes', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const oldFiles = selectionFiles('old');
  await installExecuteSelection({ authority: fixture.authority, files: oldFiles });
  const oldSelectionInodes = await selectionInodes(fixture.runDir);
  const candidateInodes = await allCandidateInodes(fixture.runDir);
  let rootSyncs = 0;
  const fsImpl = fsWith({
    async open(target, flags, ...args) {
      const handle = await fs.open(target, flags, ...args);
      if (path.basename(String(target)) !== 'playbook-execute') return handle;
      return wrapFileHandle(handle, {
        async sync() {
          rootSyncs += 1;
          throw new Error('RAW_ROOT_SYNC_FAILURE');
        }
      });
    }
  });

  await assertP5Failure(
    installExecuteSelection({
      authority: fixture.authority,
      files: selectionFiles('new'),
      fsImpl
    }),
    'P5_INSTALL_FAILED',
    fixture.root,
    'RAW_ROOT_SYNC_FAILURE'
  );
  assert.equal(rootSyncs, 2);
  assert.deepEqual(await selectionInodes(fixture.runDir), oldSelectionInodes);
  assert.deepEqual(await allCandidateInodes(fixture.runDir), candidateInodes);
  assert.equal(await generatedRootEntries(fixture.runDir), 0);
});

test('candidate-root swap during replacement promotion restores the exact old selection generation', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const oldFiles = selectionFiles('old');
  const replacement = selectionFiles('replacement');
  await installExecuteSelection({ authority: fixture.authority, files: oldFiles });
  const oldSelectionInodes = await selectionInodes(fixture.runDir);
  const executeRoot = path.join(fixture.runDir, 'playbook-execute');
  const candidatesRoot = path.join(executeRoot, 'candidates');
  const firstRoot = path.join(candidatesRoot, 'candidate-01');
  const secondRoot = path.join(candidatesRoot, 'candidate-02');
  const parkedRoot = path.join(candidatesRoot, '.test-candidate-swap');
  let swapped = false;
  const swapCandidateRoots = async () => {
    await fs.rename(firstRoot, parkedRoot);
    await fs.rename(secondRoot, firstRoot);
    await fs.rename(parkedRoot, secondRoot);
  };
  const fsImpl = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
      if (!swapped && destinationName === 'selection.json'
        && await pathContainsGeneratedName(`/proc/self/fd/${sourceHandle.fd}`, STAGE_PREFIX)) {
        await swapCandidateRoots();
        swapped = true;
      }
      return result;
    }
  });

  await assertP5Failure(
    installExecuteSelection({ authority: fixture.authority, files: replacement, fsImpl }),
    'P5_INSTALL_FAILED',
    fixture.root
  );
  assert.equal(swapped, true);
  await swapCandidateRoots();
  assert.deepEqual(await selectionInodes(fixture.runDir), oldSelectionInodes);
  for (const name of SELECTION_TEST_PATHS) {
    assert.deepEqual(await fs.readFile(path.join(executeRoot, name)), oldFiles[name]);
  }
  assert.equal(await generatedRootEntries(fixture.runDir), 0);
});

test('candidate-root swap rollback cleanup fault cannot displace the restored old selection', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const oldFiles = selectionFiles('old');
  await installExecuteSelection({ authority: fixture.authority, files: oldFiles });
  const oldSelectionInodes = await selectionInodes(fixture.runDir);
  const executeRoot = path.join(fixture.runDir, 'playbook-execute');
  const candidatesRoot = path.join(executeRoot, 'candidates');
  const firstRoot = path.join(candidatesRoot, 'candidate-01');
  const secondRoot = path.join(candidatesRoot, 'candidate-02');
  const parkedRoot = path.join(candidatesRoot, '.test-candidate-swap');
  let swapped = false;
  let cleanupFailed = false;
  const swapCandidateRoots = async () => {
    await fs.rename(firstRoot, parkedRoot);
    await fs.rename(secondRoot, firstRoot);
    await fs.rename(parkedRoot, secondRoot);
  };
  const fsImpl = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
      if (!swapped && destinationName === 'selection.json'
        && await pathContainsGeneratedName(`/proc/self/fd/${sourceHandle.fd}`, STAGE_PREFIX)) {
        await swapCandidateRoots();
        swapped = true;
      }
      return result;
    },
    async unlink(target) {
      if (swapped && !cleanupFailed && await pathContainsGeneratedName(String(target), STAGE_PREFIX)) {
        cleanupFailed = true;
        throw new Error('RAW_ROLLBACK_CLEANUP_FAILURE');
      }
      return fs.unlink(target);
    }
  });

  await assertP5Failure(
    installExecuteSelection({ authority: fixture.authority, files: selectionFiles('replacement'), fsImpl }),
    'P5_INSTALL_FAILED',
    fixture.root,
    'RAW_ROLLBACK_CLEANUP_FAILURE'
  );
  assert.equal(swapped, true);
  assert.equal(cleanupFailed, true);
  await swapCandidateRoots();
  assert.deepEqual(await selectionInodes(fixture.runDir), oldSelectionInodes);
  for (const name of SELECTION_TEST_PATHS) {
    assert.deepEqual(await fs.readFile(path.join(executeRoot, name)), oldFiles[name]);
  }
  const residue = (await fs.readdir(executeRoot)).filter((name) => (
    name.startsWith(STAGE_PREFIX) || name.startsWith(BACKUP_PREFIX)
  ));
  assert.equal(residue.length, 1);
  assert.match(residue[0], new RegExp(`^${escapeRegex(STAGE_PREFIX)}`, 'u'));
});

test('selection faults after each successful partial promotion restore the exact old generation', async (t) => {
  for (let failAt = 1; failAt <= SELECTION_TEST_PATHS.length; failAt += 1) {
    await t.test(`promotion-${failAt}`, async (t) => {
      const fixture = await threeCandidateFixture(t);
      await installExecuteSelection({ authority: fixture.authority, files: selectionFiles('old') });
      const oldSelection = await selectionInodes(fixture.runDir);
      const oldCandidates = await allCandidateInodes(fixture.runDir);
      let promoted = 0;
      const fsImpl = fsWith({
        async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
          const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
          if (SELECTION_TEST_PATHS.includes(destinationName) && ++promoted === failAt) {
            throw new Error('RAW_LATE_SELECTION_PROMOTION_FAILURE');
          }
          return result;
        }
      });

      await assertP5Failure(
        installExecuteSelection({
          authority: fixture.authority,
          files: selectionFiles('new'),
          fsImpl
        }),
        'P5_INSTALL_FAILED',
        fixture.root,
        'RAW_LATE_SELECTION_PROMOTION_FAILURE'
      );
      assert.deepEqual(await selectionInodes(fixture.runDir), oldSelection);
      assert.deepEqual(await allCandidateInodes(fixture.runDir), oldCandidates);
    });
  }
});

test('selection detects a staged source swap without consuming foreign or parked bytes', async (t) => {
  const fixture = await threeCandidateFixture(t);
  await installExecuteSelection({ authority: fixture.authority, files: selectionFiles('old') });
  const oldSelection = await selectionInodes(fixture.runDir);
  const foreign = path.join(fixture.root, 'foreign-selection.json');
  await fs.writeFile(foreign, 'foreign selection bytes\n');
  const foreignBefore = await inodeTree(foreign);
  let parked;
  let parkedBefore;
  let swapped = false;
  const fsImpl = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      if (
        !swapped
        && sourceName === 'selection.json'
        && destinationName === 'selection.json'
        && await pathContainsGeneratedName(`/proc/self/fd/${sourceHandle.fd}`, STAGE_PREFIX)
      ) {
        const stagePath = `/proc/self/fd/${sourceHandle.fd}`;
        parked = path.join(await fs.readlink(stagePath), 'parked-selection.json');
        await fs.rename(path.join(stagePath, sourceName), parked);
        parkedBefore = await inodeTree(parked);
        await fs.link(foreign, path.join(stagePath, sourceName));
        swapped = true;
      }
      return next(sourceHandle, sourceName, destinationHandle, destinationName);
    }
  });

  await assertP5Failure(
    installExecuteSelection({ authority: fixture.authority, files: selectionFiles('new'), fsImpl }),
    'P5_INSTALL_FAILED',
    fixture.root
  );
  assert.equal(swapped, true);
  assert.deepEqual(await inodeTree(foreign), foreignBefore);
  assert.deepEqual(await selectionInodes(fixture.runDir), oldSelection);
  assert.deepEqual(await inodeTree(parked), parkedBefore);
});

test('selection detects an existing source swap without deleting old or foreign bytes', async (t) => {
  const fixture = await threeCandidateFixture(t);
  const oldFiles = selectionFiles('old');
  await installExecuteSelection({ authority: fixture.authority, files: oldFiles });
  const root = path.join(fixture.runDir, 'playbook-execute');
  const canonical = path.join(root, 'manifest.json');
  const parked = path.join(root, 'parked-owned-manifest.json');
  const oldIdentity = fileIdentity(await fs.lstat(canonical));
  let foreignIdentity;
  let swapped = false;
  const swap = async (sourceName) => {
    if (!swapped && sourceName === 'manifest.json') {
      await fs.rename(canonical, parked);
      await fs.writeFile(canonical, 'foreign manifest bytes\n');
      foreignIdentity = fileIdentity(await fs.lstat(canonical));
      swapped = true;
    }
  };
  const fsImpl = fsWith({
    async renameNoReplace(directoryHandle, sourceName, destinationName, next) {
      await swap(sourceName);
      return next(directoryHandle, sourceName, destinationName);
    },
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      await swap(sourceName);
      return next(sourceHandle, sourceName, destinationHandle, destinationName);
    }
  });

  await assertP5Failure(
    installExecuteSelection({ authority: fixture.authority, files: selectionFiles('new'), fsImpl }),
    'P5_INSTALL_FAILED',
    fixture.root
  );
  assert.equal(swapped, true);
  assert.deepEqual(fileIdentity(await fs.lstat(canonical)), foreignIdentity);
  assert.deepEqual(fileIdentity(await fs.lstat(parked)), oldIdentity);
  assert.deepEqual(await fs.readFile(parked), oldFiles['manifest.json']);
});

test('every selection postcommit backup cleanup failure keeps the complete new generation authoritative', async (t) => {
  const counts = await selectionRetirementOperationCounts(t);
  assert.ok(counts.retireUnlink >= SELECTION_TEST_PATHS.length, JSON.stringify(counts));
  assert.ok(counts.retireRmdir >= 1, JSON.stringify(counts));

  for (const category of ['retireUnlink', 'retireRmdir']) {
    for (let failAt = 1; failAt <= counts[category]; failAt += 1) {
      await t.test(`${category}-${failAt}`, async (t) => {
        const fixture = await threeCandidateFixture(t);
        await installExecuteSelection({ authority: fixture.authority, files: selectionFiles('old') });
        const candidates = await allCandidateInodes(fixture.runDir);
        const replacement = selectionFiles('new');
        const result = await installExecuteSelection({
          authority: fixture.authority,
          files: replacement,
          fsImpl: retirementFs({ failCategory: category, failAt })
        });
        assert.equal(result.status, 'replaced');
        for (const name of SELECTION_TEST_PATHS) {
          assert.deepEqual(
            await fs.readFile(path.join(fixture.runDir, 'playbook-execute', name)),
            replacement[name]
          );
        }
        assert.deepEqual(await allCandidateInodes(fixture.runDir), candidates);
      });
    }
  }
});

test('selection retirement rechecks canonical and retained backup identity at every boundary', async (t) => {
  for (let boundary = 1; boundary <= SELECTION_TEST_PATHS.length + 1; boundary += 1) {
    await t.test(boundary <= SELECTION_TEST_PATHS.length
      ? `before-unlink-${boundary}`
      : 'before-close-rmdir', async (t) => {
      const fixture = await threeCandidateFixture(t);
      await installExecuteSelection({ authority: fixture.authority, files: selectionFiles('old') });
      const replacement = selectionFiles('new');
      let promoted = false;
      let retirementChecks = 0;
      let swapped = false;
      let parked;
      let parkedBefore;
      let foreign;
      let foreignBefore;
      const fsImpl = fsWith({
        async open(target, flags, ...args) {
          const handle = await fs.open(target, flags, ...args);
          if (!path.basename(String(target)).startsWith(BACKUP_PREFIX)) return handle;
          return wrapFileHandle(handle, {
            async stat(...statArgs) {
              if (promoted && !swapped && ++retirementChecks === boundary) {
                const canonical = await fs.readlink(`/proc/self/fd/${handle.fd}`);
                parked = `${canonical}-parked`;
                await fs.rename(canonical, parked);
                parkedBefore = await inodeTree(parked);
                await fs.mkdir(canonical);
                await fs.writeFile(path.join(canonical, 'foreign.txt'), 'foreign retirement bytes\n');
                foreign = canonical;
                foreignBefore = await inodeTree(foreign);
                swapped = true;
              }
              return handle.stat(...statArgs);
            }
          });
        },
        async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
          const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
          if (
            sourceName === 'manifest.json'
            && destinationName === 'manifest.json'
            && await pathContainsGeneratedName(`/proc/self/fd/${sourceHandle.fd}`, STAGE_PREFIX)
          ) promoted = true;
          return result;
        }
      });

      const result = await installExecuteSelection({
        authority: fixture.authority,
        files: replacement,
        fsImpl
      });
      assert.equal(result.status, 'replaced');
      assert.equal(swapped, true);
      assert.deepEqual(await inodeTree(parked), parkedBefore);
      assert.deepEqual(await inodeTree(foreign), foreignBefore);
      for (const name of SELECTION_TEST_PATHS) {
        assert.deepEqual(
          await fs.readFile(path.join(fixture.runDir, 'playbook-execute', name)),
          replacement[name]
        );
      }
    });
  }
});

test('selection rejects file-map, manifest, hash, and existing ownership drift', async (t) => {
  for (const [name, mutate, expectedCode] of [
    ['missing', (files) => { delete files['selection-report.md']; }, 'P5_AUTHORITY_INVALID'],
    ['extra', (files) => { files['extra.txt'] = Buffer.from('provider-secret'); }, 'P5_AUTHORITY_INVALID'],
    ['non-buffer', (files) => { files['selection-report.md'] = 'not bytes'; }, 'P5_AUTHORITY_INVALID'],
    ['corrupt-manifest', (files) => { files['manifest.json'] = Buffer.from('{RAW_MANIFEST'); }, 'P5_AUTHORITY_INVALID'],
    ['hash-drift', (files) => { files['selection-report.md'] = Buffer.from('drift\n'); }, 'P5_AUTHORITY_INVALID']
  ]) {
    await t.test(name, async (t) => {
      const fixture = await threeCandidateFixture(t);
      const files = selectionFiles();
      mutate(files);
      await assertP5Failure(
        installExecuteSelection({ authority: fixture.authority, files }),
        expectedCode,
        fixture.root,
        'provider-secret|RAW_MANIFEST'
      );
    });
  }

  await t.test('existing-drift', async (t) => {
    const fixture = await threeCandidateFixture(t);
    const files = selectionFiles();
    await installExecuteSelection({ authority: fixture.authority, files });
    const report = path.join(fixture.runDir, 'playbook-execute', 'selection-report.md');
    await fs.chmod(report, 0o600);
    await fs.writeFile(report, 'foreign provider-secret\n');
    const before = await snapshotTree(fixture.root);
    await assertP5Failure(
      installExecuteSelection({ authority: fixture.authority, files: selectionFiles('replacement') }),
      'P5_INSTALL_FAILED',
      fixture.root,
      'provider-secret'
    );
    assert.deepEqual(await snapshotTree(fixture.root), before);
  });
});

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
      'reviews/chain-0001-hard-qa.json': Buffer.from(QA_BYTES),
      'reviews/chain-0001-review.json': Buffer.from(REVIEW_BYTES)
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
  const envelopes = buildEnvelopes(candidateId, 2, initial.chainHash, TRANSACTION_HASH);
  const chain = createChainManifest(chainInput(candidateId, envelopes, {
    chain_revision: 2,
    parent_chain_sha256: initial.chainHash,
    repair_transaction_sha256: TRANSACTION_HASH,
    created_from: 'replay'
  }));
  const currentChain = chainManifestBytes(chain);
  return {
    files: {
      ...cloneBuffers(initial.files),
      [`chains/chain-${padRevision(initial.chain.chain_revision)}.json`]: Buffer.from(initial.currentChain),
      ...checkpointFileMap(envelopes)
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

function buildEnvelopes(candidateId, revision, baseChainSha256, transactionSha256) {
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
      compiled_artifact_hashes: { layer_payload_sha256: ARTIFACT_HASH },
      hard_qa: { hard_qa_ok: true, hard_qa_sha256: QA_HASH },
      design_review: { p4_review_sha256: REVIEW_HASH },
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

function chainInput(candidateId, checkpoint_envelopes, overrides) {
  return {
    candidate_id: candidateId,
    checkpoint_envelopes,
    frozen_design_sha256: DESIGN_HASH,
    frozen_generator_context_sha256: CONTEXT_HASH,
    blueprint_sha256: BLUEPRINT_HASH,
    hard_qa_sha256: QA_HASH,
    p4_review_sha256: REVIEW_HASH,
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
    'current-chain.json': Buffer.from(snapshot.currentChain)
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
      seed: 11 + index,
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
