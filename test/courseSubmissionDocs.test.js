import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readUtf8(path) {
  return readFile(path, 'utf8');
}

test('course showcase site exposes project, architecture, results, and reproduction signals', async () => {
  const html = await readUtf8('docs/index.html');

  assert.match(html, /Minecraft Constructing Agents/);
  assert.match(html, /大语言模型与信息决策/);
  assert.match(html, /LLM 语义智能体/);
  assert.match(html, /CSG/);
  assert.match(html, /BSP/);
  assert.match(html, /A\*/);
  assert.match(html, /173 passed/);
  assert.match(html, /真实截图/);
  assert.match(html, /npm start -- --mode mock/);
});

test('submission checklist names deliverables, authors, commands, and AI assistance boundary', async () => {
  const text = await readUtf8('SUBMISSION.md');

  assert.match(text, /龙想/);
  assert.match(text, /2300011196/);
  assert.match(text, /石宇宸/);
  assert.match(text, /2300011051/);
  assert.match(text, /GitHub/);
  assert.match(text, /docs\/index.html/);
  assert.match(text, /npm test/);
  assert.match(text, /AI 辅助/);
});

test('readme links the course submission entry points', async () => {
  const readme = await readUtf8('README.md');

  assert.match(readme, /课程项目提交入口/);
  assert.match(readme, /docs\/index.html/);
  assert.match(readme, /SUBMISSION.md/);
});
