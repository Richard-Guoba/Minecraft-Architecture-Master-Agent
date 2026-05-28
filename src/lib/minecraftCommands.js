function rel(value) {
  if (value === 0) return '~';
  return `~${value}`;
}

export function commandForOperation(operation) {
  if (operation.kind === 'fill') {
    const { from, to, block } = operation;
    return `fill ${rel(from.x)} ${rel(from.y)} ${rel(from.z)} ${rel(to.x)} ${rel(to.y)} ${rel(to.z)} ${block}`;
  }
  if (operation.kind === 'setblock') {
    const { at, block } = operation;
    return `setblock ${rel(at.x)} ${rel(at.y)} ${rel(at.z)} ${block}`;
  }
  throw new Error(`Unsupported operation kind: ${operation.kind}`);
}

export function clearCommandForBounds(bounds, padding = 2) {
  return `fill ${rel(bounds.minX - padding)} ${rel(Math.max(0, bounds.minY))} ${rel(bounds.minZ - padding)} ${rel(bounds.maxX + padding)} ${rel(bounds.maxY + padding)} ${rel(bounds.maxZ + padding)} minecraft:air`;
}
