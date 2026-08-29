#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const outputPath = valueAfter('-o');
const schemaPath = valueAfter('--output-schema');
if (!outputPath || !schemaPath) process.exit(0);
const scenario = path.basename(process.argv[1]).replace(/^fake-codex-/u, '') || 'success';
const tracePath = path.join(path.dirname(process.argv[1]), 'trace.json');
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

let descendant;
if (scenario === 'grandchild-hang' || scenario === 'silent-grandchild-hang') {
  descendant = spawn(process.execPath, ['-e', [
    'process.on("SIGTERM", () => {});',
    'setTimeout(() => process.exit(0), 6000);',
    'setInterval(() => {}, 1000);'
  ].join('')], {
    stdio: scenario === 'grandchild-hang'
      ? ['ignore', 'inherit', 'inherit']
      : ['ignore', 'ignore', 'ignore']
  });
}

if (tracePath) {
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  await fs.writeFile(tracePath, JSON.stringify({
    args,
    input,
    pid: process.pid,
    descendantPid: descendant?.pid,
    schema,
    schemaPath
  }), 'utf8');
}

if (scenario === 'hang' || scenario === 'grandchild-hang') {
  process.on('SIGTERM', () => {});
  setTimeout(() => process.exit(0), 3000);
  setInterval(() => {}, 1000);
} else if (scenario === 'silent-grandchild-hang') {
  setTimeout(() => process.exit(0), 6000);
  setInterval(() => {}, 1000);
} else if (scenario === 'auth') {
  process.stderr.write('not logged in; run codex login');
  process.exitCode = 1;
} else if (scenario === 'failure') {
  process.stderr.write(`private prompt must not leak: ${input}\n${'x'.repeat(100000)}`);
  process.exitCode = 7;
} else if (scenario === 'missing') {
  // Exit successfully without creating the final output file.
} else if (scenario === 'empty') {
  await fs.writeFile(outputPath, '', 'utf8');
} else if (scenario === 'malformed') {
  await fs.writeFile(outputPath, '{not-json', 'utf8');
} else if (scenario === 'array') {
  await fs.writeFile(outputPath, '[]', 'utf8');
} else if (scenario === 'primitive') {
  await fs.writeFile(outputPath, '42', 'utf8');
} else if (scenario === 'oversized') {
  await fs.writeFile(outputPath, JSON.stringify({ payload: 'x'.repeat(1048576) }), 'utf8');
} else {
  await fs.writeFile(outputPath, JSON.stringify({ ok: true }), 'utf8');
}
