import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { executeError } from './contracts.js';
import { deepFreeze, sha256, stableJson } from '../shadow/canonical.js';

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const SAFE_BASENAME = /^[A-Za-z0-9._-]+$/u;
const DATAPACK_BASENAME = 'architect_datapack';
const BUILD_RELATIVE_PATH = 'data/architect/function/build.mcfunction';

export async function hashReplayArtifacts({ compiledResult } = {}) {
  try {
    const operations = canonicalClone(compiledResult?.blueprint?.operations);
    if (!Array.isArray(operations)) invalid();
    const datapackDir = exactAbsolutePath(compiledResult?.artifacts?.datapackDir);
    const buildFunction = exactAbsolutePath(compiledResult?.artifacts?.buildFunction);
    if (path.basename(datapackDir) !== DATAPACK_BASENAME
      || buildFunction !== path.join(datapackDir, ...BUILD_RELATIVE_PATH.split('/'))) invalid();
    const tree = await readDatapackTree(datapackDir);
    const buildRow = tree.rows.find((row) => row.path === `${DATAPACK_BASENAME}/${BUILD_RELATIVE_PATH}`);
    if (!buildRow) invalid();
    return deepFreeze({
      operation_list_sha256: sha256(stableJson(operations)),
      build_function_sha256: buildRow.sha256,
      datapack_tree_sha256: sha256(stableJson(tree.rows))
    });
  } catch (error) {
    if (error?.code === 'P5_REPLAY_FAILED') throw error;
    invalid();
  }
}

async function readDatapackTree(root) {
  const before = await fs.lstat(root);
  if (before.isSymbolicLink() || !before.isDirectory()) invalid();
  const rootHandle = await fs.open(root, DIRECTORY_FLAGS);
  const rows = [];
  try {
    const opened = await rootHandle.stat();
    if (!opened.isDirectory() || !sameIdentity(before, opened)) invalid();
    await walk(rootHandle, '');
    const after = await fs.lstat(root);
    if (after.isSymbolicLink() || !after.isDirectory() || !sameIdentity(opened, after)) invalid();
  } finally {
    await rootHandle.close();
  }
  rows.sort((left, right) => left.path.localeCompare(right.path));
  return { rows };

  async function walk(handle, prefix) {
    const names = (await fs.readdir(descriptorPath(handle))).sort();
    for (const name of names) {
      if (!SAFE_BASENAME.test(name) || name === '.' || name === '..') invalid();
      const relative = prefix ? `${prefix}/${name}` : name;
      const target = path.join(descriptorPath(handle), name);
      const entry = await fs.lstat(target);
      if (entry.isSymbolicLink()) invalid();
      if (entry.isDirectory()) {
        const child = await fs.open(target, DIRECTORY_FLAGS);
        try {
          const opened = await child.stat();
          if (!opened.isDirectory() || !sameIdentity(entry, opened)) invalid();
          await walk(child, relative);
          const after = await fs.lstat(target);
          if (after.isSymbolicLink() || !after.isDirectory() || !sameIdentity(opened, after)) invalid();
        } finally { await child.close(); }
      } else if (entry.isFile()) {
        const file = await fs.open(target, READ_FLAGS);
        try {
          const opened = await file.stat();
          if (!opened.isFile() || !sameIdentity(entry, opened)) invalid();
          const body = await file.readFile();
          const after = await fs.lstat(target);
          if (after.isSymbolicLink() || !after.isFile() || !sameIdentity(opened, after)
            || Number(opened.size) !== body.length) invalid();
          rows.push({ path: `${DATAPACK_BASENAME}/${relative}`, sha256: sha256(body) });
        } finally { await file.close(); }
      } else invalid();
    }
  }
}

function canonicalClone(value) {
  const ancestors = new WeakSet();
  const clone = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') { if (!Number.isFinite(item)) invalid(); return item; }
    if (!item || typeof item !== 'object' || ancestors.has(item) || Object.getOwnPropertySymbols(item).length !== 0) invalid();
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || Object.getOwnPropertyNames(item).length !== item.length + 1) invalid();
      const output = item.map((_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
        return clone(descriptor.value);
      });
      ancestors.delete(item); return output;
    }
    if (Object.getPrototypeOf(item) !== Object.prototype || Object.getOwnPropertyNames(item).length !== Object.keys(item).length) invalid();
    const output = {};
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined) invalid();
      output[key] = clone(descriptor.value);
    }
    ancestors.delete(item); return output;
  };
  return clone(value);
}

function exactAbsolutePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) invalid();
  return value;
}
function descriptorPath(handle) { return `/proc/self/fd/${handle.fd}`; }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function invalid() { throw executeError('P5_REPLAY_FAILED'); }
