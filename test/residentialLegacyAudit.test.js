import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  initializeResidentialWorkspace
} from '../src/training/residential/workspace/index.js';
import {
  auditLegacyTemplates,
  quarantineArtifact
} from '../src/training/residential/intake/index.js';
import {
  classicSchematic
} from './fixtures/residentialIntakeFixtures.js';

async function fixture(t) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-legacy-'));
  t.after(() => removeFixture(projectRoot));
  const legacyRoot = path.join(projectRoot, 'mc_templates');
  await fs.mkdir(path.join(projectRoot, '.local'));
  await fs.mkdir(path.join(legacyRoot, 'House'), { recursive: true });
  await fs.mkdir(path.join(legacyRoot, 'Tower'), { recursive: true });
  await fs.mkdir(path.join(legacyRoot, 'analysis'), { recursive: true });
  await fs.writeFile(
    path.join(legacyRoot, 'House', 'House.schematic'),
    classicSchematic()
  );
  await fs.writeFile(
    path.join(legacyRoot, 'Tower', 'Tower.schematic'),
    classicSchematic({ blockId: 5 })
  );
  await fs.writeFile(
    path.join(legacyRoot, 'analysis', 'labels.generated.jsonl'),
    JSON.stringify({
      file: 'Tower/Tower.schematic',
      title: 'Tower',
      source: 'https://example.invalid/tower'
    }) + '\n'
  );
  const root = path.join(projectRoot, '.local', 'residential-model');
  await initializeResidentialWorkspace({ root, projectRoot });
  return { projectRoot, legacyRoot, root };
}

test('legacy audit examines every supported template and treats folders as hints', async (t) => {
  const local = await fixture(t);
  const report = await auditLegacyTemplates(local);
  assert.equal(report.summary.candidate_count, 2);
  assert.equal(report.summary.house_hint_count, 1);
  assert.equal(report.summary.other_hint_count, 1);
  assert.equal(
    report.candidates.find((item) => item.folder_hint === 'Tower').reason,
    'non_residential_reference_only'
  );
  assert.equal(
    report.candidates.find((item) => item.folder_hint === 'House').reason,
    'missing_provenance'
  );
});

test('legacy audit does not copy, move, rewrite, or profile templates', async (t) => {
  const local = await fixture(t);
  const before = await snapshot(local.legacyRoot);
  await auditLegacyTemplates(local);
  const after = await snapshot(local.legacyRoot);
  assert.deepEqual(after, before);
  assert.deepEqual(
    await fs.readdir(path.join(local.root, 'quarantine')),
    []
  );
  assert.deepEqual(await fs.readdir(path.join(local.root, 'sources')), []);
});

test('legacy audit is confined to project mc_templates and deterministic', async (t) => {
  const local = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-legacy-'));
  t.after(() => removeFixture(outside));
  await assert.rejects(
    auditLegacyTemplates({ ...local, legacyRoot: outside }),
    /LEGACY_ROOT_OUTSIDE_PROJECT/u
  );
  const first = await auditLegacyTemplates(local);
  const second = await auditLegacyTemplates(local);
  assert.deepEqual(second, first);
});

test('legacy audit detects duplicates within legacy and against new quarantine', async (t) => {
  const local = await fixture(t);
  const duplicate = path.join(
    local.legacyRoot,
    'House',
    'ZZ Duplicate House.schematic'
  );
  await fs.writeFile(
    duplicate,
    await fs.readFile(
      path.join(local.legacyRoot, 'House', 'House.schematic')
    )
  );
  const towerBytes = await fs.readFile(
    path.join(local.legacyRoot, 'Tower', 'Tower.schematic')
  );
  await quarantineArtifact({
    root: local.root,
    projectRoot: local.projectRoot,
    bytes: towerBytes,
    sha256: createHash('sha256').update(towerBytes).digest('hex')
  });
  const report = await auditLegacyTemplates(local);
  assert.equal(report.summary.duplicate_count, 2);
  const detected = report.candidates.find(
    (item) => item.relative_path === 'House/ZZ Duplicate House.schematic'
  );
  assert.equal(detected.reason, 'exact_duplicate');
  assert.equal(
    detected.duplicate_of,
    'legacy:House/House.schematic'
  );
  assert.match(
    report.candidates.find(
      (item) => item.relative_path === 'Tower/Tower.schematic'
    ).duplicate_of,
    /^case-[a-f0-9]{24}$/u
  );
});

test('legacy audit rejects source symlinks, ignores generated folders, and never follows them', async (t) => {
  const local = await fixture(t);
  const outside = path.join(local.projectRoot, 'outside.schematic');
  await fs.writeFile(outside, classicSchematic({ blockId: 4 }));
  await fs.symlink(
    outside,
    path.join(local.legacyRoot, 'House', 'linked.schematic')
  );
  await fs.writeFile(
    path.join(local.legacyRoot, 'analysis', 'ignored.schematic'),
    classicSchematic()
  );
  await fs.mkdir(path.join(local.legacyRoot, 'curation'), { recursive: true });
  await fs.writeFile(
    path.join(local.legacyRoot, 'curation', 'ignored.nbt'),
    classicSchematic()
  );
  const report = await auditLegacyTemplates(local);
  assert.equal(report.summary.candidate_count, 3);
  const linked = report.candidates.find(
    (item) => item.relative_path === 'House/linked.schematic'
  );
  assert.deepEqual(
    [linked.outcome, linked.reason, linked.artifact_sha256, linked.occupied_extent],
    ['rejected', 'malformed_or_unsafe_source', null, null]
  );
  assert.equal((await fs.lstat(outside)).isFile(), true);
});

test('legacy audit normalizes metadata and applies exact outcome precedence', async (t) => {
  const local = await fixture(t);
  await fs.writeFile(
    path.join(local.legacyRoot, 'analysis', 'labels.generated.jsonl'),
    [
      JSON.stringify({
        file: './House/House.schematic',
        source_url: 'ftp://example.invalid/not-accepted'
      }),
      JSON.stringify({
        file: 'Tower/Tower.schematic',
        title: 'Custom tower',
        source_url: 'https://example.invalid/tower'
      })
    ].join('\n') + '\n'
  );
  await fs.writeFile(
    path.join(local.legacyRoot, 'House', 'Named - (mcbuild_org).schematic'),
    classicSchematic({ blockId: 3 })
  );
  const report = await auditLegacyTemplates(local);
  const house = report.candidates.find(
    (item) => item.relative_path === 'House/House.schematic'
  );
  const tower = report.candidates.find(
    (item) => item.relative_path === 'Tower/Tower.schematic'
  );
  const named = report.candidates.find(
    (item) => item.relative_path === 'House/Named - (mcbuild_org).schematic'
  );
  assert.equal(house.source_url, null);
  assert.equal(house.reason, 'missing_provenance');
  assert.equal(tower.title, 'Custom tower');
  assert.equal(tower.reason, 'non_residential_reference_only');
  assert.equal(named.title, 'Named');
});

test('legacy audit ignores metadata behind a symlinked analysis ancestor', async (t) => {
  const local = await fixture(t);
  const external = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-legacy-metadata-'));
  t.after(() => removeFixture(external));
  await fs.writeFile(
    path.join(external, 'labels.generated.jsonl'),
    JSON.stringify({
      file: 'House/House.schematic',
      title: 'External provenance must not be read',
      source_url: 'https://example.invalid/external'
    }) + '\n'
  );
  await fs.rm(path.join(local.legacyRoot, 'analysis'), {
    recursive: true,
    force: true
  });
  await fs.symlink(external, path.join(local.legacyRoot, 'analysis'));
  const report = await auditLegacyTemplates(local);
  const house = report.candidates.find(
    (item) => item.relative_path === 'House/House.schematic'
  );
  assert.deepEqual(
    [house.title, house.source_url, house.outcome, house.reason],
    ['House', null, 'deferred', 'missing_provenance']
  );
});

test('legacy audit ignores custom metadata behind a symlinked nested ancestor', async (t) => {
  const local = await fixture(t);
  const external = await fs.mkdtemp(path.join(os.tmpdir(), 'r2-legacy-nested-'));
  t.after(() => removeFixture(external));
  await fs.writeFile(
    path.join(external, 'labels.jsonl'),
    JSON.stringify({
      file: 'House/House.schematic',
      title: 'Nested external provenance must not be read',
      source_url: 'https://example.invalid/nested-external'
    }) + '\n'
  );
  await fs.symlink(external, path.join(local.legacyRoot, 'analysis', 'nested'));
  const report = await auditLegacyTemplates({
    ...local,
    metadataFile: path.join(local.legacyRoot, 'analysis', 'nested', 'labels.jsonl')
  });
  const house = report.candidates.find(
    (item) => item.relative_path === 'House/House.schematic'
  );
  assert.deepEqual(
    [house.title, house.source_url, house.outcome, house.reason],
    ['House', null, 'deferred', 'missing_provenance']
  );
});

test('legacy audit reads confined custom metadata through regular nested directories', async (t) => {
  const local = await fixture(t);
  const nested = path.join(local.legacyRoot, 'analysis', 'nested');
  const metadata = path.join(nested, 'labels.jsonl');
  await fs.mkdir(nested);
  await fs.writeFile(
    metadata,
    JSON.stringify({
      file: 'House/House.schematic',
      title: 'Pinned house metadata',
      source_url: 'https://example.invalid/pinned-house'
    }) + '\n'
  );
  const report = await auditLegacyTemplates({ ...local, metadataFile: metadata });
  const house = report.candidates.find(
    (item) => item.relative_path === 'House/House.schematic'
  );
  assert.deepEqual(
    [house.title, house.source_url, house.outcome, house.reason],
    [
      'Pinned house metadata',
      'https://example.invalid/pinned-house',
      'parsed',
      'residential_candidate_requires_review'
    ]
  );
});

test('legacy audit ignores a symlinked final metadata file', async (t) => {
  const local = await fixture(t);
  const external = path.join(local.projectRoot, 'external-labels.jsonl');
  await fs.writeFile(
    external,
    JSON.stringify({
      file: 'House/House.schematic',
      title: 'Final symlink provenance must not be read',
      source_url: 'https://example.invalid/final-symlink'
    }) + '\n'
  );
  const metadata = path.join(local.legacyRoot, 'analysis', 'labels.generated.jsonl');
  await fs.rm(metadata);
  await fs.symlink(external, metadata);
  const report = await auditLegacyTemplates(local);
  const house = report.candidates.find(
    (item) => item.relative_path === 'House/House.schematic'
  );
  assert.deepEqual(
    [house.title, house.source_url, house.outcome, house.reason],
    ['House', null, 'deferred', 'missing_provenance']
  );
});

test('legacy audit fails closed on a writable quarantine lookalike', async (t) => {
  const local = await fixture(t);
  const houseBytes = await fs.readFile(
    path.join(local.legacyRoot, 'House', 'House.schematic')
  );
  const caseId = `case-${createHash('sha256').update(houseBytes).digest('hex').slice(0, 24)}`;
  const forged = path.join(local.root, 'quarantine', caseId);
  await fs.mkdir(forged, { mode: 0o700 });
  await fs.writeFile(path.join(forged, 'payload'), houseBytes, { mode: 0o600 });
  const before = await snapshot(path.join(local.root, 'quarantine'));
  await assert.rejects(auditLegacyTemplates(local), /QUARANTINE_CONFLICT/u);
  assert.deepEqual(await snapshot(path.join(local.root, 'quarantine')), before);
});

test('legacy parser limits defer before provenance and reports are immutable', async (t) => {
  const local = await fixture(t);
  await fs.writeFile(
    path.join(local.legacyRoot, 'House', 'too-large.schematic'),
    classicSchematic({ width: 4097, height: 4097, length: 1, blocks: [1] })
  );
  const first = await auditLegacyTemplates(local);
  const large = first.candidates.find(
    (item) => item.relative_path === 'House/too-large.schematic'
  );
  assert.deepEqual(
    [large.outcome, large.reason, large.artifact_sha256, large.occupied_extent],
    ['deferred', 'parser_limit', null, null]
  );
  assert.equal(Object.isFrozen(first), true);
  await fs.writeFile(
    path.join(local.legacyRoot, 'House', 'after-report.schematic'),
    classicSchematic({ blockId: 4 })
  );
  await assert.rejects(auditLegacyTemplates(local), /IMMUTABLE_JSON_CONFLICT/u);
});

async function snapshot(root) {
  const output = [];
  await visit(root, '');
  return output;
  async function visit(directory, relative) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childRelative = path.posix.join(relative, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, childRelative);
      else output.push([
        childRelative,
        (await fs.readFile(absolute)).toString('base64')
      ]);
    }
  }
}

async function removeFixture(root) {
  const entry = await fs.lstat(root).catch(() => null);
  if (entry?.isDirectory() && !entry.isSymbolicLink()) {
    await fs.chmod(root, 0o700);
    const entries = await fs.readdir(root, { withFileTypes: true });
    await Promise.all(entries.map((item) => removeFixture(path.join(root, item.name))));
  }
  await fs.rm(root, { recursive: true, force: true });
}
