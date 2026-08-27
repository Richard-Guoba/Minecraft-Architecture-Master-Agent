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
const QA_HASH = 'b'.repeat(64);
const REVIEW_HASH = 'c'.repeat(64);
const DESIGN_HASH = 'd'.repeat(64);
const CONTEXT_HASH = 'e'.repeat(64);
const BLUEPRINT_HASH = 'f'.repeat(64);
const TRANSACTION_HASH = '9'.repeat(64);

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
    ['non-buffer', (snapshot) => { snapshot.files['checkpoints/roof/r0001.json'] = '{}\n'; }]
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

test('backup rename, final no-replace rename, pointer write, and cleanup failures restore exact old inodes', async (t) => {
  for (const category of ['backupRename', 'finalRename', 'pointerWrite', 'cleanup']) {
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
    'P5_AUTHORITY_INVALID',
    fixture.root
  );
  for (const candidateId of ['candidate-01', 'candidate-02']) {
    await installCandidateSnapshot({ authority, candidateId, ...initialSnapshot(candidateId) });
  }
  await assertP5Failure(
    installExecuteSelection({ authority, files }),
    'P5_AUTHORITY_INVALID',
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
  assert.equal(rootSyncs, 1);
  assert.deepEqual(await selectionInodes(fixture.runDir), oldSelectionInodes);
  assert.deepEqual(await allCandidateInodes(fixture.runDir), candidateInodes);
  assert.equal(await generatedRootEntries(fixture.runDir), 0);
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
      'P5_OUTPUT_OWNERSHIP',
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
    files: checkpointFileMap(envelopes),
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
      ...checkpointFileMap(initial.envelopes),
      [`chains/chain-${padRevision(initial.chain.chain_revision)}.json`]: Buffer.from(initial.currentChain),
      ...checkpointFileMap(envelopes)
    },
    currentChain,
    chain,
    chainHash: chainManifestHash(chain),
    envelopes
  };
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
  const selection = canonicalBytes({
    schema_version: 1,
    mode: 'execute',
    candidate_count: 3,
    candidates: ['candidate-01', 'candidate-02', 'candidate-03'].map((candidate_id, index) => ({
      candidate_id,
      seed: 11 + index,
      current_chain_sha256: null,
      hard_qa_sha256: null,
      p4_review_sha256: null,
      eligibility: {
        status: 'hard-qa-failed',
        hard_qa_ok: false,
        unresolved_violated_core_rule_ids: [],
        neutral_unknown_rule_ids: [],
        neutral_not_applicable_rule_ids: [],
        repair_budget_used: 0
      },
      repair_attempt_count: 0
    })),
    selected_candidate_id: null,
    selected_chain_sha256: null,
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
      if (await pathContainsGeneratedName(String(target), BACKUP_PREFIX)) tick('cleanup');
      return fs.unlink(target);
    }
  });
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
