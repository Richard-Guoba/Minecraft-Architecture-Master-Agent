export class GDMCClient {
  constructor({ baseUrl = 'http://localhost:9000', fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async placeBlock(x, y, z, blockId) {
    if (!this.fetch) throw new Error('fetch is not available in this Node.js runtime.');
    const url = `${this.baseUrl}/blocks?${new URLSearchParams({ x, y, z })}`;
    const response = await this.fetch(url, {
      method: 'PUT',
      body: blockId
    });
    if (!response.ok) throw new Error(`GDMC placeBlock failed: ${response.status} ${response.statusText}`);
  }

  async renderGrid(grid, { offsetX = 0, offsetY = 0, offsetZ = 0, limit } = {}) {
    let placed = 0;
    let skipped = 0;
    for (const [key, cell] of grid.entries()) {
      if (limit !== undefined && placed >= limit) {
        skipped += 1;
        continue;
      }
      const [x, y, z] = key.split(',').map(Number);
      await this.placeBlock(x + offsetX, y + offsetY, z + offsetZ, cell.block || cell);
      placed += 1;
    }
    return { placed, skipped };
  }
}
