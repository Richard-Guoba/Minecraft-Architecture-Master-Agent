import { constants as fsConstants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';

import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';

export const P7_ADVISORY_OVERLAY_PATH =
  'docs/architecture-playbook/rules/schools/heihui-jileniao/p7-advisory-v0.2.json';

const TOP_FIELDS = Object.freeze([
  'schema_version', 'overlay_version', 'school_id', 'status', 'chapter_ids',
  'source_bvids', 'entries'
]);
const ENTRY_FIELDS = Object.freeze([
  'knowledge_id', 'design_layers', 'intent', 'source_bvids', 'classification',
  'evidence_refs'
]);
const EXPECTED_SOURCES = Object.freeze([
  'BV1aBV1zwELe', 'BV1SwdfBHEx5', 'BV1SG6GY9ETe',
  'BV1iVLbzcEfG', 'BV1cLJtz1ELx', 'BV14XMtzFEzb', 'BV1ecj4zsE27',
  'BV1Mp7UzyE3P', 'BV1MA7Bz2EE1', 'BV1h1keYbEMd', 'BV1unj9z4EnW',
  'BV1ZJTLzgEdm', 'BV1XtGvzPEFR', 'BV1nCJJzWEHH', 'BV1FrPazJEFD',
  'BV1HRVnzVEFa', 'BV1rx6yYNEYr', 'BV1KN91Y1ELG',
  'BV1xtXKYYEF2', 'BV1Hy5pzQE5n', 'BV1oFJPzqE9k',
  'BV1i2JBzPE8m', 'BV1Cm7VzzEXd', 'BV1a5TDzhE9M',
  'BV1DkPVexESz', 'BV1ux2sBvECk', 'BV1VULRzAE3x',
  'BV1Rf7nz5Eic', 'BV1tepJz3EuZ', 'BV1TUHHz1ECZ', 'BV1YNLnzeEx3',
  'BV1JcQ3YYEg5', 'BV1j7QSYKEHA', 'BV1yHEtz2EJh',
  'BV1SNdSBtErf', 'BV1LxjEzKEH7', 'BV17QjvzpEuA',
  'BV1K1oXYGEm2', 'BV1bWX6YPEsG', 'BV1JT5ez2EjF',
  'BV1267wzyErC', 'BV1ifomBqEJJ', 'BV1SN9xBWEmF'
]);
const EXPECTED_CHAPTERS = Object.freeze([
  'foundations-tools-blocks-modularity-color', 'complete-structure',
  'complete-roofs', 'complete-walls-facades', 'landscaping-terrain',
  'interiors', 'advanced-architecture', 'style-specialist-cases'
]);
const LAYERS = new Set(['brief', 'massing', 'structure', 'roof', 'facade']);
const ID = /^knowledge:p7:[a-z0-9][a-z0-9-]*$/u;
const EVIDENCE_REF = /^(BV[0-9A-Za-z]+)@[0-9]+-[0-9]+$/u;
const CLASSIFICATIONS = new Set(['author_claim', 'inference', 'contrast']);
const EXPECTED_OVERLAY_SHA256 = '98a09b14c5a29fc76b93f61be016b82edb4a9a8c94cdcf76777533f0c1631c35';

export async function loadP7AdvisoryOverlay({ projectRoot, readFile } = {}) {
  try {
    const root = path.resolve(projectRoot || process.cwd());
    const raw = readFile
      ? await readFile(P7_ADVISORY_OVERLAY_PATH)
      : await readDescriptorSafely(root, P7_ADVISORY_OVERLAY_PATH);
    const value = JSON.parse(String(raw));
    validateOverlay(value);
    const overlaySha256 = sha256(stableJson(value));
    if (overlaySha256 !== EXPECTED_OVERLAY_SHA256) throw invalid();
    return deepFreeze({
      ...value,
      overlay_sha256: overlaySha256
    });
  } catch (error) {
    if (error?.code === 'P7_ADVISORY_INVALID') throw error;
    throw invalid();
  }
}

async function readDescriptorSafely(projectRoot, relativePath) {
  const filePath = path.resolve(projectRoot, relativePath);
  const before = await lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink()) throw invalid();
  const descriptor = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = await descriptor.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw invalid();
    }
    return await descriptor.readFile();
  } finally {
    await descriptor.close();
  }
}

export function projectP7AdvisoryKnowledge(overlay) {
  try {
    exactObject(overlay, [...TOP_FIELDS, 'overlay_sha256']);
    const { overlay_sha256: overlaySha256, ...value } = overlay;
    validateOverlay(value);
    if (typeof overlaySha256 !== 'string'
      || overlaySha256 !== sha256(stableJson(value))
      || overlaySha256 !== EXPECTED_OVERLAY_SHA256) throw invalid();
    return deepFreeze({
      overlay_version: value.overlay_version,
      overlay_sha256: overlaySha256,
      status: value.status,
      authority: 'intent-guidance-only-not-reviewed-rules',
      entries: value.entries.map(({ knowledge_id, design_layers, intent }) => ({
        knowledge_id, design_layers, intent
      }))
    });
  } catch (error) {
    if (error?.code === 'P7_ADVISORY_INVALID') throw error;
    throw invalid();
  }
}

function validateOverlay(value) {
  exactObject(value, TOP_FIELDS);
  if (value.schema_version !== 1 || value.overlay_version !== '0.2.0'
    || value.school_id !== 'heihui-jileniao'
    || value.status !== 'subtitle-derived-advisory'
    || !sameStrings(value.chapter_ids, EXPECTED_CHAPTERS)
    || !sameStrings(value.source_bvids, EXPECTED_SOURCES)
    || !Array.isArray(value.entries) || value.entries.length !== 123) throw invalid();
  const ids = new Set();
  for (const entry of value.entries) {
    exactObject(entry, ENTRY_FIELDS);
    if (!ID.test(entry.knowledge_id) || ids.has(entry.knowledge_id)
      || !Array.isArray(entry.design_layers) || entry.design_layers.length === 0
      || entry.design_layers.some((layer, index) => !LAYERS.has(layer)
        || entry.design_layers.indexOf(layer) !== index)
      || typeof entry.intent !== 'string' || entry.intent.length === 0
      || Array.from(entry.intent).length > 240
      || entry.intent.includes('.local/architecture-playbook')
      || !Array.isArray(entry.source_bvids) || entry.source_bvids.length === 0
      || entry.source_bvids.some((bvid, index) => !EXPECTED_SOURCES.includes(bvid)
        || entry.source_bvids.indexOf(bvid) !== index)
      || !CLASSIFICATIONS.has(entry.classification)
      || !Array.isArray(entry.evidence_refs) || entry.evidence_refs.length === 0
      || entry.evidence_refs.some((reference) => {
        const match = EVIDENCE_REF.exec(reference);
        return !match || !entry.source_bvids.includes(match[1]);
      })
      || entry.source_bvids.some((bvid) =>
        !entry.evidence_refs.some((reference) => reference.startsWith(`${bvid}@`)))) throw invalid();
    ids.add(entry.knowledge_id);
  }
}

function exactObject(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) throw invalid();
}

function sameStrings(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function invalid() {
  const error = new Error('P7_ADVISORY_INVALID');
  error.code = 'P7_ADVISORY_INVALID';
  return error;
}
