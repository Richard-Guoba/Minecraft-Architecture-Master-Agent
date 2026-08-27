import { auditPlaybookSourceBoundary } from '../manual/manualDependencyBoundary.js';

export async function auditExecuteDependencyBoundary({ projectRoot }) {
  const execute = await auditPlaybookSourceBoundary({
    projectRoot,
    entryPaths: [
      'src/playbook/execute',
      'src/pipeline.js'
    ],
    forbiddenPaths: [
      'src/playbook/p6',
      'src/playbook/image-model',
      'src/playbook/screenshot',
      'src/playbook/camera',
      'src/playbook/fixed-view',
      'src/playbook/blind-selection',
      'src/playbook/human-preference',
      'src/playbook/visual-scoring'
    ],
    factNamespace: 'EXECUTE'
  });
  const eligibility = await auditPlaybookSourceBoundary({
    projectRoot,
    entryPaths: ['src/playbook/execute/eligibility.js'],
    forbiddenPaths: [
      'src/construction',
      'src/pipeline.js',
      'src/index.js',
      'src/lib/minecraftCommands.js',
      'src/lib/minecraftWorlds.js'
    ],
    factNamespace: 'EXECUTE_ELIGIBILITY'
  });
  return Object.freeze({
    ...execute,
    eligibility_authority_violation_count: eligibility.import_boundary_violation_count,
    eligibility_authority_unresolved_count: eligibility.import_boundary_unresolved_count,
    eligibility_authority_violations: eligibility.forbidden_dependency_imports,
    unresolved_eligibility_authority_dependencies: eligibility.unresolved_dependencies,
    allowed_noneligibility_dependencies: Object.freeze([
      'src/construction/agents/candidateSelectionAgent.js',
      'src/construction/agents/visualizationAgent.js'
    ])
  });
}
