import { auditPlaybookSourceBoundary } from '../manual/manualDependencyBoundary.js';

const ALLOWED_NONELIGIBILITY_DEPENDENCIES = Object.freeze([
  'src/construction/agents/candidateSelectionAgent.js',
  'src/construction/agents/visualizationAgent.js'
]);

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
    factNamespace: 'EXECUTE',
    classifyResolvedDependency: classifyExecuteDependencyEdge
  });
  const repositoryWideViolations = execute.resolved_dependency_paths
    .filter((relativePath) => isForbiddenExecuteDependency(relativePath))
    .map((relativePath) => `EXECUTE_FORBIDDEN_MODULE:${relativePath}`);
  const forbiddenDependencyImports = [...new Set([
    ...execute.forbidden_dependency_imports,
    ...repositoryWideViolations
  ])].sort();
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
    import_boundary_violation_count: forbiddenDependencyImports.length,
    forbidden_dependency_imports: Object.freeze(forbiddenDependencyImports),
    eligibility_authority_violation_count: eligibility.import_boundary_violation_count,
    eligibility_authority_unresolved_count: eligibility.import_boundary_unresolved_count,
    eligibility_authority_violations: eligibility.forbidden_dependency_imports,
    unresolved_eligibility_authority_dependencies: eligibility.unresolved_dependencies,
    allowed_noneligibility_dependencies: ALLOWED_NONELIGIBILITY_DEPENDENCIES
  });
}

function isForbiddenExecuteDependency(relativePath) {
  if (ALLOWED_NONELIGIBILITY_DEPENDENCIES.includes(relativePath)) return false;
  const normalized = relativePath.toLowerCase().replaceAll('-', '').replaceAll('_', '');
  const segments = normalized.split('/');
  return segments.some((segment) => segment.startsWith('p6'))
    || segments.some((segment) => /^(?:image(?:client|model|provider|scor|evaluat)?|screenshot|camera|fixedview|blindselection|humanpreference)/u.test(segment))
    || segments.some((segment) => /visual(?:scor|evaluat|model|ization)|aesthetic(?:scor|evaluat)|candidateselection/u.test(segment));
}

function classifyExecuteDependencyEdge(edge) {
  const logicalForbidden = !ALLOWED_NONELIGIBILITY_DEPENDENCIES.includes(edge.logical_dependency_path)
    && (isForbiddenExecuteDependency(edge.logical_dependency_path)
      || isForbiddenExecuteDependency(edge.specifier));
  const realForbidden = isForbiddenExecuteDependency(edge.real_dependency_path);
  if (!logicalForbidden || realForbidden) return null;
  return `EXECUTE_FORBIDDEN_MODULE:${edge.logical_dependency_path} -> ${edge.real_dependency_path}`;
}
