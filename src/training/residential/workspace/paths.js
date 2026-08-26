import fs from 'node:fs/promises';
import path from 'node:path';
import { failContract } from '../contracts/contractError.js';

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../../..');

export function resolveResidentialWorkspaceRoot(
  value = '.local/residential-model',
  { cwd = process.cwd() } = {}
) {
  return path.resolve(cwd, String(value));
}

export async function validateResidentialWorkspaceRoot(
  root,
  { projectRoot = PROJECT_ROOT } = {}
) {
  const project = path.resolve(projectRoot);
  const candidate = path.resolve(root);
  const allowed = path.join(project, '.local', 'residential-model');
  if (candidate !== allowed) {
    failContract(
      'WORKSPACE_ROOT_OUTSIDE_RESIDENTIAL',
      'workspace.root',
      candidate
    );
  }
  const projectEntry = await safeLstat(project);
  if (projectEntry?.isSymbolicLink()) {
    failContract('WORKSPACE_ROOT_SYMLINK', 'workspace.root', project);
  }
  await rejectSymlinks(project, candidate);
  const entry = await safeLstat(candidate);
  if (entry?.isSymbolicLink()) {
    failContract('WORKSPACE_ROOT_SYMLINK', 'workspace.root', candidate);
  }
  if (entry && !entry.isDirectory()) {
    failContract('WORKSPACE_ROOT_NOT_DIRECTORY', 'workspace.root', candidate);
  }
  return candidate;
}

export async function safeLstat(value) {
  try {
    return await fs.lstat(value);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function rejectSymlinks(projectRoot, candidate) {
  const relative = path.relative(projectRoot, candidate);
  let current = projectRoot;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const entry = await safeLstat(current);
    if (!entry) return;
    if (entry.isSymbolicLink()) {
      failContract('WORKSPACE_ROOT_SYMLINK', 'workspace.root', current);
    }
  }
}
