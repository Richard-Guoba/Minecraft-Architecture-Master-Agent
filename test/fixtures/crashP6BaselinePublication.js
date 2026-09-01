import { prepareP6BaselineAuthority } from '../../src/playbook/p6/baselineAuthority.js';

if (process.argv[2]) await runCrashJob(process.argv.slice(2));

async function runCrashJob([projectRoot, sourceRun, baselineRun]) {
  await prepareP6BaselineAuthority({
    projectRoot,
    sourceRun,
    baselineRun,
    fsImpl: {
      async afterStageFilesWritten() {
        process.kill(process.pid, 'SIGKILL');
      }
    }
  });
}
