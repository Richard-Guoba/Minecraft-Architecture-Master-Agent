#!/usr/bin/env node
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const scenario = valueAfter('--scenario') || 'success';
const outputPath = valueAfter('-o');
const schemaPath = valueAfter('--output-schema');
const tracePath = valueAfter('--trace');
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

if (tracePath) {
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  await fs.writeFile(tracePath, JSON.stringify({
    args,
    input,
    pid: process.pid,
    schema,
    schemaPath
  }), 'utf8');
}

if (scenario === 'hang') {
  process.on('SIGTERM', () => {});
  setTimeout(() => process.exit(0), 3000);
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
} else {
  await fs.writeFile(outputPath, JSON.stringify({ ok: true }), 'utf8');
}
