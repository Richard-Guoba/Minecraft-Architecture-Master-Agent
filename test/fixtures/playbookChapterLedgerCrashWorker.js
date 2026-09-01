import fs from 'node:fs/promises';

import { advanceEpisodeStage } from '../../src/playbook/course/chapterLedger.js';

if (process.argv[2]) await runCrashJob(process.argv[2]);

async function runCrashJob(jobPath) {
  const job = JSON.parse(await fs.readFile(jobPath, 'utf8'));
  await advanceEpisodeStage({
    projectRoot: job.projectRoot,
    bvid: job.bvid,
    expectedLedgerSha256: job.expectedLedgerSha256,
    expectedStage: 'pending',
    nextStage: 'media-verified',
    evidence: job.evidence,
    fsImpl: crashAfterLockFs()
  });
  process.exitCode = 70;
}

function crashAfterLockFs() {
  let crashed = false;
  return new Proxy(fs, {
    get(target, property, receiver) {
      if (property === 'lstat' || property === 'open') {
        return async (targetPath, ...args) => {
          if (!crashed && String(targetPath).endsWith('/chapter-ledger.json')) {
            crashed = true;
            process.kill(process.pid, 'SIGKILL');
          }
          return target[property](targetPath, ...args);
        };
      }
      return Reflect.get(target, property, receiver);
    }
  });
}
