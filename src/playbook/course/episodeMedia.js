import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { failPlaybookContract } from '../contracts/playbookContractError.js';
import { getPilotEpisodeIdentity } from './pilotEpisodeSet.js';
import {
  assertPrivatePlaybookStorage,
  resolvePrivatePlaybookPath
} from '../storage/privatePlaybookPath.js';

const USER_AGENT = 'Minecraft-Architecture-Playbook/0.2 evidence-pilot';

export async function resolveEpisodePlayback({ episode, fetchImpl }) {
  const approved = assertApprovedEpisode(episode);
  if (typeof fetchImpl !== 'function') {
    failPlaybookContract(
      'PLAYBOOK_MEDIA_FETCH_INVALID',
      'fetchImpl',
      'expected function'
    );
  }
  const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${approved.bvid}`;
  const view = await fetchJson(fetchImpl, viewUrl, approved.bvid);
  if (
    view.code !== 0
    || view.data?.bvid !== approved.bvid
    || view.data?.cid !== approved.cid
    || view.data?.duration !== approved.duration_seconds
  ) {
    failPlaybookContract(
      'PLAYBOOK_MEDIA_IDENTITY_DRIFT',
      'directView.data',
      `${view.data?.bvid}/${view.data?.cid}/${view.data?.duration}`
    );
  }
  const playParams = new URLSearchParams({
    bvid: approved.bvid,
    cid: String(approved.cid),
    qn: '16',
    fnval: '1',
    fnver: '0',
    fourk: '0'
  });
  const playUrl = `https://api.bilibili.com/x/player/playurl?${playParams}`;
  const play = await fetchJson(fetchImpl, playUrl, approved.bvid);
  const resource = play.data?.durl?.[0];
  let resourceUrl;
  try {
    resourceUrl = new URL(resource?.url);
  } catch {
    resourceUrl = null;
  }
  if (
    play.code !== 0
    || play.data?.quality !== 16
    || play.data?.format !== 'mp4'
    || !Array.isArray(play.data?.durl)
    || play.data.durl.length !== 1
    || resource?.order !== 1
    || !resourceUrl
    || resourceUrl.protocol !== 'https:'
    || !Number.isSafeInteger(resource.length)
    || Math.abs(resource.length - approved.duration_seconds * 1000) > 3000
    || !Number.isSafeInteger(resource.size)
    || resource.size < 1
  ) {
    failPlaybookContract(
      'PLAYBOOK_MEDIA_PLAYBACK_INVALID',
      'playUrl.data',
      'expected one HTTPS 360p MP4 resource matching the pilot episode'
    );
  }
  return Object.freeze({
    bvid: approved.bvid,
    cid: approved.cid,
    quality: play.data.quality,
    format: play.data.format,
    declared_duration_ms: resource.length,
    declared_size: resource.size,
    resource_url: resourceUrl.toString()
  });
}

export async function acquireEpisodeMedia({
  episode,
  projectRoot,
  fetchImpl = globalThis.fetch,
  replace = false,
  observedAt = new Date().toISOString()
}) {
  const approved = assertApprovedEpisode(episode);
  assertTimestamp(observedAt, 'observedAt');
  const mediaPath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/sources/${approved.bvid}/source-360p.mp4`,
    { projectRoot }
  );
  const indexPath = resolvePrivatePlaybookPath(
    `.local/architecture-playbook/sources/${approved.bvid}/media-index.json`,
    { projectRoot }
  );
  await assertPrivatePlaybookStorage(mediaPath, {
    projectRoot,
    createParent: true
  });
  await assertPrivatePlaybookStorage(indexPath, {
    projectRoot,
    createParent: false
  });

  const existing = await readVerifiedExisting({
    mediaPath,
    indexPath,
    episode: approved
  });
  if (existing) {
    return Object.freeze({
      status: 'unchanged',
      media_index: deepFreeze(existing)
    });
  }

  const playback = await resolveEpisodePlayback({
    episode: approved,
    fetchImpl
  });
  const response = await fetchImpl(playback.resource_url, {
    headers: {
      accept: '*/*',
      referer: `https://www.bilibili.com/video/${approved.bvid}/`,
      'user-agent': USER_AGENT
    }
  });
  if (!response?.ok || !response.body) {
    failPlaybookContract(
      'PLAYBOOK_MEDIA_DOWNLOAD_FAILED',
      approved.bvid,
      response?.status ?? 'no streaming response'
    );
  }
  const headerSize = parseContentLength(response.headers?.get('content-length'));
  if (headerSize !== null && headerSize !== playback.declared_size) {
    failPlaybookContract(
      'PLAYBOOK_MEDIA_SIZE_DRIFT',
      approved.bvid,
      `${headerSize} != ${playback.declared_size}`
    );
  }

  const temporary = `${mediaPath}.${process.pid}.${Date.now()}.tmp`;
  let streamed;
  try {
    streamed = await streamAndHash(response.body, temporary);
    if (streamed.byteSize !== playback.declared_size) {
      failPlaybookContract(
        'PLAYBOOK_MEDIA_SIZE_DRIFT',
        approved.bvid,
        `${streamed.byteSize} != ${playback.declared_size}`
      );
    }
    const status = await installMedia({
      temporary,
      mediaPath,
      streamed,
      replace
    });
    const mediaIndex = {
      schema_version: 1,
      bvid: approved.bvid,
      cid: approved.cid,
      source_metadata_fingerprint_sha256:
        approved.metadata_fingerprint_sha256,
      observed_at: observedAt,
      quality: playback.quality,
      format: playback.format,
      declared_duration_ms: playback.declared_duration_ms,
      duration_ms: playback.declared_duration_ms,
      declared_size: playback.declared_size,
      byte_size: streamed.byteSize,
      sha256: streamed.sha256
    };
    await writeAtomicJson(indexPath, mediaIndex);
    return Object.freeze({
      status,
      media_index: deepFreeze(structuredClone(mediaIndex))
    });
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function assertApprovedEpisode(episode) {
  const approved = getPilotEpisodeIdentity(episode?.bvid);
  for (const field of [
    'cid',
    'duration_seconds',
    'metadata_fingerprint_sha256'
  ]) {
    if (episode?.[field] !== approved[field]) {
      failPlaybookContract(
        'PLAYBOOK_MEDIA_EPISODE_INVALID',
        `episode.${field}`,
        `${episode?.[field]} != ${approved[field]}`
      );
    }
  }
  return approved;
}

async function fetchJson(fetchImpl, url, bvid) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      referer: `https://www.bilibili.com/video/${bvid}/`,
      'user-agent': USER_AGENT
    }
  });
  if (!response?.ok) {
    failPlaybookContract(
      'PLAYBOOK_MEDIA_METADATA_FAILED',
      url,
      response?.status ?? 'no response'
    );
  }
  try {
    return await response.json();
  } catch (error) {
    failPlaybookContract(
      'PLAYBOOK_MEDIA_METADATA_INVALID',
      url,
      error?.message || 'invalid JSON'
    );
  }
}

async function readVerifiedExisting({ mediaPath, indexPath, episode }) {
  let index;
  try {
    index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
  if (
    index?.schema_version !== 1
    || index.bvid !== episode.bvid
    || index.cid !== episode.cid
    || index.source_metadata_fingerprint_sha256
      !== episode.metadata_fingerprint_sha256
    || !validHash(index.sha256)
    || !Number.isSafeInteger(index.byte_size)
    || index.byte_size < 1
  ) {
    return null;
  }
  let digest;
  try {
    digest = await hashFile(mediaPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  return digest.sha256 === index.sha256 && digest.byteSize === index.byte_size
    ? index
    : null;
}

async function streamAndHash(body, target) {
  const handle = await fs.open(target, 'wx');
  const hash = createHash('sha256');
  let byteSize = 0;
  try {
    for await (const value of body) {
      const chunk = Buffer.from(value);
      await handle.write(chunk);
      hash.update(chunk);
      byteSize += chunk.length;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { sha256: hash.digest('hex'), byteSize };
}

async function installMedia({ temporary, mediaPath, streamed, replace }) {
  let existing = null;
  try {
    existing = await hashFile(mediaPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (
    existing
    && existing.sha256 === streamed.sha256
    && existing.byteSize === streamed.byteSize
  ) {
    await fs.rm(temporary, { force: true });
    return 'unchanged';
  }
  if (existing && !replace) {
    failPlaybookContract(
      'PLAYBOOK_MEDIA_CONFLICT',
      mediaPath,
      'target contains different bytes; pass --replace explicitly'
    );
  }
  await fs.rename(temporary, mediaPath);
  return existing ? 'updated' : 'created';
}

async function hashFile(filePath) {
  const handle = await fs.open(filePath, 'r');
  const hash = createHash('sha256');
  let byteSize = 0;
  try {
    for await (const chunk of handle.createReadStream()) {
      hash.update(chunk);
      byteSize += chunk.length;
    }
  } finally {
    await handle.close();
  }
  return { sha256: hash.digest('hex'), byteSize };
}

async function writeAtomicJson(target, value) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  let existing = null;
  try {
    existing = await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (existing === output) return;
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, output, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function parseContentLength(value) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function assertTimestamp(value, valuePath) {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    failPlaybookContract(
      'PLAYBOOK_TIMESTAMP_INVALID',
      valuePath,
      String(value)
    );
  }
}

function validHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
