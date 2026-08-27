import { auditPlaybookSourceBoundary } from '../manual/manualDependencyBoundary.js';

const ALLOWED_NONELIGIBILITY_DEPENDENCIES = Object.freeze([
  'src/construction/agents/candidateSelectionAgent.js',
  'src/construction/agents/templateAestheticReviewAgent.js',
  'src/construction/agents/visualizationAgent.js'
]);
const FORBIDDEN_AUTHORITY_TOKENS = Object.freeze([
  'p6',
  'image',
  'screenshot',
  'camera',
  'visual',
  'visualization',
  'aesthetic'
]);
const FORBIDDEN_AUTHORITY_TOKEN_PAIRS = Object.freeze([
  Object.freeze(['p', '6']),
  Object.freeze(['screen', 'shot']),
  Object.freeze(['fixed', 'view']),
  Object.freeze(['blind', 'selection']),
  Object.freeze(['human', 'preference']),
  Object.freeze(['candidate', 'selection'])
]);
const CANONICAL_IDENTIFIER_WORDS = Object.freeze([
  'visualization',
  'screenshot',
  'evaluation',
  'preference',
  'aesthetic',
  'candidate',
  'selection',
  'evaluator',
  'reviewer',
  'template',
  'provider',
  'scoring',
  'selector',
  'visual',
  'review',
  'scorer',
  'camera',
  'client',
  'image',
  'model',
  'screen',
  'blind',
  'fixed',
  'human',
  'agent',
  'view',
  'shot'
]);
const CONVENTIONAL_VERSION_SUFFIX = /v[1-9][0-9]{0,2}$/u;

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
  const tokens = normalizeDependencyIdentifiers(relativePath);
  if (tokens.some((token) => FORBIDDEN_AUTHORITY_TOKENS.includes(token))) return true;
  return FORBIDDEN_AUTHORITY_TOKEN_PAIRS.some(([left, right]) =>
    tokens.some((token, index) => token === left && tokens[index + 1] === right));
}

function normalizeDependencyIdentifiers(value) {
  const boundedTokens = String(value)
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
  return boundedTokens.flatMap((identifier) => {
    const unversioned = identifier.replace(CONVENTIONAL_VERSION_SUFFIX, '');
    if (!unversioned) return [];
    return unversioned
      .replace(/([a-z])([0-9])/gu, '$1 $2')
      .replace(/([0-9])([a-z])/gu, '$1 $2')
      .split(' ')
      .flatMap(splitCanonicalIdentifier);
  });
}

function splitCanonicalIdentifier(identifier) {
  const splits = Array(identifier.length + 1).fill(null);
  splits[identifier.length] = [];
  for (let offset = identifier.length - 1; offset >= 0; offset -= 1) {
    for (const word of CANONICAL_IDENTIFIER_WORDS) {
      const next = offset + word.length;
      if (identifier.startsWith(word, offset) && splits[next] !== null) {
        splits[offset] = [word, ...splits[next]];
        break;
      }
    }
  }
  return splits[0]?.length > 1 ? splits[0] : [identifier];
}

function classifyExecuteDependencyEdge(edge) {
  const logicalAllowed = ALLOWED_NONELIGIBILITY_DEPENDENCIES.includes(edge.logical_dependency_path);
  const realAllowed = ALLOWED_NONELIGIBILITY_DEPENDENCIES.includes(edge.real_dependency_path);
  if (realAllowed && edge.logical_dependency_path !== edge.real_dependency_path) {
    return `EXECUTE_FORBIDDEN_MODULE:${edge.logical_dependency_path} -> ${edge.real_dependency_path}`;
  }
  const logicalForbidden = !logicalAllowed
    && (isForbiddenExecuteDependency(edge.logical_dependency_path)
      || isForbiddenExecuteDependency(edge.specifier));
  const realForbidden = isForbiddenExecuteDependency(edge.real_dependency_path);
  if (!logicalForbidden || realForbidden) return null;
  return `EXECUTE_FORBIDDEN_MODULE:${edge.logical_dependency_path} -> ${edge.real_dependency_path}`;
}
