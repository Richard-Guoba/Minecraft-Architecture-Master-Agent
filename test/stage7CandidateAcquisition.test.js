import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CandidateReadinessError } from '../src/construction/learning/stage7CandidateBoundary.js';
import {
  CANDIDATE_DOWNLOAD_LIMIT,
  acquireApprovedCandidate
} from '../src/construction/learning/stage7CandidateAcquisition.js';
import { ensurePilotLayout } from '../src/construction/learning/stage7PilotFilesystem.js';
import { selectPilotCandidate } from '../src/construction/learning/stage7PilotBatch.js';
import { structureNbt } from './fixtures/stage7CandidateReadinessFixtures.js';
import {
  pilotBatchFixture,
  pilotHttpResponse,
  resignPilotBatch
} from './fixtures/stage7PilotFixtures.js';

const ID = 'source-a:house-01';

function hasCode(code) {
  return (error) => error instanceof CandidateReadinessError && error.code === code;
}

async function context(t) {
  const root = await mkdtemp(join(tmpdir(), 'stage7-pilot-acquisition-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = { assertRoot: async () => root };
  await ensurePilotLayout(root, deps);
  return { root, deps };
}

function candidateWithRedirects(urls) {
  const document = pilotBatchFixture();
  document.batch.candidates[0].approved_redirect_urls = urls;
  return selectPilotCandidate(resignPilotBatch(document), ID);
}

function selectedCandidate() {
  return selectPilotCandidate(pilotBatchFixture(), ID);
}

function bytesFetch(bytes, options = {}) {
  return async () => pilotHttpResponse(options.chunks || [bytes], {
    headers: options.headers || { 'content-type': 'application/octet-stream' },
    streamError: options.streamError || null
  });
}

test('receives one exact approved NBT into content-addressed quarantine', async (t) => {
  const { root, deps } = await context(t);
  const candidate = selectedCandidate();
  const bytes = structureNbt();
  const calls = [];
  const receipt = await acquireApprovedCandidate({
    root,
    candidate,
    fetchImpl: async (...args) => {
      calls.push(args);
      return pilotHttpResponse([bytes.subarray(0, 7), bytes.subarray(7)], {
        headers: { 'content-type': 'application/x-minecraft-nbt; charset=binary' }
      });
    }
  }, deps);
  assert.equal(receipt.candidate_id, ID);
  assert.match(receipt.relative_path,
    /^quarantine\/source-a:house-01\/[a-f0-9]{64}\.nbt$/u);
  assert.equal(receipt.final_url, candidate.canonical_file_url);
  assert.equal(receipt.raw_byte_count, bytes.length);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal('bytes' in receipt, false);
  assert.deepEqual(await readdir(join(root, 'quarantine', receipt.candidate_id)),
    [`${receipt.content_sha256}.nbt`]);
  assert.deepEqual(await readFile(join(root, ...receipt.relative_path.split('/'))), bytes);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [candidate.canonical_file_url, {
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/octet-stream, application/x-minecraft-nbt' }
  }]);
});

test('accepts gzip, zlib, and uncompressed Compound magic without Content-Length', async (t) => {
  const { root, deps } = await context(t);
  for (const compression of ['gzip', 'zlib', 'none']) {
    const receipt = await acquireApprovedCandidate({
      root,
      candidate: selectedCandidate(),
      fetchImpl: bytesFetch(structureNbt({ compression }))
    }, deps);
    assert.equal(receipt.candidate_id, ID);
  }
  assert.equal((await readdir(join(root, 'quarantine', ID))).length, 3);
});

test('enforces declared and observed 16 MiB limits and cancels overflow streams', async (t) => {
  const declared = await context(t);
  await assert.rejects(acquireApprovedCandidate({
    root: declared.root,
    candidate: selectedCandidate(),
    fetchImpl: async () => pilotHttpResponse(null, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(CANDIDATE_DOWNLOAD_LIMIT + 1)
      }
    })
  }, declared.deps), hasCode('HTTPS_DECLARED_BYTES_LIMIT'));

  const observed = await context(t);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(CANDIDATE_DOWNLOAD_LIMIT + 1));
    },
    cancel() { cancelled = true; }
  });
  await assert.rejects(acquireApprovedCandidate({
    root: observed.root,
    candidate: selectedCandidate(),
    fetchImpl: async () => new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' }
    })
  }, observed.deps), hasCode('HTTPS_OBSERVED_BYTES_LIMIT'));
  assert.equal(cancelled, true);
});

test('rejects missing or empty bodies, content-type violations, HTML, and archives', async (t) => {
  const cases = [
    ['HTTPS_BODY_MISSING', async () => pilotHttpResponse(null)],
    ['HTTPS_BODY_EMPTY', bytesFetch(Buffer.alloc(0))],
    ['HTTPS_CONTENT_TYPE_INVALID', async () => pilotHttpResponse([structureNbt()], {
      headers: { 'content-type': 'text/plain' }
    })],
    ['HTTPS_HTML_BODY', bytesFetch(Buffer.from('<html>not nbt</html>'))],
    ['HTTPS_ARCHIVE_BODY', bytesFetch(Buffer.from([0x50, 0x4b, 0x03, 0x04]))],
    ['HTTPS_NBT_MAGIC_INVALID', bytesFetch(Buffer.from([0x01, 0x02, 0x03]))]
  ];
  for (const [code, fetchImpl] of cases) {
    const { root, deps } = await context(t);
    await assert.rejects(
      acquireApprovedCandidate({ root, candidate: selectedCandidate(), fetchImpl }, deps),
      hasCode(code)
    );
  }
});

test('follows each manual redirect status only to an exact approved URL', async (t) => {
  const { root, deps } = await context(t);
  const original = selectedCandidate().canonical_file_url;
  const target = new URL('mirror-house-01.nbt', original).href;
  const candidate = candidateWithRedirects([target]);
  for (const status of [301, 302, 303, 307, 308]) {
    const visited = [];
    const receipt = await acquireApprovedCandidate({
      root,
      candidate,
      fetchImpl: async (url) => {
        visited.push(url);
        return url === original
          ? pilotHttpResponse(null, { status, headers: { location: 'mirror-house-01.nbt' } })
          : pilotHttpResponse([structureNbt()]);
      }
    }, deps);
    assert.deepEqual(visited, [original, target]);
    assert.equal(receipt.final_url, target);
  }
});

test('rejects redirect loops, more than three hops, unapproved and non-HTTPS targets', async (t) => {
  const original = selectedCandidate().canonical_file_url;
  const target = new URL('mirror.nbt', original).href;
  const loop = candidateWithRedirects([target]);
  let current = await context(t);
  await assert.rejects(acquireApprovedCandidate({
    root: current.root,
    candidate: loop,
    fetchImpl: async (url) => pilotHttpResponse(null, {
      status: 302,
      headers: { location: url === original ? target : original }
    })
  }, current.deps), hasCode('HTTPS_REDIRECT_LOOP'));

  const chain = [1, 2, 3, 4].map((value) => `https://cdn.example.test/${value}.nbt`);
  const tooMany = candidateWithRedirects(chain);
  current = await context(t);
  await assert.rejects(acquireApprovedCandidate({
    root: current.root,
    candidate: tooMany,
    fetchImpl: async (url) => pilotHttpResponse(null, {
      status: 302,
      headers: { location: url === original ? chain[0] : chain[chain.indexOf(url) + 1] }
    })
  }, current.deps), hasCode('HTTPS_REDIRECT_LIMIT'));

  for (const location of ['https://other.example.test/file.nbt', 'http://raw.example.test/file.nbt']) {
    current = await context(t);
    await assert.rejects(acquireApprovedCandidate({
      root: current.root,
      candidate: selectedCandidate(),
      fetchImpl: async () => pilotHttpResponse(null, {
        status: 302,
        headers: { location }
      })
    }, current.deps), hasCode('HTTPS_REDIRECT_NOT_APPROVED'));
  }
});

test('rejects non-200 responses and transport or stream failures without response bodies', async (t) => {
  const cases = [
    ['HTTPS_STATUS_INVALID', async () => pilotHttpResponse([Buffer.from('private response')], {
      status: 404,
      headers: { 'content-type': 'text/plain' }
    })],
    ['HTTPS_FETCH_FAILED', async () => { throw new Error('secret transport detail'); }],
    ['HTTPS_STREAM_FAILED', bytesFetch(structureNbt(), {
      streamError: new Error('secret stream detail')
    })]
  ];
  for (const [code, fetchImpl] of cases) {
    const { root, deps } = await context(t);
    await assert.rejects(
      acquireApprovedCandidate({ root, candidate: selectedCandidate(), fetchImpl }, deps),
      (error) => hasCode(code)(error)
        && !error.message.includes('secret')
        && !JSON.stringify(error.safe_detail).includes('secret')
        && !JSON.stringify(error.safe_detail).includes('private response')
    );
  }
});

test('is byte-idempotent and refuses conflicting or symlinked quarantine state', async (t) => {
  const bytes = structureNbt();
  const first = await context(t);
  const input = { root: first.root, candidate: selectedCandidate(), fetchImpl: bytesFetch(bytes) };
  const left = await acquireApprovedCandidate(input, first.deps);
  const right = await acquireApprovedCandidate(input, first.deps);
  assert.deepEqual(left, right);

  const conflict = await context(t);
  const sha = createHash('sha256').update(bytes).digest('hex');
  await mkdir(join(conflict.root, 'quarantine', ID));
  await writeFile(join(conflict.root, 'quarantine', ID, `${sha}.nbt`), Buffer.from('changed'));
  await assert.rejects(acquireApprovedCandidate({
    root: conflict.root,
    candidate: selectedCandidate(),
    fetchImpl: bytesFetch(bytes)
  }, conflict.deps), hasCode('PILOT_FILE_CONFLICT'));

  const linked = await context(t);
  await symlink(join(linked.root, 'manifests'), join(linked.root, 'quarantine', ID));
  await assert.rejects(acquireApprovedCandidate({
    root: linked.root,
    candidate: selectedCandidate(),
    fetchImpl: bytesFetch(bytes)
  }, linked.deps), hasCode('PILOT_PATH_SYMLINK'));
});

test('rename failure leaves no owned temporary file', async (t) => {
  const { root, deps } = await context(t);
  await assert.rejects(acquireApprovedCandidate({
    root,
    candidate: selectedCandidate(),
    fetchImpl: bytesFetch(structureNbt())
  }, {
    ...deps,
    rename: async () => { throw Object.assign(new Error('rename failed'), { code: 'EIO' }); }
  }), hasCode('HTTPS_QUARANTINE_WRITE_FAILED'));
  const candidateDirectory = join(root, 'quarantine', ID);
  assert.equal((await readdir(candidateDirectory)).some((name) => name.includes('.tmp-')), false);
});
