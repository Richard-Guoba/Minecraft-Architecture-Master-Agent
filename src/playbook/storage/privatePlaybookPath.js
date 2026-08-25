import fs from 'node:fs/promises';
import path from 'node:path';
import { failPlaybookContract } from '../contracts/playbookContractError.js';

export const PRIVATE_PLAYBOOK_ROOT = '.local/architecture-playbook';

export function resolvePrivatePlaybookPath(
  value,
  {
    projectRoot,
    invalidCode = 'PLAYBOOK_PRIVATE_PATH_INVALID'
  }
) {
  const root = path.resolve(projectRoot);
  const privateRoot = path.resolve(root, PRIVATE_PLAYBOOK_ROOT);
  if (typeof value !== 'string' || value.length === 0) {
    failPlaybookContract(invalidCode, 'privatePath', String(value));
  }
  const resolved = path.resolve(root, value);
  if (resolved === privateRoot || !isWithin(resolved, privateRoot)) {
    failPlaybookContract(invalidCode, 'privatePath', resolved);
  }
  return resolved;
}

export async function assertPrivatePlaybookStorage(
  target,
  {
    projectRoot,
    createParent = false,
    escapeCode = 'PLAYBOOK_PRIVATE_PATH_ESCAPE'
  }
) {
  const root = path.resolve(projectRoot);
  const privateRoot = path.resolve(root, PRIVATE_PLAYBOOK_ROOT);
  const resolvedTarget = resolvePrivatePlaybookPath(target, {
    projectRoot: root
  });
  const projectReal = await fs.realpath(root);
  const nearest = await nearestExistingAncestor(path.dirname(resolvedTarget));
  const nearestReal = await fs.realpath(nearest);
  if (!isWithin(nearestReal, projectReal)) {
    failPlaybookContract(escapeCode, 'privatePath', nearestReal);
  }

  let privateReal = null;
  try {
    privateReal = await fs.realpath(privateRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (privateReal && !isWithin(privateReal, projectReal)) {
    failPlaybookContract(escapeCode, 'privatePath', privateReal);
  }
  if (
    privateReal
    && nearest !== privateRoot
    && isWithin(nearest, privateRoot)
    && !isWithin(nearestReal, privateReal)
  ) {
    failPlaybookContract(escapeCode, 'privatePath', nearestReal);
  }

  if (createParent) {
    await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });
  }
  const parentReal = await fs.realpath(path.dirname(resolvedTarget));
  const finalPrivateReal = await fs.realpath(privateRoot);
  if (
    !isWithin(finalPrivateReal, projectReal)
    || !isWithin(parentReal, finalPrivateReal)
  ) {
    failPlaybookContract(escapeCode, 'privatePath', parentReal);
  }
  return resolvedTarget;
}

async function nearestExistingAncestor(start) {
  let current = path.resolve(start);
  while (true) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`no existing ancestor for ${start}`);
    }
    current = parent;
  }
}

function isWithin(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}
