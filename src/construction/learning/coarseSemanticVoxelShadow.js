import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildStage7Condition } from './coarseSemanticVoxelCondition.js';
import { deterministicCoarseSemanticVoxelProvider } from './coarseSemanticVoxelBaseline.js';
import { repairCoarseSemanticVoxelPlan } from './coarseSemanticVoxelRepair.js';
import { convertSemanticVoxelPlanToProceduralPlan } from './semanticVoxelProceduralPlan.js';

export const STAGE7_SHADOW_SOURCE = 'stage7-coarse-semantic-voxel-shadow-v1';
export const STAGE7_FAILURE_SOURCE = 'stage7-coarse-semantic-voxel-failure-v1';
export const MAX_STAGE7_ARTIFACT_BYTES = 32 * 1024 * 1024;

export function createArtifactCoarseSemanticVoxelProvider({ artifactPath } = {}) {
  return Object.freeze({
    id: 'artifact',
    async generate({ options = {} } = {}) {
      return readArtifact(options.artifactPath || artifactPath);
    }
  });
}

export function selectCoarseSemanticVoxelProvider(name, options = {}) {
  if (name === 'baseline') return deterministicCoarseSemanticVoxelProvider;
  if (name === 'artifact') return createArtifactCoarseSemanticVoxelProvider(options);
  throw new Error(`unsupported Stage 7 coarse voxel provider: ${name}`);
}

export async function runCoarseSemanticVoxelShadow({
  mode = 'off',
  provider = 'baseline',
  artifactPath,
  ...rest
} = {}) {
  if (mode === 'off') {
    return {
      source: STAGE7_SHADOW_SOURCE,
      active: false,
      mode: 'off',
      provider: 'baseline',
      status: 'disabled',
      reason: 'Stage 7 coarse voxel mode is off'
    };
  }

  let condition;
  let rawPlan;
  let repair;
  let stage = 'condition';
  try {
    condition = buildStage7Condition(rest);
    if (mode !== 'shadow') throw new Error(`unsupported Stage 7 coarse voxel mode: ${mode}`);
    stage = 'provider';
    rawPlan = await selectCoarseSemanticVoxelProvider(provider, {
      artifactPath
    }).generate({ condition, options: { artifactPath } });
    stage = 'semantic-validation';
    repair = repairCoarseSemanticVoxelPlan({ plan: rawPlan, condition });
    if (!repair.accepted) {
      return reject({ mode, provider, condition, rawPlan, repair, stage, artifactPath });
    }
    stage = 'conversion';
    const candidate = convertSemanticVoxelPlanToProceduralPlan({ plan: repair.plan, condition, ...rest });
    const result = {
      source: STAGE7_SHADOW_SOURCE,
      active: true,
      mode,
      provider,
      status: 'converted',
      condition,
      rawPlan,
      repairedPlan: { ...structuredClone(repair.plan), derived_sketches: candidate.sketches },
      repair,
      candidate,
      providerProvenance: providerProvenance(rawPlan)
    };
    return { ...result, report: renderCoarseSemanticVoxelShadowReport(result) };
  } catch (error) {
    return reject({ mode, provider, condition, rawPlan, repair, stage, error, artifactPath });
  }
}

export function compactCoarseSemanticVoxelShadow(result = {}) {
  if (!result.active) return undefined;
  const condition = result.condition || {};
  const candidate = result.candidate?.sketches || {};
  const provenance = result.providerProvenance || result.failureCase?.provider_metadata || {};
  return {
    source: result.source,
    active: true,
    mode: result.mode,
    provider: result.provider,
    status: result.status,
    condition_hash: condition.condition_hash,
    artifact_sha256: provenance.sha256 || result.failureCase?.artifact?.sha256,
    selected_concept_id: condition.design?.selected_concept_id,
    reference_ids: (condition.references || []).map((item) => item.case_id),
    raw_run_count: result.rawPlan?.runs?.length || 0,
    repaired_run_count: result.repairedPlan?.runs?.length || 0,
    repair_count: result.repair?.repairs?.length || 0,
    blocker_count: result.repair?.blockers?.length || result.failureCase?.blockers?.length || 0,
    massing_count: candidate.massing?.length || 0,
    space_zone_count: candidate.spaces?.length || 0,
    site_zone_count: candidate.site?.length || 0,
    warnings: result.warnings || [],
    fallback: result.status === 'rejected' ? 'primary-build-unchanged' : 'not-needed'
  };
}

export function renderCoarseSemanticVoxelShadowReport(result = {}) {
  const condition = result.condition || {};
  const summary = result.repairedPlan?.summary || {};
  const sketches = result.candidate?.sketches || { massing: [], spaces: [], site: [] };
  const failure = result.failureCase || {};
  const provenance = result.providerProvenance || failure.provider_metadata || {};
  const lines = (items = []) => items.length
    ? items.map((item) => `- ${item.id || item.case_id || 'item'}: ${item.message || item.reason || ''}`).join('\n')
    : '- none';
  return `# Stage 7 Coarse Semantic Voxel Shadow

- Mode: ${result.mode || 'off'}
- Provider: ${result.provider || 'baseline'}
- Status: ${result.status || 'unknown'}
- Condition hash: ${condition.condition_hash || 'not-created'}
- Artifact sha256: ${provenance.sha256 || failure.artifact?.sha256 || 'not-applicable'}
- Selected concept: ${condition.design?.selected_concept_id || 'none'}
- Raw runs: ${result.rawPlan?.runs?.length || 0}
- Repaired runs: ${result.repairedPlan?.runs?.length || 0}

## Semantic Layers

- Envelope: ${JSON.stringify(summary.envelope_counts || {})}
- Space: ${sketches.spaces?.length || 0}
- Site: ${sketches.site?.length || 0}
- Massing: ${sketches.massing?.length || 0}

## Reference Evidence

${lines(condition.references)}

## Conflicts

${lines(result.repair?.conflicts)}

## Repairs

${lines(result.repair?.repairs)}

## Blockers

${lines(result.repair?.blockers || failure.blockers)}

## Warnings

${(result.warnings || []).map((item) => `- ${item}`).join('\n') || '- none'}

## Conversion Decision

- Result: ${result.status === 'converted' ? 'candidate semantic inputs exported for shadow review' : `rejected during ${failure.failure_stage || 'unknown stage'}`}
- Candidate applied to primary geometry: no
`;
}

async function readArtifact(inputPath) {
  if (!inputPath) throw new Error('Stage 7 artifact provider requires an artifact path');
  const file = path.resolve(inputPath);
  let stat;
  try {
    stat = await fs.stat(file);
  } catch (error) {
    const failure = new Error(`Could not read Stage 7 artifact: ${error.message}`);
    failure.artifact = { path: file };
    throw failure;
  }
  if (stat.size > MAX_STAGE7_ARTIFACT_BYTES) {
    const failure = new Error(`Stage 7 artifact exceeds ${MAX_STAGE7_ARTIFACT_BYTES} bytes`);
    failure.artifact = { path: file, byte_size: stat.size };
    throw failure;
  }
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    const failure = new Error(`Could not read Stage 7 artifact: ${error.message}`);
    failure.artifact = { path: file, byte_size: stat.size };
    throw failure;
  }
  const artifact = { path: file, byte_size: stat.size, sha256: createHash('sha256').update(text).digest('hex') };
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const failure = new Error(`Could not parse Stage 7 artifact: ${error.message}`);
    failure.artifact = { ...artifact, malformed_excerpt: text.slice(0, 4096) };
    throw failure;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const failure = new Error('Stage 7 artifact root must be an object');
    failure.artifact = { ...artifact, malformed_excerpt: text.slice(0, 4096) };
    throw failure;
  }
  Object.defineProperty(value, '__stage7ArtifactProvenance', { value: artifact });
  return value;
}

function providerProvenance(rawPlan) {
  return rawPlan?.__stage7ArtifactProvenance || rawPlan?.provider;
}

function reject({ mode, provider, condition, rawPlan, repair, stage, error, artifactPath }) {
  const artifact = error?.artifact || rawPlan?.__stage7ArtifactProvenance || (artifactPath ? { path: path.resolve(artifactPath) } : undefined);
  const metadata = rawPlan?.provider;
  const failureCase = {
    source: STAGE7_FAILURE_SOURCE,
    prompt: condition?.prompt,
    seed: condition?.seed,
    condition_hash: condition?.condition_hash,
    dimensions: condition?.dimensions,
    selected_concept_id: condition?.design?.selected_concept_id,
    reference_ids: (condition?.references || []).map((item) => item.case_id),
    provider,
    failure_stage: stage,
    provider_name: rawPlan?.provider?.name,
    provider_metadata: metadata,
    artifact,
    schema_source: rawPlan?.source,
    schema_version: rawPlan?.schema_version,
    provider_error: error?.message,
    raw_plan_hash: artifact?.sha256,
    conflicts: repair?.conflicts || [],
    repairs: repair?.repairs || [],
    conversion_result: stage === 'conversion' ? { status: 'failed', message: error?.message } : { status: 'not-run' },
    blockers: repair?.blockers || [{ id: 'provider-or-converter-error', message: error?.message || 'rejected' }],
    fallback: 'primary-build-unchanged'
  };
  const result = {
    source: STAGE7_SHADOW_SOURCE,
    active: true,
    mode,
    provider,
    status: 'rejected',
    condition,
    rawPlan: provider === 'artifact' ? undefined : rawPlan,
    repair,
    providerProvenance: metadata,
    failureCase,
    warnings: error ? [error.message] : []
  };
  return { ...result, report: renderCoarseSemanticVoxelShadowReport(result) };
}
