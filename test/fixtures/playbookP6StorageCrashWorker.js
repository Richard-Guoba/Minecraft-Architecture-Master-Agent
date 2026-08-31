import fs from 'node:fs/promises';

import {
  admitP6Run,
  publishP6Generation
} from '../../src/playbook/p6/storage.js';

const job = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
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

function crashFs(phase) {
  return new Proxy(fs, {
    get(target, property) {
      if (property === 'renameNoReplaceBetween') return async (
        sourceHandle, sourceName, destinationHandle, destinationName, next
      ) => {
        const pointerMove = sourceName.startsWith('.p6-current-')
          && destinationName === 'current';
        if (pointerMove && phase === 'before-current-move') {
          process.kill(process.pid, 'SIGKILL');
        }
        const result = await next(sourceHandle, sourceName, destinationHandle, destinationName);
        if (pointerMove && phase === 'after-current-move') {
          process.kill(process.pid, 'SIGKILL');
        }
        return result;
      };
      if (property === 'removeBound') return async (
        parentHandle, basename, expectedIdentity, expectedKind, next
      ) => {
        const journal = basename.startsWith('.p6-pointer-backup-');
        if (journal && phase === 'before-journal-remove') {
          process.kill(process.pid, 'SIGKILL');
        }
        const result = await next();
        if (journal && phase === 'after-journal-remove') {
          process.kill(process.pid, 'SIGKILL');
        }
        return result;
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
