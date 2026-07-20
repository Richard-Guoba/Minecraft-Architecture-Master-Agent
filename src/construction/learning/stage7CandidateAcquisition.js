import { createHash } from 'node:crypto';
import {
  CANDIDATE_NBT_LIMITS,
  CandidateReadinessError,
  assertCandidateId,
  readQuarantinedNbt
} from './stage7CandidateBoundary.js';
import {
  PilotFilesystemError,
  writePilotBytesIdempotent
} from './stage7PilotFilesystem.js';

export const CANDIDATE_DOWNLOAD_LIMIT = CANDIDATE_NBT_LIMITS.maxRawBytes;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_CONTENT_TYPES = new Set([
  'application/octet-stream',
  'application/x-minecraft-nbt',
  'binary/octet-stream'
]);
const FETCH_OPTIONS = Object.freeze({
  method: 'GET',
  redirect: 'manual',
  credentials: 'omit',
  cache: 'no-store',
  referrerPolicy: 'no-referrer',
  headers: Object.freeze({
    Accept: 'application/octet-stream, application/x-minecraft-nbt'
  })
});

export async function acquireApprovedCandidate({
  root,
  candidate,
  fetchImpl = globalThis.fetch
}, deps = {}) {
  const policy = validateCandidateTransport(candidate);
  if (typeof fetchImpl !== 'function') fail('HTTPS_FETCH_UNAVAILABLE', policy.candidateId);
  const { response, finalUrl } = await fetchApproved(policy, fetchImpl);
  await validateResponseMetadata(response, policy.candidateId, finalUrl);
  const bytes = await readBoundedBody(response, policy.candidateId, finalUrl);
  validateNbtMagic(bytes, policy.candidateId);

  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  const basename = `${contentSha256}.nbt`;
  const relativePath = `quarantine/${policy.candidateId}/${basename}`;
  try {
    await writePilotBytesIdempotent(root, relativePath, bytes, contentSha256, deps);
  } catch (error) {
    if (error instanceof PilotFilesystemError) {
      fail(error.code, policy.candidateId, { basename });
    }
    fail('HTTPS_QUARANTINE_WRITE_FAILED', policy.candidateId, {
      basename,
      error_code: safeErrorCode(error)
    });
  }

  let verified;
  try {
    verified = await readQuarantinedNbt({
      root,
      candidateId: policy.candidateId,
      relativePath
    }, deps);
  } catch (error) {
    if (error instanceof CandidateReadinessError) throw error;
    fail('HTTPS_QUARANTINE_READ_FAILED', policy.candidateId, {
      basename,
      error_code: safeErrorCode(error)
    });
  }
  return Object.freeze({
    candidate_id: verified.candidate_id,
    basename: verified.basename,
    content_sha256: verified.content_sha256,
    raw_byte_count: verified.raw_byte_count,
    relative_path: relativePath,
    final_url: finalUrl
  });
}

function validateCandidateTransport(candidate) {
  const candidateId = assertCandidateId(candidate?.candidate_id);
  if (typeof candidate.canonical_file_url !== 'string'
    || !Array.isArray(candidate.approved_redirect_urls)
    || new Set(candidate.approved_redirect_urls).size !== candidate.approved_redirect_urls.length) {
    fail('HTTPS_CANDIDATE_POLICY_INVALID', candidateId);
  }
  const ordered = [candidate.canonical_file_url, ...candidate.approved_redirect_urls];
  for (const value of ordered) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      fail('HTTPS_CANDIDATE_POLICY_INVALID', candidateId);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      fail('HTTPS_CANDIDATE_POLICY_INVALID', candidateId);
    }
  }
  return Object.freeze({
    candidateId,
    initialUrl: candidate.canonical_file_url,
    allowedUrls: new Set(ordered)
  });
}

async function fetchApproved(policy, fetchImpl) {
  let currentUrl = policy.initialUrl;
  let redirectCount = 0;
  const visited = new Set([currentUrl]);
  while (true) {
    let response;
    try {
      response = await fetchImpl(currentUrl, FETCH_OPTIONS);
    } catch {
      fail('HTTPS_FETCH_FAILED', policy.candidateId, { host: safeHost(currentUrl) });
    }
    if (!validResponseShape(response)) {
      fail('HTTPS_RESPONSE_INVALID', policy.candidateId, { host: safeHost(currentUrl) });
    }
    if (!REDIRECT_STATUSES.has(response.status)) {
      if (response.status !== 200) {
        await cancelQuietly(response.body);
        fail('HTTPS_STATUS_INVALID', policy.candidateId, {
          host: safeHost(currentUrl),
          status: response.status
        });
      }
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get('location');
    let target;
    try {
      target = new URL(location, currentUrl).href;
    } catch {
      await cancelQuietly(response.body);
      fail('HTTPS_REDIRECT_INVALID', policy.candidateId, { host: safeHost(currentUrl) });
    }
    await cancelQuietly(response.body);
    if (!location || !target.startsWith('https://') || !policy.allowedUrls.has(target)) {
      fail('HTTPS_REDIRECT_NOT_APPROVED', policy.candidateId, {
        host: safeHost(currentUrl),
        target_host: safeHost(target)
      });
    }
    if (visited.has(target)) {
      fail('HTTPS_REDIRECT_LOOP', policy.candidateId, { host: safeHost(target) });
    }
    if (redirectCount >= 3) {
      fail('HTTPS_REDIRECT_LIMIT', policy.candidateId, { host: safeHost(target), redirect_count: 4 });
    }
    redirectCount += 1;
    visited.add(target);
    currentUrl = target;
  }
}

async function validateResponseMetadata(response, candidateId, finalUrl) {
  const rawType = response.headers.get('content-type');
  const contentType = rawType?.split(';', 1)[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    fail('HTTPS_CONTENT_TYPE_INVALID', candidateId, { host: safeHost(finalUrl) });
  }
  const rawLength = response.headers.get('content-length');
  if (rawLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/u.test(rawLength)) {
      fail('HTTPS_CONTENT_LENGTH_INVALID', candidateId, { host: safeHost(finalUrl) });
    }
    const declared = Number(rawLength);
    if (!Number.isSafeInteger(declared)) {
      fail('HTTPS_CONTENT_LENGTH_INVALID', candidateId, { host: safeHost(finalUrl) });
    }
    if (declared > CANDIDATE_DOWNLOAD_LIMIT) {
      await cancelQuietly(response.body);
      fail('HTTPS_DECLARED_BYTES_LIMIT', candidateId, {
        host: safeHost(finalUrl),
        byte_count: declared,
        byte_limit: CANDIDATE_DOWNLOAD_LIMIT
      });
    }
  }
  if (response.body === null) {
    fail('HTTPS_BODY_MISSING', candidateId, { host: safeHost(finalUrl) });
  }
}

async function readBoundedBody(response, candidateId, finalUrl) {
  const reader = response.body.getReader();
  const chunks = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await cancelReaderQuietly(reader);
        fail('HTTPS_STREAM_INVALID', candidateId, { host: safeHost(finalUrl) });
      }
      byteCount += value.byteLength;
      if (byteCount > CANDIDATE_DOWNLOAD_LIMIT) {
        await cancelReaderQuietly(reader);
        fail('HTTPS_OBSERVED_BYTES_LIMIT', candidateId, {
          host: safeHost(finalUrl),
          byte_count: byteCount,
          byte_limit: CANDIDATE_DOWNLOAD_LIMIT
        });
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof CandidateReadinessError) throw error;
    fail('HTTPS_STREAM_FAILED', candidateId, {
      host: safeHost(finalUrl),
      byte_count: byteCount
    });
  } finally {
    reader.releaseLock();
  }
  if (byteCount === 0) fail('HTTPS_BODY_EMPTY', candidateId, { host: safeHost(finalUrl) });
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) !== byteCount) {
    fail('HTTPS_CONTENT_LENGTH_MISMATCH', candidateId, {
      host: safeHost(finalUrl),
      declared_byte_count: Number(declared),
      observed_byte_count: byteCount
    });
  }
  return Buffer.concat(chunks, byteCount);
}

function validateNbtMagic(bytes, candidateId) {
  const prefix = bytes.subarray(0, 64).toString('ascii').trimStart().toLowerCase();
  if (prefix.startsWith('<html') || prefix.startsWith('<!doctype')) {
    fail('HTTPS_HTML_BODY', candidateId, { byte_count: bytes.length });
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(bytes[2])) {
    fail('HTTPS_ARCHIVE_BODY', candidateId, { byte_count: bytes.length });
  }
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const zlib = bytes[0] === 0x78;
  const compound = bytes[0] === 0x0a;
  if (!gzip && !zlib && !compound) {
    fail('HTTPS_NBT_MAGIC_INVALID', candidateId, { byte_count: bytes.length });
  }
}

function validResponseShape(response) {
  return response && Number.isInteger(response.status)
    && response.headers && typeof response.headers.get === 'function';
}

async function cancelQuietly(body) {
  try {
    await body?.cancel();
  } catch {
    // Cancellation is best-effort because the response is already being rejected.
  }
}

async function cancelReaderQuietly(reader) {
  try {
    await reader.cancel();
  } catch {
    // Cancellation is best-effort because the response is already being rejected.
  }
}

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid';
  }
}

function safeErrorCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_]+$/u.test(error.code)
    ? error.code
    : 'UNKNOWN';
}

function fail(code, candidateId, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'acquisition', candidateId, safeDetail);
}
