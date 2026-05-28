import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function defaultMinecraftDir() {
  if (process.env.MINECRAFT_DIR) return process.env.MINECRAFT_DIR;
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, '.minecraft');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft');
  }
  return path.join(os.homedir(), '.minecraft');
}

export async function listWorlds(minecraftDir) {
  const savesDir = path.join(path.resolve(minecraftDir || defaultMinecraftDir()), 'saves');
  let entries;
  try {
    entries = await fs.readdir(savesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const worlds = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const worldPath = path.join(savesDir, entry.name);
    const stats = await fs.stat(worldPath);
    worlds.push({
      name: entry.name,
      path: worldPath,
      modifiedAt: stats.mtimeMs
    });
  }

  worlds.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return worlds;
}

export async function resolveWorldDir({ minecraftDir, world }) {
  if (!world) return undefined;

  if (path.isAbsolute(world)) {
    await assertWorldExists(world);
    return path.resolve(world);
  }

  const root = path.resolve(minecraftDir || defaultMinecraftDir());
  if (world === 'latest') {
    const worlds = await listWorlds(root);
    if (!worlds.length) {
      throw new Error(`No Minecraft worlds found under ${path.join(root, 'saves')}.`);
    }
    return worlds[0].path;
  }

  const worldDir = path.join(root, 'saves', world);
  await assertWorldExists(worldDir);
  return worldDir;
}

async function assertWorldExists(worldDir) {
  try {
    const stats = await fs.stat(worldDir);
    if (!stats.isDirectory()) {
      throw new Error(`${worldDir} is not a directory.`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Minecraft world not found: ${worldDir}`);
    }
    throw error;
  }
}
