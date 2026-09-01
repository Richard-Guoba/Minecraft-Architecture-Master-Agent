import fs from 'node:fs/promises';

import {
  admitP6Run,
  publishP6Generation
} from '../../src/playbook/p6/storage.js';

if (process.argv[2]) await runCrashJob(process.argv[2]);

async function runCrashJob(jobPath) {
  const job = JSON.parse(await fs.readFile(jobPath, 'utf8'));
  const authority = await admitP6Run({ p6Dir: job.p6Dir });
  await publishP6Generation({
    authority,
    kind: job.kind,
    files: Object.fromEntries(Object.entries(job.files).map(([name, bytes]) => [
      name, Buffer.from(bytes, 'base64')
    ])),
    fsImpl: crashFs(job.phase)
  });
  await authority.close();
  process.exitCode = 70;
}

function crashFs(phase) {
  let pointerSyncs = 0;
  return new Proxy(fs, {
    get(target, property) {
      if (property === 'open') return async (targetPath, ...args) => {
        const pointerStage = /\/\.p6-current-[^/]+$/u.test(String(targetPath));
        if (pointerStage && phase === 'before-pointer-stage-open') {
          process.kill(process.pid, 'SIGKILL');
        }
        const handle = await target.open(targetPath, ...args);
        if (!pointerStage) return handle;
        if (phase === 'after-pointer-stage-open') {
          process.kill(process.pid, 'SIGKILL');
        }
        return new Proxy(handle, {
          get(file, method) {
            if (method === 'writeFile') return async (...writeArgs) => {
              const result = await file.writeFile(...writeArgs);
              if (phase === 'after-pointer-stage-write') {
                process.kill(process.pid, 'SIGKILL');
              }
              return result;
            };
            if (method === 'sync') return async (...syncArgs) => {
              const result = await file.sync(...syncArgs);
              pointerSyncs += 1;
              if (pointerSyncs === 1 && phase === 'after-pointer-stage-file-sync') {
                process.kill(process.pid, 'SIGKILL');
              }
              if (pointerSyncs === 2 && phase === 'after-pointer-stage-mode-sync') {
                process.kill(process.pid, 'SIGKILL');
              }
              return result;
            };
            if (method === 'chmod') return async (...chmodArgs) => {
              const result = await file.chmod(...chmodArgs);
              if (phase === 'after-pointer-stage-chmod') {
                process.kill(process.pid, 'SIGKILL');
              }
              return result;
            };
            const value = file[method];
            return typeof value === 'function' ? value.bind(file) : value;
          }
        });
      };
      if (property === 'renameNoReplaceBetween') return async (
        sourceHandle, sourceName, destinationHandle, destinationName, next
      ) => {
        const firstGenerationMove = sourceName.startsWith('.p6-stage-')
          && destinationName === 'generation-000001';
        const retirementMove = sourceName.startsWith('.p6-pointer-backup-')
          && destinationName === 'owned-entry';
        const pointerMove = sourceName.startsWith('.p6-current-')
          && destinationName === 'current';
        if (retirementMove && phase === 'before-retire-move') {
          process.kill(process.pid, 'SIGKILL');
        }
        if (pointerMove && phase === 'before-current-move') {
          process.kill(process.pid, 'SIGKILL');
        }
        const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
        if (firstGenerationMove && phase === 'after-first-generation-move') {
          process.kill(process.pid, 'SIGKILL');
        }
        if (retirementMove && phase === 'after-retire-move') {
          process.kill(process.pid, 'SIGKILL');
        }
        if (pointerMove && phase === 'after-current-move') {
          process.kill(process.pid, 'SIGKILL');
        }
        return result;
      };
      if (property === 'removeBound') return async (
        parentHandle, basename, expectedIdentity, expectedKind, next
      ) => {
        const retiredFile = basename === 'owned-entry';
        const retirementDirectory = basename.startsWith('.p5-retirement-');
        if (retiredFile && phase === 'before-retired-file-remove') {
          process.kill(process.pid, 'SIGKILL');
        }
        if (retirementDirectory && phase === 'before-retirement-dir-remove') {
          process.kill(process.pid, 'SIGKILL');
        }
        const result = await next();
        if (retiredFile && phase === 'after-retired-file-remove') {
          process.kill(process.pid, 'SIGKILL');
        }
        if (retirementDirectory && phase === 'after-retirement-dir-remove') {
          process.kill(process.pid, 'SIGKILL');
        }
        return result;
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
