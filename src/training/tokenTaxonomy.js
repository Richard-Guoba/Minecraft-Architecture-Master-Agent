export const TOKEN_NAMES = Object.freeze([
  'air',
  'earth',
  'rock',
  'wood',
  'glass',
  'architectural-shape',
  'detail',
  'water',
  'other'
]);

export function mapTrainingToken(block) {
  if (block?.air) return 0;
  if (block?.category === 'earth') return 1;
  if (block?.category === 'rock') return 2;
  if (block?.category === 'wood') return 3;
  if (block?.category === 'glass') return 4;
  if (block?.category === 'stair' || block?.category === 'slab') return 5;
  if (
    ['light', 'fence', 'opening', 'decor', 'vegetation']
      .includes(block?.category)
  ) {
    return 6;
  }
  if (block?.category === 'water') return 7;
  return 8;
}
