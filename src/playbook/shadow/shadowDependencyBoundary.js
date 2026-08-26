import { auditPlaybookSourceBoundary } from '../manual/manualDependencyBoundary.js';

export async function auditShadowDependencyBoundary({ projectRoot }) {
  return auditPlaybookSourceBoundary({
    projectRoot,
    entryPaths: [
      'src/playbook/shadow',
      'src/runArchitecturePlaybookShadow.js'
    ],
    forbiddenPaths: [
      'src/construction',
      'src/pipeline.js',
      'src/index.js',
      'src/lib/minecraftCommands.js',
      'src/lib/minecraftWorlds.js'
    ],
    factNamespace: 'SHADOW'
  });
}
