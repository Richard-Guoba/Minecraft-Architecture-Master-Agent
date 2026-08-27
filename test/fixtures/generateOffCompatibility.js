import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(process.argv[2] || process.cwd());
const { runPipeline } = await import(pathToFileURL(path.join(repoRoot, 'src', 'pipeline.js')));
const prompt = '建造一座两层中世纪民居，三体块、深色坡屋顶、木框架与石质基座';
const seed = 424242;
const result = {};

result.stage7_concept_no_critics = await captureCase('stage7', {
  concepts: 2,
  conceptStrategy: 'fuse',
  critics: false,
  coarseVoxelMode: 'shadow',
  coarseVoxelProvider: 'baseline'
});
result.provider_fallback = await captureProviderFallback();
result.single_install = await captureCase('single-install', { install: true });
result.candidate_install = await captureCase('candidate-install', {
  install: true,
  candidates: 3,
  candidateRounds: 1,
  candidateTargetScore: 95,
  candidateForceRounds: false
});

process.stdout.write(JSON.stringify(result, null, 2));

async function captureProviderFallback() {
  const requests = [];
  const originalFetch = globalThis.fetch;
  const environment = saveEnvironment([
    'LLM_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'
  ]);
  Object.assign(process.env, {
    LLM_PROVIDER: 'openai-compatible',
    OPENAI_API_KEY: 'off-compatibility-key',
    OPENAI_BASE_URL: 'https://off-compatibility.invalid/v1',
    OPENAI_MODEL: 'off-compatibility-model'
  });
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({
      index: requests.length + 1,
      url: String(url),
      method: options.method,
      model: body.model,
      temperature: body.temperature,
      roles: body.messages.map((row) => row.role),
      body_sha256: digest(Buffer.from(stable(body))),
      system_sha256: digest(Buffer.from(body.messages[0].content)),
      user_sha256: digest(Buffer.from(body.messages[1].content))
    });
    throw new Error('OFF_COMPATIBILITY_PROVIDER_FAILURE');
  };
  try {
    const captured = await captureCase('provider-fallback', {
      mode: 'auto',
      critics: false
    });
    return {
      ...captured,
      request_count: requests.length,
      request_trace_sha256: digest(Buffer.from(stable(requests))),
      requests
    };
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
}

async function captureCase(name, options) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `p5-off-vector-${name}-`));
  const outRoot = path.join(root, 'out');
  const datapacksDir = path.join(root, 'world-datapacks');
  try {
    if (options.install) await fs.mkdir(datapacksDir, { recursive: true });
    const pipelineResult = await runPipeline({
      prompt,
      mode: options.mode || 'mock',
      seed,
      outRoot,
      cwd: repoRoot,
      ...(options.install ? { datapacksDir } : {}),
      ...Object.fromEntries(Object.entries(options).filter(([key]) => !['install', 'mode'].includes(key)))
    });
    return await capture(pipelineResult, {
      outRoot,
      runDir: pipelineResult.outputDir,
      installedDir: pipelineResult.artifacts.installedDatapackDir
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function capture(pipelineResult, { outRoot, runDir, installedDir }) {
  const artifactHashes = {};
  const keys = [
    'blueprint', 'buildFunction', 'clearFunction', 'runFunction', 'rawBuild',
    'previewHtml', 'report', 'architectureScorecard', 'candidateSelection',
    'candidateSelectionReport', 'conceptStudio', 'conceptStudioReport',
    'stage7Condition', 'stage7RawPlan', 'stage7RepairedPlan', 'stage7Candidate',
    'stage7Report', 'criticCouncil'
  ];
  for (const key of keys.filter((item) => pipelineResult.artifacts[item])) {
    const filename = pipelineResult.artifacts[key];
    const raw = await fs.readFile(filename);
    const normalized = path.extname(filename) === '.json'
      ? stable(normalize(JSON.parse(raw.toString('utf8')), { outRoot, runDir }))
      : normalize(raw.toString('utf8'), { outRoot, runDir });
    artifactHashes[key] = digest(Buffer.from(normalized));
  }
  const summary = normalize({
    workflow: pipelineResult.workflow,
    seed: pipelineResult.seed,
    seedSource: pipelineResult.seedSource,
    llmProvider: pipelineResult.llmProvider,
    llmUsage: pipelineResult.llmUsage,
    validationOk: pipelineResult.validation?.ok,
    concept: pipelineResult.conceptStudio ? {
      count: pipelineResult.conceptStudio.concept_count,
      strategy: pipelineResult.conceptStudio.strategy,
      selected: pipelineResult.conceptStudio.selected_concept_id
    } : null,
    stage7: pipelineResult.stage7 ? {
      status: pipelineResult.stage7.status,
      provider: pipelineResult.stage7.provider,
      condition_hash: pipelineResult.stage7.condition?.condition_hash
    } : null,
    critic: pipelineResult.criticCouncil ? {
      readiness: pipelineResult.criticCouncil.readiness,
      warning_count: pipelineResult.criticCouncil.warning_count
    } : null,
    candidate: pipelineResult.candidateSelection ? {
      selected_candidate_id: pipelineResult.candidateSelection.selected_candidate_id,
      selected_seed: pipelineResult.candidateSelection.selected_seed,
      successful_count: pipelineResult.candidateSelection.successful_count
    } : null,
    installed: Boolean(installedDir)
  }, { outRoot, runDir });
  return {
    summary_sha256: digest(Buffer.from(stable(summary))),
    artifact_hashes: artifactHashes,
    installed_tree_sha256: installedDir ? await treeHash(installedDir) : null
  };
}

async function treeHash(root) {
  const rows = [];
  await walk(root, '');
  return digest(Buffer.from(stable(rows)));

  async function walk(current, prefix) {
    for (const entry of (await fs.readdir(current, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), relative);
      else rows.push({ path: relative, sha256: digest(await fs.readFile(path.join(current, entry.name))) });
    }
  }
}

function normalize(value, { outRoot, runDir }) {
  if (Array.isArray(value)) return value.map((item) => normalize(item, { outRoot, runDir }));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    normalize(item, { outRoot, runDir })
  ]));
  if (typeof value !== 'string') return value;
  return value
    .split(path.resolve(runDir)).join('<RUN>')
    .split(path.resolve(outRoot)).join('<ROOT>')
    .split(path.resolve(path.dirname(outRoot))).join('<CASE>')
    .replaceAll('\\', '/');
}

function stable(value) {
  const sort = (item) => Array.isArray(item)
    ? item.map(sort)
    : item && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]))
      : item;
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function saveEnvironment(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(saved) {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
