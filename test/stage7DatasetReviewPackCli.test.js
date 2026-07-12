import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function run(args) { return spawnSync(process.execPath,['src/buildStage7DatasetReviewPack.js',...args],{cwd:process.cwd(),encoding:'utf8'}); }

test('Stage 7 review-pack CLI documents options', () => {
  const result=run(['--help']);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/--knowledge-base/);
  assert.match(result.stdout,/--out/);
  assert.match(result.stdout,/--case/);
});

test('Stage 7 review-pack CLI rejects duplicate cases', () => {
  const result=run(['--case','house-tavern','--case','house-tavern']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/duplicate case id/);
});
