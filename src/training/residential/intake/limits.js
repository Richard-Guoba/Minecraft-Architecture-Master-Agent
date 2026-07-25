export const RESIDENTIAL_INTAKE_LIMITS = Object.freeze({
  maxRawBytes: 64 * 1024 * 1024,
  maxInflatedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxDepth: 32,
  maxEntries: 20_000_000,
  // Dense 64-cube lists, the full palette, and bounded auxiliary collections.
  maxMaterializedEntries: 4 * (64 ** 3) + 4096 + 2 * 16_384 + 16,
  maxMaterializedBytes: 48 * 1024 * 1024,
  maxStringBytes: 32 * 1024,
  maxBlocks: 16_777_216,
  // A useful R2 source cannot occupy more unique cells than the 64^3 envelope.
  maxOccupiedAnalysisEntries: 64 ** 3,
  maxPaletteEntries: 4096,
  maxBlockEntities: 16_384,
  maxEntities: 16_384
});
