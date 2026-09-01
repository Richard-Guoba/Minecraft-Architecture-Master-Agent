import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  admitP6Run,
  createP6Run,
  publishP6Generation,
  readCurrentP6Generation,
  readP6InputAuthority
} from '../src/playbook/p6/storage.js';
import { admitP6CohortInputs } from '../src/playbook/p6/cohort.js';
import {
  admitExecuteRun,
  installCandidateSnapshot,
  installExecuteSelection
} from '../src/playbook/execute/storage.js';
import * as executeStorage from '../src/playbook/execute/storage.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import { createP6CohortFixture } from './fixtures/playbookP6.js';

const KINDS = [
  'cohort', 'reference-renders', 'capture-session', 'minecraft-captures',
  'observations', 'blind-comparison', 'gate'
];

test('createP6Run binds playbook-p6 beneath the exact caller run and publishes exact managed paths', async t => {
  const fixture = await createStorageFixture(t);
  assert.equal(fixture.publicP6Dir, 'playbook-p6');
  assert.equal(path.isAbsolute(fixture.publicP6Dir), false);
  assert.equal(JSON.stringify(fixture.created).includes(fixture.root), false);

  const files = {
    'cohort.json': Buffer.from('{"cohort":true}'),
    'cohort-report.md': Buffer.from('# Cohort\n')
  };
  const published = await publishP6Generation({
    authority: fixture.authority,
    kind: 'cohort',
    files
  });
  assert.deepEqual(published, {
    status: 'created',
    kind: 'cohort',
    generation: 'generation-000001',
    manifest_sha256: published.manifest_sha256
  });

  const current = await readCurrentP6Generation({ authority: fixture.authority, kind: 'cohort' });
  assert.equal(current.generation, 'generation-000001');
  assert.deepEqual(Object.keys(current.files), ['cohort-report.md', 'cohort.json']);
  assert.ok(current.files['cohort.json'].equals(files['cohort.json']));
  assert.deepEqual(current.manifest.managed_paths, ['cohort-report.md', 'cohort.json']);
  assert.deepEqual(current.manifest.artifact_hashes, {
    'cohort-report.md': sha256(files['cohort-report.md']),
    'cohort.json': sha256(files['cohort.json'])
  });
  assert.equal(JSON.stringify(current).includes(fixture.root), false);

  const generationDir = path.join(fixture.p6Dir, 'cohort', 'generations', 'generation-000001');
  await assert.rejects(fs.writeFile(path.join(generationDir, 'cohort.json'), Buffer.from('overwrite')), { code: 'EACCES' });
  assert.deepEqual((await fs.readdir(fixture.p6Dir)).sort(), ['.p6-owned.json', 'cohort']);
});

test('all and only approved P6 output kinds can publish immutable generations', async t => {
  const fixture = await createStorageFixture(t);
  let captureSessionCurrent;
  let cohortCurrent;
  let capturesCurrent;
  for (const kind of KINDS) {
    const expectedCurrent = kind === 'minecraft-captures' ? {
      kind: 'capture-session',
      generation: captureSessionCurrent.generation,
      manifest_sha256: captureSessionCurrent.manifest_sha256
    } : kind === 'blind-comparison' ? [
      { kind: 'cohort', generation: cohortCurrent.generation, manifest_sha256: cohortCurrent.manifest_sha256 },
      { kind: 'minecraft-captures', generation: capturesCurrent.generation, manifest_sha256: capturesCurrent.manifest_sha256 },
      { kind: 'blind-comparison', generation: null, manifest_sha256: null }
    ] : undefined;
    const result = await publishP6Generation({
      authority: fixture.authority,
      kind,
      files: { 'body.json': Buffer.from(`{"kind":"${kind}"}`) },
      expectedCurrent
    });
    assert.equal(result.generation, 'generation-000001');
    if (kind === 'capture-session') {
      captureSessionCurrent = await readCurrentP6Generation({ authority: fixture.authority, kind });
    }
    if (kind === 'cohort') cohortCurrent = await readCurrentP6Generation({ authority: fixture.authority, kind });
    if (kind === 'minecraft-captures') capturesCurrent = await readCurrentP6Generation({ authority: fixture.authority, kind });
  }
  await assert.rejects(
    publishP6Generation({ authority: fixture.authority, kind: 'worlds', files: { 'body.json': Buffer.from('{}') } }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  await assert.rejects(
    publishP6Generation({ authority: fixture.authority, kind: 'cohort', files: { '../escape': Buffer.from('x') } }),
    publicCode('P6_AUTHORITY_INVALID')
  );
});

test('minecraft capture publication cannot omit its exact capture-session precondition', async t => {
  const fixture = await createStorageFixture(t);
  await publishP6Generation({
    authority: fixture.authority,
    kind: 'capture-session',
    files: { 'capture-session.json': Buffer.from('session') }
  });
  await assert.rejects(
    publishP6Generation({
      authority: fixture.authority,
      kind: 'minecraft-captures',
      files: { 'capture-manifest.json': Buffer.from('{}') }
    }),
    publicCode('P6_AUTHORITY_INVALID')
  );
});

test('replacement advances the current pointer without changing an immutable prior generation', async t => {
  const fixture = await createStorageFixture(t);
  const firstBytes = Buffer.from('{"revision":1}');
  const secondBytes = Buffer.from('{"revision":2}');
  await publishP6Generation({ authority: fixture.authority, kind: 'gate', files: { 'gate.json': firstBytes } });
  const oldPath = path.join(fixture.p6Dir, 'gate', 'generations', 'generation-000001', 'gate.json');
  const oldIdentity = identity(await fs.lstat(oldPath));

  const replaced = await publishP6Generation({ authority: fixture.authority, kind: 'gate', files: { 'gate.json': secondBytes } });
  assert.equal(replaced.status, 'replaced');
  assert.equal(replaced.generation, 'generation-000002');
  assert.equal(identityEqual(identity(await fs.lstat(oldPath)), oldIdentity), true);
  assert.ok((await fs.readFile(oldPath)).equals(firstBytes));
  const current = await readCurrentP6Generation({ authority: fixture.authority, kind: 'gate' });
  assert.equal(current.generation, 'generation-000002');
  assert.ok(current.files['gate.json'].equals(secondBytes));
});

test('a concurrent reader observes the old generation during the current-pointer switch', async t => {
  const fixture = await createStorageFixture(t);
  await publishP6Generation({ authority: fixture.authority, kind: 'gate', files: { 'gate.json': Buffer.from('old') } });
  let releaseMove;
  const release = new Promise(resolve => { releaseMove = resolve; });
  let enteredMove;
  const entered = new Promise(resolve => { enteredMove = resolve; });
  const pausing = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      if (sourceName.startsWith('.p6-current-') && destinationName === 'current') {
        enteredMove();
        await release;
      }
      return next(sourceHandle, sourceName, destinationHandle, destinationName);
    }
  });
  const publishing = publishP6Generation({
    authority: fixture.authority,
    kind: 'gate',
    files: { 'gate.json': Buffer.from('new') },
    fsImpl: pausing
  });
  await entered;
  let released = false;
  const racingReader = fsWith({
    async lstat(target, ...args) {
      try { return await fs.lstat(target, ...args); }
      catch (error) {
        if (!released && error?.code === 'ENOENT' && String(target).endsWith('/current')) {
          released = true;
          releaseMove();
          await publishing;
        }
        throw error;
      }
    }
  });
  const during = await readCurrentP6Generation({
    authority: fixture.authority,
    kind: 'gate',
    fsImpl: racingReader
  });
  assert.ok(['generation-000001', 'generation-000002'].includes(during.generation));
  await publishing;
  const after = await readCurrentP6Generation({ authority: fixture.authority, kind: 'gate' });
  assert.equal(after.generation, 'generation-000002');
});

test('cross-kind transaction rejects a capture publication when session replacement wins after preliminary validation', async t => {
  const fixture = await createStorageFixture(t);
  await publishP6Generation({
    authority: fixture.authority,
    kind: 'capture-session',
    files: { 'capture-session.json': Buffer.from('old-session') }
  });
  const expected = await readCurrentP6Generation({
    authority: fixture.authority,
    kind: 'capture-session'
  });
  await publishP6Generation({
    authority: fixture.authority,
    kind: 'minecraft-captures',
    files: { 'capture-manifest.json': Buffer.from('old-capture') },
    expectedCurrent: {
      kind: 'capture-session',
      generation: expected.generation,
      manifest_sha256: expected.manifest_sha256
    }
  });
  const secondAuthority = await admitP6Run({ p6Dir: fixture.p6Dir });
  t.after(() => secondAuthority.close());
  let replaced = false;
  const interleaving = fsWith({
    async afterExpectedCurrentValidation() {
      if (!replaced) {
        replaced = true;
        await publishP6Generation({
          authority: secondAuthority,
          kind: 'capture-session',
          files: { 'capture-session.json': Buffer.from('new-session') }
        });
      }
    }
  });

  await assert.rejects(
    publishP6Generation({
      authority: fixture.authority,
      kind: 'minecraft-captures',
      files: { 'capture-manifest.json': Buffer.from('new-capture') },
      expectedCurrent: {
        kind: 'capture-session',
        generation: expected.generation,
        manifest_sha256: expected.manifest_sha256
      },
      fsImpl: interleaving
    }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  const session = await readCurrentP6Generation({
    authority: fixture.authority,
    kind: 'capture-session'
  });
  assert.ok(session.files['capture-session.json'].equals(Buffer.from('new-session')));
  const captures = await readCurrentP6Generation({
    authority: fixture.authority,
    kind: 'minecraft-captures'
  });
  assert.equal(captures.generation, 'generation-000001');
  assert.ok(captures.files['capture-manifest.json'].equals(Buffer.from('old-capture')));
  assert.deepEqual(
    (await fs.readdir(path.join(fixture.p6Dir, 'minecraft-captures', 'generations'))).sort(),
    ['.p6-owned.json', 'generation-000001']
  );
});

test('shared publication critical section serializes session replacement across admitted authorities', async t => {
  const fixture = await createStorageFixture(t);
  await publishP6Generation({
    authority: fixture.authority,
    kind: 'capture-session',
    files: { 'capture-session.json': Buffer.from('old-session') }
  });
  const expected = await readCurrentP6Generation({
    authority: fixture.authority,
    kind: 'capture-session'
  });
  const secondAuthority = await admitP6Run({ p6Dir: fixture.p6Dir });
  t.after(() => secondAuthority.close());
  let enterCommit;
  const enteredCommit = new Promise(resolve => { enterCommit = resolve; });
  let releaseCommit;
  const release = new Promise(resolve => { releaseCommit = resolve; });
  const pausing = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      if (sourceName.startsWith('.p6-stage-') && destinationName === 'generation-000001') {
        enterCommit();
        await release;
      }
      return next(sourceHandle, sourceName, destinationHandle, destinationName);
    }
  });
  const capturePublication = publishP6Generation({
    authority: fixture.authority,
    kind: 'minecraft-captures',
    files: { 'capture-manifest.json': Buffer.from('capture') },
    expectedCurrent: {
      kind: 'capture-session',
      generation: expected.generation,
      manifest_sha256: expected.manifest_sha256
    },
    fsImpl: pausing
  });
  await enteredCommit;
  const sessionReplacement = publishP6Generation({
    authority: secondAuthority,
    kind: 'capture-session',
    files: { 'capture-session.json': Buffer.from('new-session') }
  });
  const beforeRelease = await Promise.race([
    sessionReplacement.then(() => 'fulfilled', () => 'rejected'),
    new Promise(resolve => setTimeout(() => resolve('pending'), 100))
  ]);
  assert.equal(beforeRelease, 'pending');
  releaseCommit();

  const [capture, session] = await Promise.all([capturePublication, sessionReplacement]);
  assert.equal(capture.generation, 'generation-000001');
  assert.equal(session.generation, 'generation-000002');
  const currentCapture = await readCurrentP6Generation({
    authority: fixture.authority, kind: 'minecraft-captures'
  });
  assert.ok(currentCapture.files['capture-manifest.json'].equals(Buffer.from('capture')));
  const currentSession = await readCurrentP6Generation({
    authority: fixture.authority, kind: 'capture-session'
  });
  assert.ok(currentSession.files['capture-session.json'].equals(Buffer.from('new-session')));
});

test('process death releases the shared publication lock for crash recovery', { timeout: 10000 }, async t => {
  const fixture = await createStorageFixture(t);
  await fixture.authority.close();
  const crashed = await runCrashWorker({
    p6Dir: fixture.p6Dir,
    phase: 'before-current-move',
    kind: 'capture-session',
    files: { 'capture-session.json': Buffer.from('crashed-session').toString('base64') }
  });
  assert.equal(crashed.signal, 'SIGKILL');
  const reopened = await admitP6Run({ p6Dir: fixture.p6Dir });
  t.after(() => reopened.close());
  const recovered = await readCurrentP6Generation({
    authority: reopened, kind: 'capture-session'
  });
  assert.ok(recovered.files['capture-session.json'].equals(Buffer.from('crashed-session')));
  const replaced = await publishP6Generation({
    authority: reopened,
    kind: 'capture-session',
    files: { 'capture-session.json': Buffer.from('post-crash-session') }
  });
  assert.equal(replaced.generation, 'generation-000002');
});

test('crash journals reopen to one complete old-or-new current generation', async t => {
  for (const phase of [
    'before-current-move', 'after-current-move',
    'before-retire-move', 'after-retire-move',
    'before-retired-file-remove', 'after-retired-file-remove',
    'before-retirement-dir-remove', 'after-retirement-dir-remove'
  ]) await t.test(phase, async t => {
    const fixture = await createStorageFixture(t);
    await publishP6Generation({ authority: fixture.authority, kind: 'gate', files: { 'gate.json': Buffer.from('old') } });
    await fixture.authority.close();
    const result = await runCrashWorker({
      p6Dir: fixture.p6Dir,
      phase,
      kind: 'gate',
      files: { 'gate.json': Buffer.from('new').toString('base64') }
    });
    assert.equal(result.signal, 'SIGKILL');
    const reopened = await admitP6Run({ p6Dir: fixture.p6Dir });
    t.after(() => reopened.close());
    const current = await readCurrentP6Generation({ authority: reopened, kind: 'gate' });
    assert.ok(['old', 'new'].includes(current.files['gate.json'].toString('utf8')));
    await publishP6Generation({ authority: reopened, kind: 'gate', files: { 'gate.json': Buffer.from('later') } });
  });
});

test('first publication crashes reopen from every provenance-bound installed-generation pointer boundary', async t => {
  for (const phase of [
    'after-first-generation-move',
    'before-current-move', 'after-current-move'
  ]) await t.test(phase, async t => {
    const fixture = await createStorageFixture(t);
    await fixture.authority.close();
    const result = await runCrashWorker({
      p6Dir: fixture.p6Dir,
      phase,
      kind: 'gate',
      files: { 'gate.json': Buffer.from('first').toString('base64') }
    });
    assert.equal(result.signal, 'SIGKILL', result.stderr);
    const reopened = await admitP6Run({ p6Dir: fixture.p6Dir });
    t.after(() => reopened.close());
    const current = await readCurrentP6Generation({ authority: reopened, kind: 'gate' });
    assert.equal(current.generation, 'generation-000001');
    assert.equal(current.files['gate.json'].toString('utf8'), 'first');
    await publishP6Generation({
      authority: reopened,
      kind: 'gate',
      files: { 'gate.json': Buffer.from('later') }
    });
  });
});

test('first publication recovery rejects ambiguous complete orphan generations', async t => {
  const fixture = await createStorageFixture(t);
  await fixture.authority.close();
  const result = await runCrashWorker({
    p6Dir: fixture.p6Dir,
    phase: 'after-first-generation-move',
    kind: 'gate',
    files: { 'gate.json': Buffer.from('first').toString('base64') }
  });
  assert.equal(result.signal, 'SIGKILL', result.stderr);
  const kindDir = path.join(fixture.p6Dir, 'gate');
  const currentStage = (await fs.readdir(kindDir))
    .find(name => name.startsWith('.p6-current-'));
  assert.ok(currentStage);
  const journalAuthority = `.p6-journal-authority-${currentStage.slice('.p6-'.length)}`;
  await fs.rename(path.join(kindDir, currentStage), path.join(fixture.root, 'parked-current-stage'));
  await fs.rename(path.join(kindDir, journalAuthority), path.join(fixture.root, 'parked-journal-authority'));
  const generations = path.join(fixture.p6Dir, 'gate', 'generations');
  const first = path.join(generations, 'generation-000001');
  const foreign = path.join(generations, 'generation-000002');
  await fs.cp(first, foreign, { recursive: true });
  const manifestPath = path.join(foreign, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.generation = 'generation-000002';
  await fs.chmod(manifestPath, 0o600);
  await fs.writeFile(manifestPath, stableJson(manifest));
  await fs.chmod(manifestPath, 0o400);
  await assert.rejects(
    admitP6Run({ p6Dir: fixture.p6Dir }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  assert.equal(await fs.readFile(path.join(first, 'gate.json'), 'utf8'), 'first');
  assert.equal(await fs.readFile(path.join(foreign, 'gate.json'), 'utf8'), 'first');
});

test('recovery preserves foreign prefix-matching current stages across every public operation', async t => {
  for (const contents of ['same-byte', 'malformed']) {
    for (const operation of ['admit', 'read', 'publish']) await t.test(`${contents}:${operation}`, async t => {
      const fixture = await createStorageFixture(t);
      await publishP6Generation({
        authority: fixture.authority,
        kind: 'gate',
        files: { 'gate.json': Buffer.from('owned') }
      });
      const kindDir = path.join(fixture.p6Dir, 'gate');
      const basename = '.p6-current-999999-999999-aaaaaaaaaaaaaaaa';
      const foreignPath = path.join(kindDir, basename);
      const bytes = contents === 'same-byte'
        ? await fs.readFile(path.join(kindDir, 'current'))
        : Buffer.from('foreign malformed stage');
      await fs.writeFile(foreignPath, bytes, { mode: 0o400 });
      const before = identity(await fs.lstat(foreignPath));
      const invoke = operation === 'admit'
        ? () => admitP6Run({ p6Dir: fixture.p6Dir })
        : operation === 'read'
          ? () => readCurrentP6Generation({ authority: fixture.authority, kind: 'gate' })
          : () => publishP6Generation({
              authority: fixture.authority,
              kind: 'gate',
              files: { 'gate.json': Buffer.from('new') }
            });
      await assert.rejects(invoke(), publicCode('P6_AUTHORITY_INVALID'));
      assert.ok((await fs.readFile(foreignPath)).equals(bytes));
      assert.equal(identityEqual(identity(await fs.lstat(foreignPath)), before), true);
    });
  }
});

test('recovery preserves foreign owned-entry retirement contents across every public operation', async t => {
  for (const contents of ['same-byte', 'malformed']) {
    for (const operation of ['admit', 'read', 'publish']) await t.test(`${contents}:${operation}`, async t => {
      const fixture = await createStorageFixture(t);
      await publishP6Generation({
        authority: fixture.authority,
        kind: 'gate',
        files: { 'gate.json': Buffer.from('owned') }
      });
      const kindDir = path.join(fixture.p6Dir, 'gate');
      const retirement = path.join(kindDir, '.p5-retirement-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      await fs.mkdir(retirement, { mode: 0o700 });
      const foreignPath = path.join(retirement, 'owned-entry');
      const bytes = contents === 'same-byte'
        ? await fs.readFile(path.join(kindDir, 'current'))
        : Buffer.from('foreign malformed retirement');
      await fs.writeFile(foreignPath, bytes, { mode: 0o400 });
      const directoryBefore = identity(await fs.lstat(retirement));
      const fileBefore = identity(await fs.lstat(foreignPath));
      const invoke = operation === 'admit'
        ? () => admitP6Run({ p6Dir: fixture.p6Dir })
        : operation === 'read'
          ? () => readCurrentP6Generation({ authority: fixture.authority, kind: 'gate' })
          : () => publishP6Generation({
              authority: fixture.authority,
              kind: 'gate',
              files: { 'gate.json': Buffer.from('new') }
            });
      await assert.rejects(invoke(), publicCode('P6_AUTHORITY_INVALID'));
      assert.ok((await fs.readFile(foreignPath)).equals(bytes));
      assert.equal(identityEqual(identity(await fs.lstat(retirement)), directoryBefore), true);
      assert.equal(identityEqual(identity(await fs.lstat(foreignPath)), fileBefore), true);
    });
  }
});

test('recovery cleanup preserves same-byte foreign inode replacements at final boundaries', async t => {
  await t.test('current stage recovery', async t => {
    const fixture = await createStorageFixture(t);
    await fixture.authority.close();
    const crashed = await runCrashWorker({
      p6Dir: fixture.p6Dir,
      phase: 'before-current-move',
      kind: 'gate',
      files: { 'gate.json': Buffer.from('first').toString('base64') }
    });
    assert.equal(crashed.signal, 'SIGKILL');
    const kindDir = path.join(fixture.p6Dir, 'gate');
    const stageName = (await fs.readdir(kindDir))
      .find(name => name.startsWith('.p6-current-'));
    assert.ok(stageName);
    const stagePath = path.join(kindDir, stageName);
    const bytes = await fs.readFile(stagePath);
    await fs.rename(stagePath, path.join(fixture.root, 'parked-owned-stage'));
    await fs.writeFile(stagePath, bytes, { mode: 0o400 });
    const replacementIdentity = identity(await fs.lstat(stagePath));
    await assert.rejects(
      admitP6Run({ p6Dir: fixture.p6Dir }),
      publicCode('P6_AUTHORITY_INVALID')
    );
    assert.ok((await fs.readFile(stagePath)).equals(bytes));
    assert.equal(identityEqual(identity(await fs.lstat(stagePath)), replacementIdentity), true);
  });

  await t.test('pointer backup retirement', async t => {
    const fixture = await createStorageFixture(t);
    await publishP6Generation({
      authority: fixture.authority,
      kind: 'gate',
      files: { 'gate.json': Buffer.from('old') }
    });
    await fixture.authority.close();
    const crashed = await runCrashWorker({
      p6Dir: fixture.p6Dir,
      phase: 'before-current-move',
      kind: 'gate',
      files: { 'gate.json': Buffer.from('new').toString('base64') }
    });
    assert.equal(crashed.signal, 'SIGKILL');
    let replacementPath;
    let replacementIdentity;
    const hostile = fsWith({
      async retireEntry(parentHandle, basename, expectedIdentity, next) {
        if (!basename.startsWith('.p6-pointer-backup-')) return next();
        const target = `/proc/self/fd/${parentHandle.fd}/${basename}`;
        const bytes = await fs.readFile(target);
        await fs.rename(target, path.join(fixture.root, 'parked-owned-backup'));
        await fs.writeFile(target, bytes, { mode: 0o400 });
        replacementPath = path.join(fixture.p6Dir, 'gate', basename);
        replacementIdentity = identity(await fs.lstat(target));
        return next();
      }
    });
    await assert.rejects(
      admitP6Run({ p6Dir: fixture.p6Dir, fsImpl: hostile }),
      publicCode('P6_AUTHORITY_INVALID')
    );
    assert.equal(identityEqual(identity(await fs.lstat(replacementPath)), replacementIdentity), true);
  });

  await t.test('retired owned-entry removal', async t => {
    const fixture = await createStorageFixture(t);
    await publishP6Generation({
      authority: fixture.authority,
      kind: 'gate',
      files: { 'gate.json': Buffer.from('old') }
    });
    await fixture.authority.close();
    const crashed = await runCrashWorker({
      p6Dir: fixture.p6Dir,
      phase: 'before-retired-file-remove',
      kind: 'gate',
      files: { 'gate.json': Buffer.from('new').toString('base64') }
    });
    assert.equal(crashed.signal, 'SIGKILL');
    const kindDir = path.join(fixture.p6Dir, 'gate');
    const retirementName = (await fs.readdir(kindDir))
      .find(name => name.startsWith('.p5-retirement-'));
    assert.ok(retirementName);
    const replacementPath = path.join(kindDir, retirementName, 'owned-entry');
    let replacementIdentity;
    const hostile = fsWith({
      async removeBound(parentHandle, basename, expectedIdentity, expectedKind, next) {
        if (basename !== 'owned-entry') return next();
        const target = `/proc/self/fd/${parentHandle.fd}/${basename}`;
        const bytes = await fs.readFile(target);
        await fs.rename(target, path.join(fixture.root, 'parked-owned-entry'));
        await fs.writeFile(target, bytes, { mode: 0o400 });
        replacementIdentity = identity(await fs.lstat(target));
        return next();
      }
    });
    await assert.rejects(
      admitP6Run({ p6Dir: fixture.p6Dir, fsImpl: hostile }),
      publicCode('P6_AUTHORITY_INVALID')
    );
    assert.equal(identityEqual(identity(await fs.lstat(replacementPath)), replacementIdentity), true);
  });

  await t.test('malformed retired owned-entry replacement', async t => {
    const fixture = await createStorageFixture(t);
    await publishP6Generation({
      authority: fixture.authority,
      kind: 'gate',
      files: { 'gate.json': Buffer.from('old') }
    });
    await fixture.authority.close();
    const crashed = await runCrashWorker({
      p6Dir: fixture.p6Dir,
      phase: 'before-retired-file-remove',
      kind: 'gate',
      files: { 'gate.json': Buffer.from('new').toString('base64') }
    });
    assert.equal(crashed.signal, 'SIGKILL');
    const kindDir = path.join(fixture.p6Dir, 'gate');
    const retirementName = (await fs.readdir(kindDir))
      .find(name => name.startsWith('.p5-retirement-'));
    assert.ok(retirementName);
    const replacementPath = path.join(kindDir, retirementName, 'owned-entry');
    await fs.rename(replacementPath, path.join(fixture.root, 'parked-owned-entry'));
    const replacementBytes = Buffer.from('foreign malformed retirement entry');
    await fs.writeFile(replacementPath, replacementBytes, { mode: 0o400 });
    const replacementIdentity = identity(await fs.lstat(replacementPath));
    await assert.rejects(
      admitP6Run({ p6Dir: fixture.p6Dir }),
      publicCode('P6_AUTHORITY_INVALID')
    );
    assert.ok((await fs.readFile(replacementPath)).equals(replacementBytes));
    assert.equal(identityEqual(identity(await fs.lstat(replacementPath)), replacementIdentity), true);
  });
});

test('absolute path admission rejects symlinked intermediates and detects replaced ancestry', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-ancestry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const real = path.join(root, 'real');
  await fs.mkdir(path.join(real, 'run'), { recursive: true });
  await fs.symlink('real', path.join(root, 'alias'));
  await assert.rejects(
    createP6Run({ runDir: path.join(root, 'alias', 'run') }),
    publicCode('P6_AUTHORITY_INVALID')
  );

  const ancestor = path.join(root, 'ancestor');
  const runDir = path.join(ancestor, 'run');
  await fs.mkdir(runDir, { recursive: true });
  const created = await createP6Run({ runDir });
  t.after(() => created.authority.close());
  await fs.rename(ancestor, path.join(root, 'parked-ancestor'));
  await fs.mkdir(path.join(runDir, 'playbook-p6'), { recursive: true });
  await fs.writeFile(path.join(runDir, 'playbook-p6', 'foreign.txt'), 'foreign');
  await assert.rejects(
    publishP6Generation({ authority: created.authority, kind: 'gate', files: { 'gate.json': Buffer.from('{}') } }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  assert.equal(await fs.readFile(path.join(runDir, 'playbook-p6', 'foreign.txt'), 'utf8'), 'foreign');
});

test('current reads and admission validate every immutable historical generation', async t => {
  const fixture = await createStorageFixture(t);
  await publishP6Generation({ authority: fixture.authority, kind: 'gate', files: { 'gate.json': Buffer.from('old') } });
  await publishP6Generation({ authority: fixture.authority, kind: 'gate', files: { 'gate.json': Buffer.from('current') } });
  const historical = path.join(fixture.p6Dir, 'gate', 'generations', 'generation-000001');
  await fs.writeFile(path.join(historical, 'foreign.txt'), 'foreign');
  await assert.rejects(
    readCurrentP6Generation({ authority: fixture.authority, kind: 'gate' }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  await assert.rejects(admitP6Run({ p6Dir: fixture.p6Dir }), publicCode('P6_AUTHORITY_INVALID'));
  assert.equal(await fs.readFile(path.join(historical, 'foreign.txt'), 'utf8'), 'foreign');
});

test('admission rejects an approved-named directory that lacks its P6 ownership marker', async t => {
  const fixture = await createStorageFixture(t);
  await fs.mkdir(path.join(fixture.p6Dir, 'gate'));
  await fs.writeFile(path.join(fixture.p6Dir, 'gate', 'foreign.txt'), 'foreign');
  await assert.rejects(admitP6Run({ p6Dir: fixture.p6Dir }), publicCode('P6_AUTHORITY_INVALID'));
  assert.equal(await fs.readFile(path.join(fixture.p6Dir, 'gate', 'foreign.txt'), 'utf8'), 'foreign');
});

test('read rejects symlink, hardlink, non-regular, and unknown-file substitution without deleting it', async t => {
  for (const defect of ['symlink', 'hardlink', 'directory', 'unknown']) await t.test(defect, async t => {
    const fixture = await createStorageFixture(t);
    await publishP6Generation({ authority: fixture.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('{}') } });
    const generation = path.join(fixture.p6Dir, 'cohort', 'generations', 'generation-000001');
    const target = path.join(generation, 'cohort.json');
    if (defect === 'symlink') {
      await fs.rename(target, `${target}.saved`);
      await fs.symlink('cohort.json.saved', target);
    } else if (defect === 'hardlink') {
      await fs.link(target, path.join(fixture.root, 'alias.json'));
    } else if (defect === 'directory') {
      await fs.rename(target, `${target}.saved`);
      await fs.mkdir(target);
    } else {
      await fs.writeFile(path.join(generation, 'foreign.txt'), 'foreign');
    }
    await assert.rejects(
      readCurrentP6Generation({ authority: fixture.authority, kind: 'cohort' }),
      publicCode('P6_AUTHORITY_INVALID')
    );
    if (defect === 'unknown') assert.equal(await fs.readFile(path.join(generation, 'foreign.txt'), 'utf8'), 'foreign');
  });
});

test('ancestor replacement and closed authorities fail stale without touching the replacement', async t => {
  const fixture = await createStorageFixture(t);
  const parkedParent = path.join(fixture.root, 'parked-run');
  await fs.mkdir(parkedParent);
  const parked = path.join(parkedParent, 'playbook-p6');
  await fs.rename(fixture.p6Dir, parked);
  await fs.mkdir(fixture.p6Dir);
  await fs.writeFile(path.join(fixture.p6Dir, 'foreign.txt'), 'foreign');
  await assert.rejects(
    publishP6Generation({ authority: fixture.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('{}') } }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  assert.equal(await fs.readFile(path.join(fixture.p6Dir, 'foreign.txt'), 'utf8'), 'foreign');

  const admitted = await admitP6Run({ p6Dir: parked });
  await admitted.close();
  await assert.rejects(
    readCurrentP6Generation({ authority: admitted, kind: 'cohort' }),
    publicCode('P6_AUTHORITY_INVALID')
  );
});

test('a crash before generation publication preserves the prior current pointer', async t => {
  const fixture = await createStorageFixture(t);
  await publishP6Generation({ authority: fixture.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('old') } });
  const crashing = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
      if (sourceName.startsWith('.p6-stage-') && destinationName === 'generation-000002') {
        throw new Error(`PRIVATE_CRASH ${fixture.root}`);
      }
      return next(sourceHandle, sourceName, destinationHandle, destinationName);
    }
  });
  await assert.rejects(
    publishP6Generation({ authority: fixture.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('new') }, fsImpl: crashing }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  const current = await readCurrentP6Generation({ authority: fixture.authority, kind: 'cohort' });
  assert.equal(current.generation, 'generation-000001');
  assert.ok(current.files['cohort.json'].equals(Buffer.from('old')));
  assert.equal((await fs.readdir(path.join(fixture.p6Dir, 'cohort', 'generations'))).includes('generation-000002'), false);
});

test('post-effect generation and current-pointer move faults roll back the observed inode', async t => {
  for (const fault of ['generation-move', 'current-move']) await t.test(fault, async t => {
    const fixture = await createStorageFixture(t);
    await publishP6Generation({ authority: fixture.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('old') } });
    const afterEffect = fsWith({
      async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName, next) {
        const shouldFault = fault === 'generation-move'
          ? sourceName.startsWith('.p6-stage-') && destinationName === 'generation-000002'
          : sourceName.startsWith('.p6-current-') && destinationName === 'current';
        await next(sourceHandle, sourceName, destinationHandle, destinationName);
        if (shouldFault) throw new Error(`PRIVATE_POST_EFFECT_${fault}`);
      }
    });
    await assert.rejects(
      publishP6Generation({ authority: fixture.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('new') }, fsImpl: afterEffect }),
      publicCode('P6_AUTHORITY_INVALID')
    );
    const current = await readCurrentP6Generation({ authority: fixture.authority, kind: 'cohort' });
    assert.equal(current.generation, 'generation-000001');
    assert.ok(current.files['cohort.json'].equals(Buffer.from('old')));
    assert.deepEqual((await fs.readdir(path.join(fixture.p6Dir, 'cohort', 'generations'))).sort(), [
      '.p6-owned.json', 'generation-000001'
    ]);
  });
});

test('competing publishers use no-replace generation admission and exactly one wins', async t => {
  const fixture = await createStorageFixture(t);
  await publishP6Generation({ authority: fixture.authority, kind: 'observations', files: { 'observations.json': Buffer.from('old') } });
  const secondAuthority = await admitP6Run({ p6Dir: fixture.p6Dir });
  t.after(() => secondAuthority.close());
  const settled = await Promise.allSettled([
    publishP6Generation({ authority: fixture.authority, kind: 'observations', files: { 'observations.json': Buffer.from('left') } }),
    publishP6Generation({ authority: secondAuthority, kind: 'observations', files: { 'observations.json': Buffer.from('right') } })
  ]);
  assert.equal(settled.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(row => row.status === 'rejected').length, 1);
  assert.equal(settled.find(row => row.status === 'rejected').reason.code, 'P6_AUTHORITY_INVALID');
  const current = await readCurrentP6Generation({ authority: fixture.authority, kind: 'observations' });
  assert.equal(current.generation, 'generation-000002');
  assert.ok(['left', 'right'].includes(current.files['observations.json'].toString('utf8')));
});

test('cleanup removes only the exact marked stage and preserves an unmarked inode substituted at the cleanup boundary', async t => {
  const fixture = await createStorageFixture(t);
  let substitutedPath;
  const hostile = fsWith({
    async renameNoReplaceBetween(sourceHandle, sourceName, destinationHandle, destinationName) {
      if (sourceName.startsWith('.p6-stage-') && destinationName === 'generation-000001') {
        const source = `/proc/self/fd/${sourceHandle.fd}/${sourceName}`;
        await fs.rename(source, `${source}.parked`);
        await fs.mkdir(source);
        await fs.writeFile(path.join(source, 'foreign.txt'), 'foreign');
        substitutedPath = path.join(fixture.p6Dir, 'gate', 'generations', sourceName);
        throw new Error('PRIVATE_SUBSTITUTION');
      }
      throw new Error('unexpected move');
    }
  });
  await assert.rejects(
    publishP6Generation({ authority: fixture.authority, kind: 'gate', files: { 'gate.json': Buffer.from('{}') }, fsImpl: hostile }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  assert.equal(await fs.readFile(path.join(substitutedPath, 'foreign.txt'), 'utf8'), 'foreign');
});

test('readP6InputAuthority snapshots exact regular single-link bytes and redacts paths', async t => {
  const fixture = await createStorageFixture(t);
  const inputPath = path.join(fixture.runDir, 'fixed-input.json');
  await fs.writeFile(inputPath, '{"fixed":true}');
  const snapshot = await readP6InputAuthority({ authority: fixture.authority, relativePath: 'fixed-input.json' });
  assert.ok(snapshot.bytes.equals(Buffer.from('{"fixed":true}')));
  assert.equal(snapshot.sha256, sha256(snapshot.bytes));
  assert.equal(snapshot.stat.is_regular_file, true);
  assert.equal(snapshot.stat.is_symlink, false);
  assert.equal(Object.hasOwn(snapshot, 'path'), false);
  assert.equal(JSON.stringify(snapshot).includes(fixture.root), false);

  await fs.link(inputPath, path.join(fixture.runDir, 'fixed-input-alias.json'));
  await assert.rejects(
    readP6InputAuthority({ authority: fixture.authority, relativePath: 'fixed-input.json' }),
    publicCode('P6_AUTHORITY_INVALID')
  );
  await assert.rejects(
    readP6InputAuthority({ authority: fixture.authority, relativePath: '../escape.json' }),
    publicCode('P6_AUTHORITY_INVALID')
  );
});

test('blind-comparison private files are owned but excluded from the public manifest and read result', async t => {
  const fixture = await createStorageFixture(t);
  const cohort = await publishP6Generation({ authority: fixture.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('cohort') } });
  const session = await publishP6Generation({ authority: fixture.authority, kind: 'capture-session', files: { 'session.json': Buffer.from('session') } });
  const captures = await publishP6Generation({
    authority: fixture.authority, kind: 'minecraft-captures', files: { 'captures.json': Buffer.from('captures') },
    expectedCurrent: { kind: 'capture-session', generation: session.generation, manifest_sha256: session.manifest_sha256 }
  });
  await publishP6Generation({
    authority: fixture.authority,
    kind: 'blind-comparison',
    files: {
      'comparison.json': Buffer.from('{"public":true}'),
      'private/identity-map.json': Buffer.from('{"secret":true}'),
      'private/preference-drafts.json': Buffer.from('[]')
    },
    expectedCurrent: [
      { kind: 'cohort', generation: cohort.generation, manifest_sha256: cohort.manifest_sha256 },
      { kind: 'minecraft-captures', generation: captures.generation, manifest_sha256: captures.manifest_sha256 },
      { kind: 'blind-comparison', generation: null, manifest_sha256: null }
    ]
  });
  const current = await readCurrentP6Generation({ authority: fixture.authority, kind: 'blind-comparison' });
  assert.deepEqual(current.manifest.managed_paths, ['comparison.json']);
  assert.deepEqual(Object.keys(current.files), ['comparison.json']);
  assert.equal(JSON.stringify(current).includes('identity-map'), false);
  assert.equal(JSON.stringify(current).includes('preference-drafts'), false);
  assert.equal(current.private_file_count, 2);
});

test('admitP6CohortInputs consumes only current P5 snapshots and exact baseline authority bytes', async t => {
  const storage = await createStorageFixture(t);
  const source = await createP6CohortFixture(t);
  const inputs = await materializeCohortInputs(t, source);

  const cohort = await admitP6CohortInputs({
    p6Authority: storage.authority,
    playbookRunDir: inputs.playbookRunDir,
    baselineRunDir: inputs.baselineRunDir,
    fixedRequestPath: inputs.fixedRequestPath
  });
  assert.deepEqual(cohort.solutions.map(row => row.solution_id), [
    'playbook-candidate-01', 'playbook-candidate-02',
    'playbook-candidate-03', 'baseline-current'
  ]);
  assert.deepEqual(cohort.render_solutions.map(row => row.solution_id), [
    'playbook-candidate-01', 'playbook-candidate-02',
    'playbook-candidate-03', 'baseline-current'
  ]);
  assert.equal(Object.isFrozen(cohort.render_solutions), true);
  assert.equal(Object.isFrozen(cohort.render_solutions[0].blueprint), true);
  assert.equal(cohort.render_solutions[0].blueprint_sha256, cohort.solutions[0].blueprint_sha256);
  assert.equal(cohort.render_solutions[0].operation_list_sha256, cohort.solutions[0].operation_list_sha256);
  assert.deepEqual(cohort.render_solutions[0].operations, cohort.render_solutions[0].blueprint.operations);
  assert.equal(JSON.stringify(cohort).includes(inputs.root), false);

  const manifestPath = path.join(inputs.baselineRunDir, 'p6-baseline-authority.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.files.build_function.sha256 = '0'.repeat(64);
  await fs.writeFile(manifestPath, stableJson(manifest));
  await assert.rejects(admitP6CohortInputs({
    p6Authority: storage.authority,
    playbookRunDir: inputs.playbookRunDir,
    baselineRunDir: inputs.baselineRunDir,
    fixedRequestPath: inputs.fixedRequestPath
  }), publicCode('P6_AUTHORITY_INVALID'));
});

test('the live admitted P5 boundary returns one hash-bound complete selection snapshot', async t => {
  const source = await createP6CohortFixture(t);
  const inputs = await materializeCohortInputs(t, source);
  const execute = await admitExecuteRun({ runDir: inputs.playbookRunDir });
  t.after(() => execute.close());
  assert.equal(typeof executeStorage.readCurrentExecuteSelectionSnapshot, 'function');
  const snapshot = await executeStorage.readCurrentExecuteSelectionSnapshot({ authority: execute });
  assert.deepEqual(Object.keys(snapshot.files), ['manifest.json', 'selection.json', 'selection-report.md']);
  assert.equal(snapshot.manifest_sha256, sha256(snapshot.files['manifest.json']));
  const selection = JSON.parse(snapshot.files['selection.json']);
  assert.deepEqual(selection.ranker_result.ranking.map(row => row.rank), [1, 2, 3]);
  assert.equal(JSON.stringify(snapshot).includes(inputs.root), false);

  const pointer = JSON.parse(await fs.readFile(
    path.join(inputs.playbookRunDir, 'playbook-execute', 'manifest.json'), 'utf8'
  ));
  const reportPath = path.join(
    inputs.playbookRunDir, 'playbook-execute', pointer.generation, 'selection-report.md'
  );
  await fs.chmod(reportPath, 0o600);
  await fs.writeFile(reportPath, '# substituted selection report\n');
  await assert.rejects(
    executeStorage.readCurrentExecuteSelectionSnapshot({ authority: execute }),
    { code: 'P5_AUTHORITY_INVALID' }
  );
});

test('baseline admission rejects ambient guessing, unsafe paths, symlink/hardlink bodies, and noncanonical authority', async t => {
  for (const defect of ['missing-authority', 'unsafe-path', 'symlink', 'hardlink', 'noncanonical']) await t.test(defect, async t => {
    const storage = await createStorageFixture(t);
    const source = await createP6CohortFixture(t);
    const inputs = await materializeCohortInputs(t, source);
    const authorityPath = path.join(inputs.baselineRunDir, 'p6-baseline-authority.json');
    const authority = JSON.parse(await fs.readFile(authorityPath, 'utf8'));
    if (defect === 'missing-authority') await fs.rename(authorityPath, path.join(inputs.baselineRunDir, 'renamed-authority.json'));
    if (defect === 'unsafe-path') {
      authority.files.blueprint.relative_path = '../blueprint.json';
      await fs.writeFile(authorityPath, stableJson(authority));
    }
    if (defect === 'symlink') {
      const target = path.join(inputs.baselineRunDir, authority.files.build_function.relative_path);
      await fs.rename(target, `${target}.saved`);
      await fs.symlink(path.basename(`${target}.saved`), target);
    }
    if (defect === 'hardlink') {
      const target = path.join(inputs.baselineRunDir, authority.files.build_function.relative_path);
      await fs.link(target, `${target}.alias`);
    }
    if (defect === 'noncanonical') await fs.writeFile(authorityPath, JSON.stringify(authority));
    await assert.rejects(admitP6CohortInputs({
      p6Authority: storage.authority,
      playbookRunDir: inputs.playbookRunDir,
      baselineRunDir: inputs.baselineRunDir,
      fixedRequestPath: inputs.fixedRequestPath
    }), publicCode('P6_AUTHORITY_INVALID'));
  });
});

async function createStorageFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-storage-'));
  const runDir = path.join(root, 'run');
  await fs.mkdir(runDir);
  const created = await createP6Run({ runDir });
  t.after(async () => {
    await created.authority.close();
    await fs.chmod(root, 0o700).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  });
  return {
    root,
    runDir,
    p6Dir: path.join(runDir, 'playbook-p6'),
    publicP6Dir: created.p6Dir,
    created,
    authority: created.authority
  };
}

async function runCrashWorker(job) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-crash-job-'));
  const jobPath = path.join(root, 'job.json');
  await fs.writeFile(jobPath, JSON.stringify(job));
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        path.join(import.meta.dirname, 'fixtures', 'playbookP6StorageCrashWorker.js'),
        jobPath
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal, stderr }));
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function materializeCohortInputs(t, source) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-admission-'));
  const playbookRunDir = path.join(root, 'playbook-run');
  const baselineRunDir = path.join(root, 'baseline-run');
  const fixedRequestPath = path.join(root, 'fixed-request.json');
  await fs.mkdir(playbookRunDir);
  await fs.mkdir(baselineRunDir);
  await fs.writeFile(fixedRequestPath, stableJson(source.fixedRequest));
  const execute = await admitExecuteRun({ runDir: playbookRunDir });
  try {
    for (const slot of source.playbookAuthority.slots) {
      const currentChainName = Object.keys(slot.p5_files).find(name => name.startsWith('chains/chain-'));
      const files = Object.fromEntries(Object.entries(slot.p5_files)
        .filter(([name]) => name !== 'current-chain.json' && !name.startsWith('chains/'))
        .map(([name, snapshot]) => [name, Buffer.from(snapshot.bytes)]));
      await installCandidateSnapshot({
        authority: execute,
        candidateId: slot.candidate_id,
        files,
        currentChain: Buffer.from(slot.p5_files[currentChainName].bytes),
        expectedPreviousChainSha256: null
      });
    }
    const candidates = source.playbookAuthority.slots.map(slot => {
      const chainName = Object.keys(slot.p5_files).find(name => name.startsWith('chains/chain-'));
      const chain = JSON.parse(slot.p5_files[chainName].bytes);
      return {
        candidate_id: slot.candidate_id,
        seed: 424242,
        current_chain_sha256: sha256(slot.p5_files[chainName].bytes),
        hard_qa_sha256: chain.hard_qa_sha256,
        p4_review_sha256: chain.p4_review_sha256,
        eligibility: chain.eligibility,
        repair_attempt_count: chain.chain_revision - 1
      };
    });
    const selection = Buffer.from(stableJson({
      schema_version: 1,
      mode: 'execute',
      candidate_count: 3,
      candidates,
      selected_candidate_id: 'candidate-01',
      selected_chain_sha256: candidates[0].current_chain_sha256,
      repair_attempt_count: candidates.reduce((sum, row) => sum + row.repair_attempt_count, 0),
      ranker_result: {
        ranking: source.playbookAuthority.selection_rank.map(row => ({
          candidate_id: row.candidate_id,
          rank: row.rank
        }))
      }
    }));
    const report = Buffer.from('# Selection\n');
    const manifest = Buffer.from(stableJson({
      schema_version: 1,
      managed_paths: ['manifest.json', 'selection.json', 'selection-report.md'],
      artifact_hashes: {
        'selection.json': sha256(selection),
        'selection-report.md': sha256(report)
      }
    }));
    await installExecuteSelection({ authority: execute, files: {
      'manifest.json': manifest,
      'selection.json': selection,
      'selection-report.md': report
    } });
  } finally {
    await execute.close();
  }

  const baseline = source.baselineAuthority;
  const bindings = {};
  for (const [field, name] of Object.entries({
    blueprint: 'blueprint.json',
    operations: 'operation-list.json',
    build_function: 'build.mcfunction',
    hard_qa: 'hard-qa.json',
    review: 'review.json'
  })) {
    const bytes = baseline.solution[field].bytes;
    await fs.writeFile(path.join(baselineRunDir, name), bytes);
    bindings[field] = { relative_path: name, sha256: sha256(bytes) };
  }
  const baselineAuthority = {
    schema_version: 1,
    kind: 'p6-baseline-authority',
    run_id: baseline.run_id,
    generator_commit: baseline.generator_commit,
    minecraft_version: baseline.minecraft_version,
    options: baseline.options,
    provenance: baseline.provenance,
    files: bindings
  };
  await fs.writeFile(path.join(baselineRunDir, 'p6-baseline-authority.json'), stableJson(baselineAuthority));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, playbookRunDir, baselineRunDir, fixedRequestPath };
}

function fsWith(overrides) {
  return new Proxy(overrides, {
    get(target, property) {
      if (property in target) return target[property];
      const value = fs[property];
      return typeof value === 'function' ? value.bind(fs) : value;
    }
  });
}

function publicCode(code) {
  return error => {
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(String(error).includes('/tmp/'), false);
    return true;
  };
}

function identity(stat) { return { dev: stat.dev, ino: stat.ino }; }
function identityEqual(left, right) { return left.dev === right.dev && left.ino === right.ino; }
