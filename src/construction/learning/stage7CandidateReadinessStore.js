import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CandidateReadinessError } from './stage7CandidateBoundary.js';
import {
  canonicalReadinessJson,
  reduceCandidateReadiness,
  validateReadinessEvent
} from './stage7CandidateReadinessState.js';

export const READINESS_LEDGER_RELATIVE = 'manifests/acquisition-events.jsonl';

export async function readSyntheticReadinessLedger(root) {
  const target = await ledgerPath(root);
  let text;
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) fail('READINESS_LEDGER_SYMLINK');
    if (!stat.isFile()) fail('READINESS_LEDGER_NOT_REGULAR');
    text = await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return Object.freeze([]);
    throw error;
  }
  const records = text.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return validateReadinessEvent(JSON.parse(line));
    } catch (error) {
      if (error instanceof CandidateReadinessError) throw error;
      fail('READINESS_LEDGER_INVALID', { line: index + 1 });
    }
  });
  const canonical = records.map(canonicalReadinessJson).join('');
  if (text !== canonical) fail('READINESS_LEDGER_NONCANONICAL');
  for (const candidateId of new Set(records.map((record) => record.candidate_id))) {
    reduceCandidateReadiness(records, candidateId);
  }
  return Object.freeze(records);
}

export async function appendSyntheticReadinessEvent(root, input, {
  rename = fs.rename,
  writeFile = fs.writeFile,
  remove = fs.rm
} = {}) {
  const event = validateReadinessEvent(input);
  const target = await ledgerPath(root);
  const existing = await readSyntheticReadinessLedger(root);
  const prior = existing.filter((record) => record.candidate_id === event.candidate_id);
  if (event.revision !== prior.length + 1) fail('READINESS_REVISION_NOT_NEXT');
  const expectedPrevious = prior.at(-1)?.event_sha256 ?? null;
  if (event.previous_event_sha256 !== expectedPrevious) fail('READINESS_PREVIOUS_HASH_INVALID');
  reduceCandidateReadiness([...existing, event], event.candidate_id);
  const output = [...existing, event].map(canonicalReadinessJson).join('');
  const temporary = path.join(path.dirname(target), `.acquisition-events.jsonl.tmp-${process.pid}`);
  try {
    await fs.lstat(temporary);
    fail('READINESS_TEMP_EXISTS');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await writeFile(temporary, output, { encoding: 'utf8', flag: 'wx' });
    const handle = await fs.open(temporary, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
    const directory = await fs.open(path.dirname(target), 'r');
    try {
      await directory.sync();
    } catch (error) {
      if (!['EINVAL', 'ENOTSUP'].includes(error.code)) throw error;
    } finally {
      await directory.close();
    }
  } catch (error) {
    await remove(temporary, { force: true });
    throw error;
  }
  return event;
}

async function ledgerPath(root) {
  const absolute = path.resolve(root);
  const relativeToTmp = path.relative(path.resolve(tmpdir()), absolute);
  if (relativeToTmp === '..' || relativeToTmp.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToTmp)
    || !path.basename(absolute).startsWith('stage7-candidate-readiness-')) {
    fail('SYNTHETIC_ROOT_INVALID');
  }
  const rootStat = await fs.lstat(absolute);
  const manifests = path.join(absolute, 'manifests');
  const manifestsStat = await fs.lstat(manifests);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || manifestsStat.isSymbolicLink() || !manifestsStat.isDirectory()) {
    fail('SYNTHETIC_ROOT_INVALID');
  }
  return path.join(manifests, 'acquisition-events.jsonl');
}

function fail(code, safeDetail = {}) {
  throw new CandidateReadinessError(code, 'store', 'synthetic', safeDetail);
}
