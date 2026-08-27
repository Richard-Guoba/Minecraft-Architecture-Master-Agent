import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  admitExecuteRun,
  installCandidateSnapshot,
  installExecuteSelection
} from '../../src/playbook/execute/storage.js';

if (process.argv[2]) await runCrashJob(process.argv[2]);

async function runCrashJob(jobPath) {
  const job = JSON.parse(await fs.readFile(jobPath, 'utf8'));
  const authority = await admitExecuteRun({ runDir: job.runDir });
  const fsImpl = crashFs(job.kind, job.killPoint);

  if (job.kind === 'candidate') {
    await installCandidateSnapshot({
      authority,
      candidateId: job.candidateId,
      files: decodeFiles(job.files),
      currentChain: Buffer.from(job.currentChain, 'base64'),
      expectedPreviousChainSha256: job.expectedPreviousChainSha256,
      fsImpl
    });
  } else if (job.kind === 'selection') {
    await installExecuteSelection({
      authority,
      files: decodeFiles(job.files),
      fsImpl
    });
  } else {
    throw new Error('invalid crash-worker kind');
  }

  await authority.close();
  process.exitCode = 70;
}

function decodeFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([name, body]) => [
    name,
    Buffer.from(body, 'base64')
  ]));
}

function crashFs(kind, killPoint) {
  const [wantedCategory, rawOrdinal = '1'] = killPoint.split(':');
  const wantedOrdinal = Number(rawOrdinal);
  const counts = new Map();
  let pointerMoved = false;
  const hit = (category) => {
    const count = (counts.get(category) ?? 0) + 1;
    counts.set(category, count);
    if (category === wantedCategory && count === wantedOrdinal) {
      process.kill(process.pid, 'SIGKILL');
    }
  };
  return new Proxy(fs, {
    get(target, property) {
      if (property === 'open') return async (filename, flags, ...args) => {
        const targetText = String(filename);
        const inStage = await containsGeneratedName(targetText, '.playbook-execute.stage-');
        const handle = await fs.open(filename, flags, ...args);
        const stat = await handle.stat();
        const candidateDirectory = stat.isDirectory() && path.basename(targetText) === 'candidate-01';
        const selectionStageDirectory = kind === 'selection' && stat.isDirectory() && inStage;
        const executeRoot = stat.isDirectory() && path.basename(targetText) === 'playbook-execute';
        return wrapHandle(handle, {
          async writeFile(value, ...writeArgs) {
            const result = await handle.writeFile(value, ...writeArgs);
            if (inStage) {
              if (isCandidatePointer(value) || isSelectionPointer(value)) hit('pointer-write');
              else hit(kind === 'candidate' ? 'body-write' : 'generation-write');
            }
            return result;
          },
          async chmod(...chmodArgs) {
            const result = await handle.chmod(...chmodArgs);
            if (inStage && stat.isFile()) hit(kind === 'candidate' ? 'body-chmod' : 'generation-chmod');
            return result;
          },
          async sync(...syncArgs) {
            const result = await handle.sync(...syncArgs);
            if (inStage && stat.isFile()) hit(kind === 'candidate' ? 'body-file-sync' : 'generation-file-sync');
            if (selectionStageDirectory) hit('generation-dir-sync');
            if (candidateDirectory) hit(pointerMoved ? 'pointer-dir-sync' : 'candidate-dir-sync');
            if (executeRoot && pointerMoved) hit('pointer-dir-sync');
            return result;
          }
        });
      };
      if (property === 'renameNoReplaceBetween') return async (
        sourceHandle, sourceName, destinationHandle, destinationName, next
      ) => {
        const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
        if (kind === 'candidate' && sourceName.startsWith('.playbook-execute.stage-')) hit('body-move');
        return result;
      };
      if (property === 'renameNoReplace') return async (directoryHandle, sourceName, destinationName, next) => {
        const result = await next(directoryHandle, sourceName, destinationName);
        if (kind === 'selection' && destinationName.startsWith('selection-')) hit('generation-move');
        return result;
      };
      if (property === 'link') return async (source, destination) => {
        const result = await fs.link(source, destination);
        if (path.basename(String(destination)).startsWith('.playbook-execute.backup-')) hit('backup-link');
        return result;
      };
      if (property === 'rename') return async (source, destination) => {
        const result = await fs.rename(source, destination);
        const basename = path.basename(String(destination));
        if (kind === 'candidate' && basename === 'current-chain.json'
          || kind === 'selection' && basename === 'manifest.json') {
          pointerMoved = true;
          hit('pointer-move');
        }
        return result;
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function wrapHandle(handle, overrides) {
  return new Proxy(handle, {
    get(target, property) {
      if (Object.hasOwn(overrides, property)) return overrides[property];
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function isCandidatePointer(value) {
  return hasExactKeys(value, 'candidate_id,chain_revision,chain_sha256,schema_version');
}

function isSelectionPointer(value) {
  return hasExactKeys(value, 'generation,manifest_sha256,schema_version');
}

function hasExactKeys(value, keys) {
  try {
    return Object.keys(JSON.parse(Buffer.from(value).toString('utf8'))).sort().join(',') === keys;
  } catch {
    return false;
  }
}

async function containsGeneratedName(target, prefix) {
  if (target.includes(prefix)) return true;
  const match = target.match(/^\/proc\/self\/fd\/(\d+)(?:\/|$)/u);
  if (!match) return false;
  try {
    return (await fs.readlink(`/proc/self/fd/${match[1]}`)).includes(prefix);
  } catch {
    return false;
  }
}
