import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  fetchCourseSnapshot,
  parseArchitecturePlaybookCourseArgs,
  writeManifestFromSnapshot
} from '../src/runArchitecturePlaybookCourse.js';
import {
  bilibiliCourseSnapshotFixture
} from './fixtures/bilibiliCourseSnapshotFixture.js';

test('course CLI parser keeps snapshots private and manifest output canonical', () => {
  const projectRoot = path.join(os.tmpdir(), 'playbook-course-parser');
  const snapshot = '.local/architecture-playbook/work/season.json';
  const output = 'docs/architecture-playbook/course/course-manifest.json';

  const fetchOptions = parseArchitecturePlaybookCourseArgs([
    'fetch',
    '--bvid',
    'BV1HhEuzZEyZ',
    '--snapshot',
    snapshot
  ], { projectRoot });
  assert.equal(fetchOptions.command, 'fetch');
  assert.equal(fetchOptions.snapshotPath, path.join(projectRoot, snapshot));
  assert.equal(fetchOptions.replace, false);

  const manifestOptions = parseArchitecturePlaybookCourseArgs([
    'manifest',
    '--snapshot',
    snapshot,
    '--output',
    output,
    '--captured-at',
    '2026-08-25T00:00:00.000Z'
  ], { projectRoot });
  assert.equal(manifestOptions.outputPath, path.join(projectRoot, output));

  assert.throws(
    () => parseArchitecturePlaybookCourseArgs([
      'fetch', '--bvid', 'BV1HhEuzZEyZ', '--snapshot', '../outside.json'
    ], { projectRoot }),
    /PLAYBOOK_SNAPSHOT_PATH_INVALID/u
  );
  assert.throws(
    () => parseArchitecturePlaybookCourseArgs([
      'manifest', '--snapshot', snapshot, '--output', 'manifest.json',
      '--captured-at', '2026-08-25T00:00:00.000Z'
    ], { projectRoot }),
    /PLAYBOOK_MANIFEST_PATH_INVALID/u
  );
  assert.throws(
    () => parseArchitecturePlaybookCourseArgs([
      'manifest', '--snapshot', snapshot, '--output', output,
      '--captured-at', '2026-08-25T00:00:00.000Z', '--unknown', 'x'
    ], { projectRoot }),
    /PLAYBOOK_ARGUMENT_UNKNOWN/u
  );
});

test('offline manifest conversion is deterministic and writes one newline', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-course-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const snapshotPath = path.join(
    projectRoot,
    '.local/architecture-playbook/work/season.json'
  );
  const outputPath = path.join(
    projectRoot,
    'docs/architecture-playbook/course/course-manifest.json'
  );
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  const snapshotBytes = JSON.stringify(bilibiliFiftyEpisodeSnapshotFixture());
  await fs.writeFile(snapshotPath, snapshotBytes, 'utf8');

  const first = await writeManifestFromSnapshot({
    snapshotPath,
    outputPath,
    capturedAt: '2026-08-25T00:00:00.000Z',
    projectRoot
  });
  const firstBytes = await fs.readFile(outputPath, 'utf8');
  assert.equal(first.status, 'created');
  const manifest = JSON.parse(firstBytes);
  assert.equal(manifest.episodes.length, 50);
  assert.equal(
    manifest.source_snapshot_sha256,
    createHash('sha256').update(snapshotBytes).digest('hex')
  );
  assert.ok(firstBytes.endsWith('\n'));
  assert.ok(!firstBytes.endsWith('\n\n'));

  const second = await writeManifestFromSnapshot({
    snapshotPath,
    outputPath,
    capturedAt: '2026-08-25T00:00:00.000Z',
    projectRoot
  });
  assert.equal(second.status, 'unchanged');
  assert.equal(await fs.readFile(outputPath, 'utf8'), firstBytes);
});

test('snapshot acquisition refuses silent replacement of different bytes', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-fetch-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  const snapshotPath = path.join(
    projectRoot,
    '.local/architecture-playbook/work/season.json'
  );
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, '{"old":true}', 'utf8');

  const body = JSON.stringify(bilibiliFiftyEpisodeSnapshotFixture());
  const fetchImpl = async () => new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
  await assert.rejects(
    fetchCourseSnapshot({
      bvid: 'BV1HhEuzZEyZ',
      snapshotPath,
      projectRoot,
      replace: false,
      fetchImpl
    }),
    /PLAYBOOK_SNAPSHOT_CONFLICT/u
  );
  assert.equal(await fs.readFile(snapshotPath, 'utf8'), '{"old":true}');
});

test('snapshot acquisition rejects a private-path symlink escape', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-link-'));
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'playbook-outside-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));
  t.after(() => fs.rm(outsideRoot, { recursive: true, force: true }));
  const privateRoot = path.join(projectRoot, '.local/architecture-playbook');
  await fs.mkdir(privateRoot, { recursive: true });
  await fs.symlink(outsideRoot, path.join(privateRoot, 'work'), 'dir');
  const snapshotPath = path.join(privateRoot, 'work/season.json');
  const body = JSON.stringify(bilibiliFiftyEpisodeSnapshotFixture());

  await assert.rejects(
    fetchCourseSnapshot({
      bvid: 'BV1HhEuzZEyZ',
      snapshotPath,
      projectRoot,
      replace: false,
      fetchImpl: async () => new Response(body, { status: 200 })
    }),
    /PLAYBOOK_SNAPSHOT_SYMLINK_ESCAPE/u
  );
  await assert.rejects(fs.access(path.join(outsideRoot, 'season.json')));
});

function bilibiliFiftyEpisodeSnapshotFixture() {
  const snapshot = bilibiliCourseSnapshotFixture();
  const episodes = snapshot.data.ugc_season.sections[0].episodes;
  for (let index = episodes.length; index < 50; index += 1) {
    const source = structuredClone(episodes[0]);
    const suffix = `aaaaaaa${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}`;
    const bvid = `BV1${suffix}`;
    source.id = 200000000 + index;
    source.aid = 115000000000000 + index;
    source.cid = 31000000000 + index;
    source.bvid = bvid;
    source.title = `fixture-${index + 1}`;
    source.arc.aid = source.aid;
    source.arc.pubdate += index;
    source.arc.stat.view += index;
    source.page.cid = source.cid;
    source.page.part = `Fixture Episode ${index + 1}`;
    source.pages[0].cid = source.cid;
    source.pages[0].part = source.page.part;
    episodes.push(source);
  }
  snapshot.data.ugc_season.ep_count = 50;
  return snapshot;
}
