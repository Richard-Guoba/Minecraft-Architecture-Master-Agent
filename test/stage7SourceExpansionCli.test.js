import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  SOURCE_EXPANSION_DIRECTORIES,
  SOURCE_EXPANSION_ROOT_RELATIVE,
  SourceExpansionBoundaryError,
  assertExactInventory,
  assertSourceExpansionRoot,
  readSourceExpansionJson,
  writeFreshReportDirectory
} from '../src/construction/learning/stage7SourceExpansionBoundary.js';
import {
  helpText,
  parseStage7SourceExpansionArgs,
  runStage7SourceExpansionCli
} from '../src/auditStage7SourceExpansion.js';
import {
  candidateFixture,
  decisionFixture,
  rightsFixture
} from './fixtures/stage7SourceExpansionFixtures.js';

test('argument parsing accepts only four exact metadata-only command shapes', () => {
  assert.deepEqual(parseStage7SourceExpansionArgs([
    'discovery',
    '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--as-of', '2026-07-16',
    '--metadata-only'
  ]), {
    command: 'discovery',
    root: SOURCE_EXPANSION_ROOT_RELATIVE,
    asOf: '2026-07-16',
    metadataOnly: true,
    help: false
  });
  assert.deepEqual(parseStage7SourceExpansionArgs([
    'init', '--root', SOURCE_EXPANSION_ROOT_RELATIVE
  ]), {
    command: 'init',
    root: SOURCE_EXPANSION_ROOT_RELATIVE,
    asOf: null,
    metadataOnly: false,
    help: false
  });
  assert.deepEqual(parseStage7SourceExpansionArgs(['init', '--help']), { help: true });
  assert.match(helpText(), /init\|discovery\|yield\|finalize/u);
});

test('argument parsing rejects missing acknowledgement, unknown and duplicate flags, and wrong root', () => {
  assert.throws(
    () => parseStage7SourceExpansionArgs([
      'discovery', '--root', SOURCE_EXPANSION_ROOT_RELATIVE, '--as-of', '2026-07-16'
    ]),
    hasCode('METADATA_ONLY_REQUIRED')
  );
  assert.throws(
    () => parseStage7SourceExpansionArgs([
      'discovery', '--root', SOURCE_EXPANSION_ROOT_RELATIVE, '--as-of', '2026-07-16',
      '--metadata-only', '--download'
    ]),
    hasCode('CLI_USAGE')
  );
  assert.throws(
    () => parseStage7SourceExpansionArgs([
      'discovery', `--root=${SOURCE_EXPANSION_ROOT_RELATIVE}`,
      `--root=${SOURCE_EXPANSION_ROOT_RELATIVE}`, '--as-of=2026-07-16', '--metadata-only'
    ]),
    hasCode('CLI_OPTION_DUPLICATE')
  );
  assert.throws(
    () => parseStage7SourceExpansionArgs([
      'discovery', '--root', '.local/other', '--as-of', '2026-07-16', '--metadata-only'
    ]),
    hasCode('ROOT_INVALID')
  );
  assert.throws(
    () => parseStage7SourceExpansionArgs([
      'init', '--root', SOURCE_EXPANSION_ROOT_RELATIVE, '--metadata-only'
    ]),
    hasCode('CLI_USAGE')
  );
});

test('CLI refuses operation without the metadata-only acknowledgement', async (t) => {
  const context = await fixtureContext(t);
  await assert.rejects(
    runStage7SourceExpansionCli([
      'discovery', '--root', SOURCE_EXPANSION_ROOT_RELATIVE, '--as-of', '2026-07-16'
    ], context),
    hasCode('METADATA_ONLY_REQUIRED')
  );
  assert.equal(context.datasetChecks, 0);
});

test('init creates only the four empty metadata directories and checks formal boundaries twice', async (t) => {
  const context = await fixtureContext(t);
  const result = await runStage7SourceExpansionCli([
    'init', '--root', SOURCE_EXPANSION_ROOT_RELATIVE
  ], context);

  assert.deepEqual((await readdir(context.root)).sort(), [...SOURCE_EXPANSION_DIRECTORIES].sort());
  for (const directory of SOURCE_EXPANSION_DIRECTORIES) {
    assert.deepEqual(await readdir(join(context.root, directory)), []);
  }
  assert.deepEqual(result, {
    command: 'init',
    root: SOURCE_EXPANSION_ROOT_RELATIVE,
    metadata_only: true,
    authorizes_download: false,
    authorizes_training: false
  });
  assert.equal(context.datasetChecks, 2);
});

test('repository ignores the exact local source-expansion audit root', async () => {
  const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.equal(
    gitignore.split(/\r?\n/u).includes('.local/stage7-source-expansion/'),
    true
  );
});

test('init removes its newly created root when the boundary check fails', async (t) => {
  const context = await fixtureContext(t);
  context.gitStatus = async (args) => args[0] === 'check-ignore' ? 1 : 1;

  await assert.rejects(
    runStage7SourceExpansionCli([
      'init', '--root', SOURCE_EXPANSION_ROOT_RELATIVE
    ], context),
    hasCode('ROOT_NOT_IGNORED')
  );
  await assert.rejects(readFile(context.root), { code: 'ENOENT' });
});

test('source root must be exact, ignored, untracked, regular, and not a symlink', async (t) => {
  const context = await fixtureContext(t);
  await mkdir(context.root, { recursive: true });

  await assert.rejects(
    assertSourceExpansionRoot(join(context.repositoryRoot, '.local', 'other'), context),
    hasCode('ROOT_INVALID')
  );
  await assert.rejects(
    assertSourceExpansionRoot(context.root, { ...context, gitStatus: async () => 1 }),
    hasCode('ROOT_NOT_IGNORED')
  );
  await assert.rejects(
    assertSourceExpansionRoot(context.root, {
      ...context,
      gitStatus: async (args) => args[0] === 'check-ignore' ? 0 : 0
    }),
    hasCode('ROOT_TRACKED')
  );

  await rm(context.root, { recursive: true, force: true });
  const real = join(context.repositoryRoot, 'real-source-expansion');
  await mkdir(real);
  await symlink(real, context.root, 'dir');
  await assert.rejects(assertSourceExpansionRoot(context.root, context), hasCode('ROOT_INVALID'));
});

test('read boundaries reject path escape, file symlinks, invalid UTF-8, and missing input', async (t) => {
  const context = await populatedFixtureContext(t);
  await assert.rejects(
    readSourceExpansionJson(context.root, '../escape.json'),
    hasCode('PATH_ESCAPE')
  );

  const candidatePath = join(context.root, 'metadata', 'candidates.jsonl');
  const outside = join(context.repositoryRoot, 'outside.jsonl');
  await writeFile(outside, '{}\n', 'utf8');
  await rm(candidatePath);
  await symlink(outside, candidatePath);
  await assert.rejects(
    runStage7SourceExpansionCli(discoveryArgs(), context),
    hasCode('PATH_SYMLINK')
  );

  await rm(candidatePath);
  await writeFile(candidatePath, Uint8Array.from([0xc3, 0x28]));
  await assert.rejects(
    runStage7SourceExpansionCli(discoveryArgs(), context),
    hasCode('INPUT_INVALID_UTF8')
  );

  await rm(candidatePath);
  await assert.rejects(
    runStage7SourceExpansionCli(discoveryArgs(), context),
    hasCode('INPUT_MISSING')
  );
});

test('fresh report writing removes temporary output after an injected write failure', async (t) => {
  const context = await populatedFixtureContext(t);
  let writes = 0;
  await assert.rejects(
    writeFreshReportDirectory(context.root, 'injected', {
      'a.json': '{}\n',
      'b.json': '{}\n'
    }, {
      writeFile: async (...args) => {
        writes += 1;
        if (writes === 2) throw new Error('injected write failure');
        return writeFile(...args);
      }
    }),
    /injected write failure/u
  );
  assert.deepEqual(await readdir(join(context.root, 'reports')), []);
});

test('exact report inventory rejects extras and nested entries', async (t) => {
  const context = await populatedFixtureContext(t);
  const report = join(context.root, 'reports', 'sample');
  await mkdir(report);
  await writeFile(join(report, 'expected.json'), '{}\n', 'utf8');
  await assert.doesNotReject(assertExactInventory(context.root, 'reports/sample', ['expected.json']));
  await writeFile(join(report, 'extra.json'), '{}\n', 'utf8');
  await assert.rejects(
    assertExactInventory(context.root, 'reports/sample', ['expected.json']),
    hasCode('REPORT_INVENTORY_INVALID')
  );
});

test('discovery writes only the canonical local report trio', async (t) => {
  const context = await populatedFixtureContext(t);
  const result = await runStage7SourceExpansionCli(discoveryArgs(), context);

  assert.equal(result.card_count, 30);
  assert.deepEqual((await readdir(join(context.root, 'reports', 'discovery'))).sort(), [
    'review-cards.json',
    'review-cards.md',
    'rights-and-ranking.json'
  ]);
  assert.equal(context.datasetChecks, 2);
  await assertMetadataOnlyJsonReports(join(context.root, 'reports', 'discovery'));

  await assert.rejects(
    runStage7SourceExpansionCli(discoveryArgs(), context),
    hasCode('REPORT_EXISTS')
  );
});

test('yield consumes exact discovery reports and writes only its canonical trio', async (t) => {
  const context = await populatedFixtureContext(t);
  await runStage7SourceExpansionCli(discoveryArgs(), context);
  const discovery = await readJson(join(context.root, 'reports', 'discovery', 'review-cards.json'));
  await writeJsonl(
    join(context.root, 'reviews', 'discovery-decisions.jsonl'),
    discovery.cards.map((card) => decisionFixture({
      candidate_id: card.candidate_id,
      decision: 'accept'
    }))
  );

  const result = await runStage7SourceExpansionCli(yieldArgs(), context);
  assert.equal(result.card_count, 20);
  assert.deepEqual((await readdir(join(context.root, 'reports', 'yield'))).sort(), [
    'review-cards.json',
    'review-cards.md',
    'source-summary.json'
  ]);
  assert.equal(context.datasetChecks, 4);
  await assertMetadataOnlyJsonReports(join(context.root, 'reports', 'yield'));
});

test('yield refuses discovery report inventory drift before consuming decisions', async (t) => {
  const context = await populatedFixtureContext(t);
  await runStage7SourceExpansionCli(discoveryArgs(), context);
  await writeFile(join(context.root, 'reports', 'discovery', 'extra.txt'), 'extra\n', 'utf8');

  await assert.rejects(
    runStage7SourceExpansionCli(yieldArgs(), context),
    hasCode('REPORT_INVENTORY_INVALID')
  );
});

test('finalize consumes both exact waves and writes only non-authorizing summaries', async (t) => {
  const context = await populatedFixtureContext(t);
  await runStage7SourceExpansionCli(discoveryArgs(), context);
  const discovery = await readJson(join(context.root, 'reports', 'discovery', 'review-cards.json'));
  await writeJsonl(
    join(context.root, 'reviews', 'discovery-decisions.jsonl'),
    discovery.cards.map((card) => decisionFixture({
      candidate_id: card.candidate_id,
      decision: 'accept'
    }))
  );
  await runStage7SourceExpansionCli(yieldArgs(), context);
  const yieldReport = await readJson(join(context.root, 'reports', 'yield', 'review-cards.json'));
  await writeJsonl(
    join(context.root, 'reviews', 'yield-decisions.jsonl'),
    yieldReport.cards.map((card) => decisionFixture({
      candidate_id: card.candidate_id,
      wave: 'yield',
      decision: 'accept'
    }))
  );

  const result = await runStage7SourceExpansionCli(finalizeArgs(), context);
  assert.equal(result.accepted_count, 50);
  assert.equal(result.metadata_only, true);
  assert.equal(result.authorizes_download, false);
  assert.equal(result.authorizes_training, false);
  assert.deepEqual((await readdir(join(context.root, 'reports', 'final'))).sort(), [
    'review-summary.json',
    'review-summary.md'
  ]);
  const summary = await readJson(join(context.root, 'reports', 'final', 'review-summary.json'));
  assert.equal(summary.metadata_only, true);
  assert.equal(summary.authorizes_download, false);
  assert.equal(summary.authorizes_training, false);
  const markdown = await readFile(join(context.root, 'reports', 'final', 'review-summary.md'), 'utf8');
  assert.match(markdown, /does not authorize download, Dataset admission, or training/iu);
  assert.doesNotMatch(markdown, /npm |curl |wget |\.local\/stage7-private-research/iu);
  assert.equal(context.datasetChecks, 6);
});

test('saved card identity drift blocks later commands', async (t) => {
  const context = await populatedFixtureContext(t);
  await runStage7SourceExpansionCli(discoveryArgs(), context);
  const reportPath = join(context.root, 'reports', 'discovery', 'review-cards.json');
  const report = await readJson(reportPath);
  report.cards.reverse();
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, 'utf8');
  await writeJsonl(join(context.root, 'reviews', 'discovery-decisions.jsonl'), []);

  await assert.rejects(
    runStage7SourceExpansionCli(yieldArgs(), context),
    hasCode('REPORT_DRIFT')
  );
});

test('README documents metadata-only source audit without acquisition authority', async () => {
  const readme = await readFile('README.md', 'utf8');
  assert.match(readme, /npm run audit:stage7:sources -- discovery/u);
  assert.match(readme, /metadata-only/u);
  assert.match(readme, /does not authorize download, Dataset admission, or training/iu);
});

test('synthetic source audit leaves formal Dataset manifests byte-identical', async (t) => {
  const before = await formalDatasetBytes();
  const context = await populatedFixtureContext(t);
  await runStage7SourceExpansionCli(discoveryArgs(), context);
  assert.deepEqual(await formalDatasetBytes(), before);
});

test('source expansion metadata implementation has no payload or network surface', async () => {
  const files = [
    'src/construction/learning/stage7SourceExpansionContracts.js',
    'src/construction/learning/stage7SourceExpansionRights.js',
    'src/construction/learning/stage7SourceExpansionRanking.js',
    'src/construction/learning/stage7SourceExpansionReview.js',
    'src/construction/learning/stage7SourceExpansionBoundary.js',
    'src/auditStage7SourceExpansion.js'
  ];
  const forbidden = [
    'http.request',
    'https.request',
    'fetch(',
    'axios',
    'playwright',
    'puppeteer',
    '.schematic',
    '.litematic',
    '.mcstructure',
    'child_process.spawn',
    'training/stage7'
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${file} contains ${token}`);
    }
  }
});

async function fixtureContext(t) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'stage7-source-expansion-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const context = {
    repositoryRoot,
    root: join(repositoryRoot, SOURCE_EXPANSION_ROOT_RELATIVE),
    datasetChecks: 0,
    gitStatus: async (args) => args[0] === 'check-ignore' ? 0 : 1,
    assertDatasetBoundary: async () => {
      context.datasetChecks += 1;
      return {
        dataset_hashes: {
          v1: 'a'.repeat(64),
          v2: 'b'.repeat(64),
          v3: 'c'.repeat(64)
        },
        dataset_v3_gate: {
          ready_for_m3_real_data: false,
          training_eligible_count: 0
        }
      };
    }
  };
  return context;
}

async function populatedFixtureContext(t) {
  const context = await fixtureContext(t);
  for (const directory of SOURCE_EXPANSION_DIRECTORIES) {
    await mkdir(join(context.root, directory), { recursive: true });
  }
  const candidates = [];
  const rights = [];
  for (let source = 1; source <= 10; source += 1) {
    for (let item = 1; item <= 8; item += 1) {
      const sourceId = `source-${String(source).padStart(2, '0')}`;
      const assetId = `item-${String(item).padStart(2, '0')}`;
      const candidateId = `${sourceId}:${assetId}`;
      candidates.push(candidateFixture({
        candidate_id: candidateId,
        source_id: sourceId,
        asset_id: assetId,
        signals: {
          ...candidateFixture().signals,
          popularity: 100 - item,
          reception: 100 - item
        }
      }));
      rights.push(rightsFixture({ candidate_id: candidateId }));
    }
  }
  await writeJsonl(join(context.root, 'metadata', 'candidates.jsonl'), candidates);
  await writeJsonl(join(context.root, 'evidence', 'rights.jsonl'), rights);
  return context;
}

function discoveryArgs() {
  return [
    'discovery', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--as-of', '2026-07-16', '--metadata-only'
  ];
}

function yieldArgs() {
  return [
    'yield', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--as-of', '2026-07-16', '--metadata-only'
  ];
}

function finalizeArgs() {
  return [
    'finalize', '--root', SOURCE_EXPANSION_ROOT_RELATIVE,
    '--as-of', '2026-07-16', '--metadata-only'
  ];
}

async function writeJsonl(path, records) {
  await writeFile(path, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function assertMetadataOnlyJsonReports(directory) {
  const filenames = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  for (const filename of filenames) {
    const report = await readJson(join(directory, filename));
    assert.equal(report.metadata_only, true, filename);
    assert.equal(report.authorizes_download, false, filename);
    assert.equal(report.authorizes_training, false, filename);
  }
}

async function formalDatasetBytes() {
  return Promise.all(['v1', 'v2', 'v3'].map(async (version) => ({
    version,
    bytes: (await readFile(
      `mc_templates/datasets/coarse_semantic_voxels/${version}/manifest.json`
    )).toString('base64')
  })));
}

function hasCode(code) {
  return (error) => error instanceof SourceExpansionBoundaryError && error.code === code;
}
