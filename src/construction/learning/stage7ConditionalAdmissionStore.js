import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ConditionalAdmissionContractError,
  validateTaxonomyAssessment
} from './stage7ConditionalTaxonomy.js';

export const TAXONOMY_LEDGER_RELATIVE = 'reviews/conditional-taxonomy.jsonl';

export async function readTaxonomyAssessmentLedger(root) {
  const target = await ledgerPath(root);
  let text;
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) fail('ASSESSMENT_LEDGER_SYMLINK', target);
    if (!stat.isFile()) fail('ASSESSMENT_LEDGER_NOT_REGULAR', target);
    text = await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return Object.freeze([]);
    throw error;
  }
  const records = parseLedger(text);
  if (text !== canonicalLedger(records)) {
    fail('ASSESSMENT_LEDGER_NONCANONICAL', target);
  }
  assertContiguous(records);
  return Object.freeze(records);
}

export async function appendTaxonomyAssessment(root, record, {
  rename = fs.rename,
  writeFile = fs.writeFile,
  remove = fs.rm
} = {}) {
  const validated = validateTaxonomyAssessment(record);
  const target = await ledgerPath(root);
  const existing = await readTaxonomyAssessmentLedger(root);
  const candidateRecords = existing.filter(
    (item) => item.candidate_id === validated.candidate_id
  );
  const expectedRevision = candidateRecords.length + 1;
  if (validated.revision !== expectedRevision) {
    fail('ASSESSMENT_REVISION_NOT_NEXT', validated.candidate_id);
  }
  const output = Object.freeze([...existing, validated]);
  const temporary = path.join(
    path.dirname(target), `.conditional-taxonomy.jsonl.tmp-${process.pid}`
  );
  try {
    await fs.lstat(temporary);
    fail('ASSESSMENT_TEMP_EXISTS', temporary);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await writeFile(temporary, canonicalLedger(output), { encoding: 'utf8', flag: 'wx' });
    const handle = await fs.open(temporary, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } catch (error) {
    await remove(temporary, { force: true });
    throw error;
  }
  return validated;
}

async function ledgerPath(root) {
  const absoluteRoot = path.resolve(root);
  const reviews = path.join(absoluteRoot, 'reviews');
  const rootStat = await fs.lstat(absoluteRoot);
  const reviewsStat = await fs.lstat(reviews);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || reviewsStat.isSymbolicLink() || !reviewsStat.isDirectory()) {
    fail('ASSESSMENT_ROOT_INVALID', absoluteRoot);
  }
  const target = path.resolve(absoluteRoot, TAXONOMY_LEDGER_RELATIVE);
  if (path.dirname(target) !== reviews) fail('ASSESSMENT_PATH_ESCAPE', target);
  return target;
}

function parseLedger(text) {
  if (typeof text !== 'string') fail('ASSESSMENT_LEDGER_INVALID', 'text');
  return text.split(/\r?\n/u).filter((line) => line.length > 0).map((line, index) => {
    try { return validateTaxonomyAssessment(JSON.parse(line)); }
    catch (error) {
      if (error instanceof ConditionalAdmissionContractError) throw error;
      fail('ASSESSMENT_LEDGER_INVALID', `line ${index + 1}`);
    }
  });
}

function assertContiguous(records) {
  const grouped = new Map();
  for (const record of records) {
    const revisions = grouped.get(record.candidate_id) || [];
    revisions.push(record.revision);
    grouped.set(record.candidate_id, revisions);
  }
  for (const [candidateId, revisions] of grouped) {
    revisions.sort((a, b) => a - b);
    if (revisions.some((revision, index) => revision !== index + 1)) {
      fail('ASSESSMENT_REVISION_GAP', candidateId);
    }
  }
}

function canonicalLedger(records) {
  return records.map((record) => `${JSON.stringify(sortKeys(record))}\n`).join('');
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

function fail(code, detail) {
  throw new ConditionalAdmissionContractError(code, detail);
}
