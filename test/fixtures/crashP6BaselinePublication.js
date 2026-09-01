import { prepareP6BaselineAuthority } from '../../src/playbook/p6/baselineAuthority.js';

const [projectRoot, sourceRun, baselineRun] = process.argv.slice(2);

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
