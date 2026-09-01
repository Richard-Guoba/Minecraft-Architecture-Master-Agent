import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileBlindComparison,
  revealPreferenceResults,
  sealPreferences,
  validateBlindComparisonPackage,
  validatePrivateComparisonAuthority,
  validatePreferenceAgainstManifest
} from '../src/playbook/p6/comparisons.js';
import { P6_COMPARISON_ALIASES, P6_PROTOCOL_FILE_HASHES, P6_REASON_TAGS, P6_VIEW_IDS } from '../src/playbook/p6/constants.js';
import { parseP6Args, runP6Cli } from '../src/runArchitecturePlaybookP6.js';
import { createP6Run, publishP6Generation, readCurrentP6Generation } from '../src/playbook/p6/storage.js';
import { sha256, stableJson } from '../src/playbook/shadow/canonical.js';
import { createP6CaptureInputs, p6CaptureHash } from './fixtures/playbookP6Captures.js';

const REAL_IDS = ['playbook-candidate-01', 'playbook-candidate-02', 'playbook-candidate-03', 'baseline-current'];
const OPAQUE_IDS = ['alpha', 'bravo', 'charlie', 'delta'].map(value => `opaque-solution-${value}`);
const GENERATED_AT = '2026-08-30T10:05:00.000Z';

test('compiles all six unordered pairs once with deterministic unbiased injected randomness', () => {
  const context = fixture();
  const first = compileBlindComparison({
    ...context, randomBytes: deterministicBytes([255, 7, 3, 1, 9, 2, 8, 4]),
    generatedAt: GENERATED_AT
  });
  const second = compileBlindComparison({
    ...context, randomBytes: deterministicBytes([255, 7, 3, 1, 9, 2, 8, 4]),
    generatedAt: GENERATED_AT
  });
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(first.publicManifest.pairs.length, 6);
  assert.deepEqual(first.publicManifest.solution_codes, P6_COMPARISON_ALIASES);
  const unordered = first.publicManifest.pairs.map(row => [row.left_code, row.right_code].sort().join('/'));
  assert.equal(new Set(unordered).size, 6);
  assert.deepEqual([...unordered].sort(), [
    'solution-A/solution-B', 'solution-A/solution-C', 'solution-A/solution-D',
    'solution-B/solution-C', 'solution-B/solution-D', 'solution-C/solution-D'
  ]);
  assert.ok(first.publicManifest.pairs.some(row => row.left_code > row.right_code));
  assert.ok(first.publicManifest.pairs.some(row => row.left_code < row.right_code));
});

test('uses rejection sampling instead of modulo bias for non-power-of-two draws', () => {
  const draws = [0, 0, 255, 1];
  let calls = 0;
  compileBlindComparison({
    ...fixture(),
    randomBytes: length => Buffer.alloc(length, draws[calls++] ?? 0),
    generatedAt: GENERATED_AT
  });
  assert.equal(calls, 40);
});

test('bounds rejected or faulty entropy and fails with the stable comparison code', () => {
  let calls = 0;
  assert.throws(
    () => compileBlindComparison({
      ...fixture(), randomBytes: length => {
        calls += 1;
        return Buffer.alloc(length, 255);
      }, generatedAt: GENERATED_AT
    }),
    { code: 'P6_COMPARISON_INVALID' }
  );
  assert.ok(calls <= 130, `unbounded entropy calls: ${calls}`);
  assert.throws(
    () => compileBlindComparison({
      ...fixture(), randomBytes: () => Buffer.alloc(0), generatedAt: GENERATED_AT
    }),
    { code: 'P6_COMPARISON_INVALID' }
  );
});

test('keeps identity private while public files bind exact aligned screenshots without identity leaks', () => {
  const context = fixture();
  const bundle = compileBlindComparison({ ...context, randomBytes: deterministicBytes([4, 3, 2, 1]), generatedAt: GENERATED_AT });
  assert.equal(bundle.publicComparisons.length, 6);
  assert.deepEqual(bundle.publicPresentation.pair_ids, bundle.publicComparisons.map(row => row.pair_id));
  for (const comparison of bundle.publicComparisons) {
    assert.match(comparison.filename, /^pair-\d{2}\.json$/u);
    assert.equal(comparison.left.screenshots.length, 6);
    assert.equal(comparison.right.screenshots.length, 6);
    assert.deepEqual(comparison.left.screenshots.map(row => row.view_id), P6_VIEW_IDS);
    assert.deepEqual(comparison.right.screenshots.map(row => row.view_id), P6_VIEW_IDS);
    for (const screenshot of [...comparison.left.screenshots, ...comparison.right.screenshots]) {
      assert.match(screenshot.screenshot_id, /^blind-shot-[a-f0-9]{32}$/u);
      assert.equal(screenshot.filename, `${screenshot.screenshot_id}.png`);
      assert.equal(Object.hasOwn(screenshot, 'image_sha256'), false);
    }
  }
  const presented = bundle.publicComparisons.flatMap(row => [row.left, row.right])
    .flatMap(side => side.screenshots);
  assert.equal(presented.length, 72);
  assert.equal(new Set(presented.map(row => row.screenshot_id)).size, 24);
  for (const code of P6_COMPARISON_ALIASES) {
    for (const viewId of P6_VIEW_IDS) {
      const references = bundle.publicComparisons.flatMap(row => [row.left, row.right])
        .filter(side => side.solution_code === code)
        .flatMap(side => side.screenshots.filter(row => row.view_id === viewId));
      assert.equal(references.length, 3);
      assert.equal(new Set(references.map(row => row.screenshot_id)).size, 1);
    }
  }
  const publicJson = stableJson({ comparisons: bundle.publicComparisons, presentation: bundle.publicPresentation });
  for (const forbidden of [...REAL_IDS, 'candidate', 'baseline', 'rank', '/tmp/', 'provider', 'prompt']) {
    assert.equal(publicJson.includes(forbidden), false, forbidden);
  }
  for (const image of context.captureManifest.images) {
    assert.equal(publicJson.includes(image.screenshot_id), false, image.screenshot_id);
    assert.equal(publicJson.includes(image.image_sha256), false, image.image_sha256);
    assert.equal(publicJson.includes(image.build_function_sha256), false, image.build_function_sha256);
  }
  assert.equal(bundle.privateIdentityMap.identity_nonce_hex.length, 64);
  assert.equal(bundle.privateIdentityMap.screenshot_mappings.length, 24);
  assert.equal(stableJson(bundle.privateIdentityMap).includes('playbook-candidate-01'), true);
  assert.equal(bundle.publicManifest.identity_map_sha256, sha256(stableJson(bundle.privateIdentityMap)));
  assert.equal(bundle.publicManifest.randomization_sha256, sha256(stableJson(bundle.privateRandomization)));
  assert.equal(bundle.publicManifest.cohort_sha256, sha256(stableJson(context.cohort)));
  assert.equal(bundle.publicManifest.capture_manifest_hash, sha256(stableJson(context.captureManifest)));

  const enumerable = permutations(REAL_IDS).map(solutionIds => ({
    schema_version: 1,
    protocol_version: '0.1.0',
    cohort_sha256: bundle.privateIdentityMap.cohort_sha256,
    capture_manifest_hash: bundle.privateIdentityMap.capture_manifest_hash,
    mappings: P6_COMPARISON_ALIASES.map((solution_code, index) => ({
      solution_code,
      solution_id: solutionIds[index],
      capture_solution_id: OPAQUE_IDS[REAL_IDS.indexOf(solutionIds[index])]
    }))
  }));
  assert.equal(enumerable.length, 24);
  assert.equal(enumerable.some(value => sha256(stableJson(value)) === bundle.publicManifest.identity_map_sha256), false);
});

test('manifest binds the exact six pair artifacts and presentation order', () => {
  const context = fixture();
  const bundle = compileBlindComparison({ ...context, randomBytes: deterministicBytes([7, 3, 1]), generatedAt: GENERATED_AT });
  assert.deepEqual(validateBlindComparisonPackage(bundle), bundle);
  assert.equal(validatePrivateComparisonAuthority({
    ...bundle, cohort: context.cohort, captureManifest: context.captureManifest
  }), true);
  for (const mutate of [
    value => { value.publicComparisons[0].left.screenshots[0].screenshot_id = 'blind-shot-' + 'f'.repeat(32); },
    value => { [value.publicComparisons[0], value.publicComparisons[1]] = [value.publicComparisons[1], value.publicComparisons[0]]; },
    value => { [value.publicPresentation.pair_ids[0], value.publicPresentation.pair_ids[1]] = [value.publicPresentation.pair_ids[1], value.publicPresentation.pair_ids[0]]; }
  ]) {
    const changed = structuredClone(bundle);
    mutate(changed);
    assert.throws(() => validateBlindComparisonPackage(changed), { code: 'P6_COMPARISON_INVALID' });
  }

  const swappedSources = structuredClone(bundle);
  const first = swappedSources.privateIdentityMap.screenshot_mappings[0];
  const other = swappedSources.privateIdentityMap.screenshot_mappings.find(row => row.source_screenshot_id !== first.source_screenshot_id);
  [first.source_screenshot_id, other.source_screenshot_id] = [other.source_screenshot_id, first.source_screenshot_id];
  [first.source_filename, other.source_filename] = [other.source_filename, first.source_filename];
  [first.source_image_sha256, other.source_image_sha256] = [other.source_image_sha256, first.source_image_sha256];
  swappedSources.publicManifest.identity_map_sha256 = sha256(stableJson(swappedSources.privateIdentityMap));
  assert.throws(() => validatePrivateComparisonAuthority({
    ...swappedSources, cohort: context.cohort, captureManifest: context.captureManifest
  }), { code: 'P6_COMPARISON_INVALID' });
});

test('rejects drifted, incomplete, or ambiguously bound cohort and capture authorities', () => {
  const context = fixture();
  for (const mutate of [
    value => { value.captureManifest.cohort_sha256 = p6CaptureHash('drift'); },
    value => { value.captureManifest.images.pop(); },
    value => { value.captureManifest.images[0].build_function_sha256 = value.cohort.solutions[1].build_function_sha256; },
    value => { value.cohort.solutions[1].build_function_sha256 = value.cohort.solutions[0].build_function_sha256; }
  ]) {
    const changed = structuredClone(context);
    mutate(changed);
    assert.throws(
      () => compileBlindComparison({ ...changed, randomBytes: deterministicBytes([1]), generatedAt: GENERATED_AT }),
      { code: 'P6_COMPARISON_INVALID' }
    );
  }
});

test('validates only exact human choices bound to one public pair and never fills missing choices', () => {
  const bundle = compileBlindComparison({ ...fixture(), randomBytes: deterministicBytes([2]), generatedAt: GENERATED_AT });
  const manifestHash = sha256(stableJson(bundle.publicManifest));
  const valid = preference(bundle.publicManifest.pairs[0].pair_id, manifestHash);
  assert.deepEqual(validatePreferenceAgainstManifest(valid, bundle.publicManifest), valid);
  for (const mutate of [
    value => { value.choice = 'candidate'; },
    value => { value.confidence = 'certain'; },
    value => { value.reason_tags = [P6_REASON_TAGS[0], P6_REASON_TAGS[0]]; },
    value => { value.reason_tags = ['weighted-score']; },
    value => { value.pair_id = 'pair-99'; },
    value => { value.comparison_manifest_hash = p6CaptureHash('other'); },
    value => { value.reviewer_kind = 'model'; },
    value => { value.rationale = 'x'.repeat(401); },
    value => { value.solution_id = REAL_IDS[0]; },
    value => { delete value.choice; }
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() => validatePreferenceAgainstManifest(changed, bundle.publicManifest), { code: 'P6_COMPARISON_INVALID' });
  }
});

test('seals exactly six unique complete records under one bounded reviewer pseudonym', () => {
  const bundle = compileBlindComparison({ ...fixture(), randomBytes: deterministicBytes([5]), generatedAt: GENERATED_AT });
  const manifestHash = sha256(stableJson(bundle.publicManifest));
  const records = bundle.publicManifest.pairs.map((row, index) => preference(row.pair_id, manifestHash, {
    choice: ['left', 'right', 'tie'][index % 3], reason_tags: index ? [] : ['facade']
  }));
  const sealed = sealPreferences({ publicManifest: bundle.publicManifest, records, reviewerPseudonym: 'reviewer-owl-17' });
  assert.equal(sealed.status, 'sealed');
  assert.equal(sealed.reviewer_pseudonym, 'reviewer-owl-17');
  assert.equal(sealed.records.length, 6);
  assert.equal(sealed.sealed_preference_hashes.length, 6);
  assert.equal(JSON.stringify(sealed).includes('playbook-candidate'), false);
  for (const invalid of [records.slice(0, 5), [...records, records[0]], records.map((row, index) => index ? row : { ...row, pair_id: 'pair-02' })]) {
    assert.throws(
      () => sealPreferences({ publicManifest: bundle.publicManifest, records: invalid, reviewerPseudonym: 'reviewer-owl-17' }),
      { code: invalid.length < 6 ? 'P6_HUMAN_PREFERENCE_REQUIRED' : 'P6_COMPARISON_INVALID' }
    );
  }
  assert.throws(() => sealPreferences({ publicManifest: bundle.publicManifest, records, reviewerPseudonym: '../real name' }), { code: 'P6_COMPARISON_INVALID' });
});

test('reveals identities only after sealing and returns categorical pair decisions and counts', () => {
  const bundle = compileBlindComparison({ ...fixture(), randomBytes: deterministicBytes([6]), generatedAt: GENERATED_AT });
  const manifestHash = sha256(stableJson(bundle.publicManifest));
  const records = bundle.publicManifest.pairs.map((row, index) => preference(row.pair_id, manifestHash, {
    choice: index < 2 ? 'left' : index < 5 ? 'right' : 'tie'
  }));
  assert.throws(
    () => revealPreferenceResults({ sealedPreferences: { status: 'draft', records }, privateIdentityMap: bundle.privateIdentityMap }),
    { code: 'P6_HUMAN_PREFERENCE_REQUIRED' }
  );
  const result = revealPreferenceResults({
    sealedPreferences: sealPreferences({ publicManifest: bundle.publicManifest, records, reviewerPseudonym: 'reviewer-owl-17' }),
    privateIdentityMap: bundle.privateIdentityMap
  });
  assert.deepEqual(result.categorical_counts, { left: 2, right: 3, tie: 1 });
  assert.equal(result.pair_decisions.length, 6);
  assert.equal(JSON.stringify(result).includes('score'), false);
  assert.equal(JSON.stringify(result).includes('weight'), false);

  const sealed = sealPreferences({ publicManifest: bundle.publicManifest, records, reviewerPseudonym: 'reviewer-owl-17' });
  const forgedChoice = structuredClone(sealed);
  forgedChoice.records[0].choice = 'weighted-winner';
  assert.throws(
    () => revealPreferenceResults({ sealedPreferences: forgedChoice, privateIdentityMap: bundle.privateIdentityMap }),
    { code: 'P6_COMPARISON_INVALID' }
  );
  const forgedHash = structuredClone(sealed);
  forgedHash.sealed_preference_hashes[0] = p6CaptureHash('forged');
  assert.throws(
    () => revealPreferenceResults({ sealedPreferences: forgedHash, privateIdentityMap: bundle.privateIdentityMap }),
    { code: 'P6_COMPARISON_INVALID' }
  );
  const forgedIdentity = structuredClone(bundle.privateIdentityMap);
  forgedIdentity.mappings[0].solution_id = forgedIdentity.mappings[1].solution_id;
  const reboundSeal = structuredClone(sealed);
  reboundSeal.identity_map_sha256 = sha256(stableJson(forgedIdentity));
  assert.throws(
    () => revealPreferenceResults({ sealedPreferences: reboundSeal, privateIdentityMap: forgedIdentity }),
    { code: 'P6_COMPARISON_INVALID' }
  );
});

test('CLI parses exact comparison actions and publishes no private identity in responses', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-comparison-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const importFile = path.join(root, 'preferences.json');
  assert.deepEqual(parseP6Args(['prepare-comparisons', '--run-dir', root]), { action: 'prepare-comparisons', runDir: root });
  assert.deepEqual(parseP6Args(['import-preferences', '--run-dir', root, '--file', importFile]), {
    action: 'import-preferences', runDir: root, file: importFile
  });
  assert.throws(() => parseP6Args(['prepare-comparisons', '--run-dir', root, '--file', importFile]), { code: 'P6_OPTIONS_INVALID' });

  const context = fixture();
  const reads = authorities(context);
  const calls = [];
  const result = await runP6Cli(['prepare-comparisons', '--run-dir', root], {
    admitP6Run: async () => ({ close: async () => calls.push(['close']) }),
    readCurrentP6Generation: async ({ kind }) => reads[kind],
    compileBlindComparison: options => compileBlindComparison({
      ...options, randomBytes: deterministicBytes([9, 8, 7, 6]), generatedAt: GENERATED_AT
    }),
    randomBytes: deterministicBytes([1]),
    now: () => new Date(GENERATED_AT),
    publishP6Generation: async options => {
      calls.push(options);
      assert.equal(Object.keys(options.files).some(name => name.startsWith('private/')), true);
      const imageEntries = Object.entries(options.files).filter(([name]) => /^blind-shot-.*\.png$/u.test(name));
      assert.equal(imageEntries.length, 24);
      assert.equal(new Set(imageEntries.map(([, value]) => value)).size, 24);
      const sourceBuffers = new Set(Object.entries(reads['minecraft-captures'].files)
        .filter(([name]) => /^capture-.*\.png$/u.test(name)).map(([, value]) => value));
      assert.equal(imageEntries.every(([, value]) => sourceBuffers.has(value)), true);
      assert.equal(Object.keys(options.files).some(name => /^capture-.*\.png$/u.test(name)), false);
      return { generation: 'generation-000001', manifest_sha256: p6CaptureHash('publication') };
    },
    stableJson, sha256
  });
  assert.equal(result.status, 'comparisons-prepared');
  assert.equal(JSON.stringify(result).includes('identity'), false);
  assert.equal(JSON.stringify(result).includes('playbook-candidate'), false);
  assert.deepEqual(calls[0].expectedCurrent, [
    { kind: 'cohort', generation: 'generation-000001', manifest_sha256: reads.cohort.manifest_sha256 },
    { kind: 'minecraft-captures', generation: 'generation-000001', manifest_sha256: reads['minecraft-captures'].manifest_sha256 },
    { kind: 'blind-comparison', generation: null, manifest_sha256: null }
  ]);
});

test('CLI imports all six user records atomically without returning private map or rationale', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-preference-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const context = fixture();
  const bundle = compileBlindComparison({ ...context, randomBytes: deterministicBytes([3]), generatedAt: GENERATED_AT });
  const manifestHash = sha256(stableJson(bundle.publicManifest));
  const records = bundle.publicManifest.pairs.map(row => preference(row.pair_id, manifestHash));
  const currentBlindFiles = comparisonPublicFiles(bundle);
  const importFile = path.join(root, 'preferences.json');
  await fs.writeFile(importFile, stableJson({ reviewer_pseudonym: 'reviewer-owl-17', records }));
  const calls = [];
  const result = await runP6Cli(['import-preferences', '--run-dir', root, '--file', importFile], {
    admitP6Run: async () => ({ close: async () => calls.push(['close']) }),
    readCurrentP6Generation: async ({ kind, includePrivate }) => {
      if (kind === 'cohort') return {
        generation: 'generation-000003', manifest_sha256: p6CaptureHash('cohort-generation'),
        files: { 'cohort.json': Buffer.from(stableJson({ schema_version: 1, cohort: context.cohort })) }
      };
      if (kind === 'minecraft-captures') return {
        generation: 'generation-000004', manifest_sha256: p6CaptureHash('capture-generation'),
        files: { 'capture-manifest.json': Buffer.from(stableJson(context.captureManifest)) }
      };
      assert.equal(kind, 'blind-comparison');
      assert.equal(includePrivate, true);
      return {
        generation: 'generation-000001', manifest_sha256: p6CaptureHash('blind-generation'),
        files: currentBlindFiles,
        privateFiles: {
          'identity-map.json': Buffer.from(stableJson(bundle.privateIdentityMap)),
          'randomization.json': Buffer.from(stableJson(bundle.privateRandomization))
        }
      };
    },
    sealPreferences,
    validateBlindComparisonPackage,
    validatePrivateComparisonAuthority,
    publishP6Generation: async options => {
      calls.push(options);
      for (const [name, value] of Object.entries(options.files)) {
        if (/^blind-shot-.*\.png$/u.test(name)) assert.equal(value, currentBlindFiles[name]);
      }
      return { generation: 'generation-000002', manifest_sha256: p6CaptureHash('sealed-generation') };
    },
    stableJson, sha256
  });
  assert.deepEqual(result, {
    status: 'preferences-sealed', preference_record_count: 6,
    comparison_manifest_hash: manifestHash, output: 'blind-comparison/generation-000002'
  });
  assert.equal(JSON.stringify(result).includes('reviewer-owl'), false);
  assert.equal(JSON.stringify(result).includes('rationale'), false);
  assert.deepEqual(calls[0].expectedCurrent, [
    { kind: 'cohort', generation: 'generation-000003', manifest_sha256: p6CaptureHash('cohort-generation') },
    { kind: 'minecraft-captures', generation: 'generation-000004', manifest_sha256: p6CaptureHash('capture-generation') },
    { kind: 'blind-comparison', generation: 'generation-000001', manifest_sha256: p6CaptureHash('blind-generation') }
  ]);
});

test('owned storage permits explicit private sealing reads but keeps default reads public', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-comparison-private-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'run');
  await fs.mkdir(runDir);
  const created = await createP6Run({ runDir });
  t.after(() => created.authority.close());
  const cohort = await publishP6Generation({ authority: created.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('cohort') } });
  const session = await publishP6Generation({ authority: created.authority, kind: 'capture-session', files: { 'session.json': Buffer.from('session') } });
  const captures = await publishP6Generation({
    authority: created.authority, kind: 'minecraft-captures', files: { 'captures.json': Buffer.from('captures') },
    expectedCurrent: { kind: 'capture-session', generation: session.generation, manifest_sha256: session.manifest_sha256 }
  });
  await publishP6Generation({
    authority: created.authority, kind: 'blind-comparison',
    files: {
      'comparison-manifest.json': Buffer.from('{}'),
      'private/identity-map.json': Buffer.from('{"secret":true}')
    },
    expectedCurrent: [
      { kind: 'cohort', generation: cohort.generation, manifest_sha256: cohort.manifest_sha256 },
      { kind: 'minecraft-captures', generation: captures.generation, manifest_sha256: captures.manifest_sha256 },
      { kind: 'blind-comparison', generation: null, manifest_sha256: null }
    ]
  });
  const publicRead = await readCurrentP6Generation({ authority: created.authority, kind: 'blind-comparison' });
  assert.equal(Object.hasOwn(publicRead, 'privateFiles'), false);
  const sealingRead = await readCurrentP6Generation({
    authority: created.authority, kind: 'blind-comparison', includePrivate: true
  });
  assert.equal(sealingRead.privateFiles['identity-map.json'].toString(), '{"secret":true}');
});

test('comparison publication is immutable and sealing is compare-and-swap across exact authorities', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-comparison-authority-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'run');
  await fs.mkdir(runDir);
  const created = await createP6Run({ runDir });
  t.after(() => created.authority.close());
  const cohort = await publishP6Generation({ authority: created.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('cohort') } });
  const session = await publishP6Generation({ authority: created.authority, kind: 'capture-session', files: { 'capture-session.json': Buffer.from('session') } });
  const captures = await publishP6Generation({
    authority: created.authority, kind: 'minecraft-captures', files: { 'capture-manifest.json': Buffer.from('captures') },
    expectedCurrent: { kind: 'capture-session', generation: session.generation, manifest_sha256: session.manifest_sha256 }
  });
  const absent = { kind: 'blind-comparison', generation: null, manifest_sha256: null };
  const dependencies = [
    { kind: 'cohort', generation: cohort.generation, manifest_sha256: cohort.manifest_sha256 },
    { kind: 'minecraft-captures', generation: captures.generation, manifest_sha256: captures.manifest_sha256 }, absent
  ];
  await assert.rejects(
    publishP6Generation({
      authority: created.authority, kind: 'blind-comparison', files: { 'comparison-manifest.json': Buffer.from('bypass') }
    }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
  const callerOwned = Buffer.from('first');
  const comparisonPromise = publishP6Generation({
    authority: created.authority, kind: 'blind-comparison', files: { 'comparison-manifest.json': callerOwned },
    expectedCurrent: dependencies
  });
  callerOwned.fill('x');
  const comparison = await comparisonPromise;
  assert.equal((await readCurrentP6Generation({
    authority: created.authority, kind: 'blind-comparison'
  })).files['comparison-manifest.json'].toString(), 'first');
  await assert.rejects(
    publishP6Generation({
      authority: created.authority, kind: 'blind-comparison', files: { 'comparison-manifest.json': Buffer.from('changed') },
      expectedCurrent: dependencies
    }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
  const sealed = await publishP6Generation({
    authority: created.authority, kind: 'blind-comparison', files: { 'comparison-manifest.json': Buffer.from('sealed') },
    expectedCurrent: [
      { kind: 'cohort', generation: cohort.generation, manifest_sha256: cohort.manifest_sha256 },
      { kind: 'minecraft-captures', generation: captures.generation, manifest_sha256: captures.manifest_sha256 },
      { kind: 'blind-comparison', generation: comparison.generation, manifest_sha256: comparison.manifest_sha256 }
    ]
  });
  await assert.rejects(
    publishP6Generation({
      authority: created.authority, kind: 'blind-comparison', files: { 'comparison-manifest.json': Buffer.from('stale-seal') },
      expectedCurrent: [
        { kind: 'cohort', generation: cohort.generation, manifest_sha256: cohort.manifest_sha256 },
        { kind: 'minecraft-captures', generation: captures.generation, manifest_sha256: captures.manifest_sha256 },
        { kind: 'blind-comparison', generation: comparison.generation, manifest_sha256: comparison.manifest_sha256 }
      ]
    }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
  assert.equal((await readCurrentP6Generation({ authority: created.authority, kind: 'blind-comparison' })).generation, sealed.generation);
});

test('an owned empty comparison tree after a pre-generation fault remains retryable', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-comparison-empty-retry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'run');
  await fs.mkdir(runDir);
  const created = await createP6Run({ runDir });
  t.after(() => created.authority.close());
  const cohort = await publishP6Generation({ authority: created.authority, kind: 'cohort', files: { 'cohort.json': Buffer.from('cohort') } });
  const session = await publishP6Generation({ authority: created.authority, kind: 'capture-session', files: { 'capture-session.json': Buffer.from('session') } });
  const captures = await publishP6Generation({
    authority: created.authority, kind: 'minecraft-captures', files: { 'capture-manifest.json': Buffer.from('captures') },
    expectedCurrent: { kind: 'capture-session', generation: session.generation, manifest_sha256: session.manifest_sha256 }
  });
  const dependencies = [
    { kind: 'cohort', generation: cohort.generation, manifest_sha256: cohort.manifest_sha256 },
    { kind: 'minecraft-captures', generation: captures.generation, manifest_sha256: captures.manifest_sha256 },
    { kind: 'blind-comparison', generation: null, manifest_sha256: null }
  ];
  let faulted = false;
  const fsImpl = new Proxy(fs, {
    get(target, property) {
      if (property === 'afterKindTreeCreation') return async () => {
        if (!faulted) { faulted = true; throw new Error('deterministic pre-generation fault'); }
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  await assert.rejects(
    publishP6Generation({
      authority: created.authority, kind: 'blind-comparison', files: { 'comparison-manifest.json': Buffer.from('first') },
      expectedCurrent: dependencies, fsImpl
    }),
    { code: 'P6_AUTHORITY_INVALID' }
  );
  const retry = await publishP6Generation({
    authority: created.authority, kind: 'blind-comparison', files: { 'comparison-manifest.json': Buffer.from('retry') },
    expectedCurrent: dependencies
  });
  assert.equal(retry.status, 'created');
});

function fixture() {
  const cohort = createP6CaptureInputs().cohort.manifest;
  const cohortHash = sha256(stableJson(cohort));
  const images = OPAQUE_IDS.flatMap((solution_id, solutionIndex) => P6_VIEW_IDS.map((view_id, viewIndex) => ({
    screenshot_id: `capture-${String(solutionIndex * 6 + viewIndex + 1).padStart(2, '0')}-opaque`,
    solution_id,
    camera: { view_id, position: { x: '1.000000', y: '2.000000', z: '3.000000' }, orientation: { pitch_degrees: '0.000000', yaw_degrees: '0.000000' } },
    build_function_sha256: cohort.solutions[solutionIndex].build_function_sha256,
    image_sha256: p6CaptureHash(`image-${solutionIndex}-${viewIndex}`)
  })));
  return {
    cohort,
    captureManifest: {
      schema_version: 1, protocol_version: '0.1.0', cohort_sha256: cohortHash,
      camera_manifest_sha256: p6CaptureHash('cameras'),
      request_sha256: P6_PROTOCOL_FILE_HASHES['fixed-request.json'],
      visual_settings_sha256: P6_PROTOCOL_FILE_HASHES['visual-settings.json'],
      environment: {
        minecraft_version: '1.21.9', client_options_sha256: p6CaptureHash('options'), resource_pack_ids: ['vanilla'],
        viewport: { width_px: 1920, height_px: 1080, aspect_ratio: '16:9' }, horizontal_fov_degrees: 70,
        time_of_day: 6000, weather: 'clear', world_identifier_sha256: p6CaptureHash('world')
      }, images
    }
  };
}

function preference(pair_id, comparison_manifest_hash, overrides = {}) {
  return {
    schema_version: 1, protocol_version: '0.1.0', comparison_manifest_hash, pair_id,
    choice: 'left', confidence: 'medium', reason_tags: [], rationale: null,
    reviewer_kind: 'human', sealed_at: '2026-08-30T10:15:00.000Z', ...overrides
  };
}

function deterministicBytes(sequence) {
  let offset = 0;
  return length => Buffer.from(Array.from({ length }, () => sequence[offset++ % sequence.length]));
}

function authorities(context) {
  return {
    cohort: {
      generation: 'generation-000001', manifest_sha256: p6CaptureHash('cohort-generation'),
      files: { 'cohort.json': Buffer.from(stableJson({ schema_version: 1, cohort: context.cohort })) }
    },
    'minecraft-captures': {
      generation: 'generation-000001', manifest_sha256: p6CaptureHash('capture-generation'),
      files: {
        'capture-manifest.json': Buffer.from(stableJson(context.captureManifest)),
        ...Object.fromEntries(context.captureManifest.images.map((image, index) => [
          `${image.screenshot_id}.png`, Buffer.from(`image-${Math.floor(index / 6)}-${index % 6}`)
        ]))
      }
    }
  };
}

function comparisonPublicFiles(bundle) {
  return {
    'comparison-manifest.json': Buffer.from(stableJson(bundle.publicManifest)),
    'presentation-order.json': Buffer.from(stableJson(bundle.publicPresentation)),
    ...Object.fromEntries(bundle.publicComparisons.map(row => [row.filename, Buffer.from(stableJson(row))])),
    ...Object.fromEntries(bundle.privateIdentityMap.screenshot_mappings.map(row => [
      row.presentation_filename, sourceImageBytes(row.source_screenshot_id)
    ]))
  };
}

function sourceImageBytes(sourceScreenshotId) {
  const index = Number(sourceScreenshotId.match(/capture-(\d{2})-opaque/u)?.[1]) - 1;
  return Buffer.from(`image-${Math.floor(index / 6)}-${index % 6}`);
}

function permutations(values) {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index))
    .map(rest => [value, ...rest]));
}
