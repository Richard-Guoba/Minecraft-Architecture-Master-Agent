import fs from 'node:fs/promises';

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function createTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  ].join('-');
}
