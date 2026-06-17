import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonContent } from '../src/llm/parseJsonContent.js';

test('parseJsonContent repairs adjacent string array items from LLM JSON output', () => {
  const parsed = parseJsonContent(`{
    "nodes": [
      { "id": "living", "tags": ["neon" "aged-facade"] }
    ]
  }`);

  assert.deepEqual(parsed.nodes[0].tags, ['neon', 'aged-facade']);
});

test('parseJsonContent repairs adjacent object array items from LLM JSON output', () => {
  const parsed = parseJsonContent(`{
    "edges": [
      { "from": "entry", "to": "living" }
      { "from": "living", "to": "stairs" }
    ]
  }`);

  assert.equal(parsed.edges.length, 2);
  assert.equal(parsed.edges[1].to, 'stairs');
});
