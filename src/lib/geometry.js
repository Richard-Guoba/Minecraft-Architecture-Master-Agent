export function point(x, y, z) {
  return { x, y, z };
}

export function normalizeBox(from, to) {
  return {
    from: point(
      Math.min(from.x, to.x),
      Math.min(from.y, to.y),
      Math.min(from.z, to.z)
    ),
    to: point(
      Math.max(from.x, to.x),
      Math.max(from.y, to.y),
      Math.max(from.z, to.z)
    )
  };
}

export function includePoint(bounds, p) {
  if (!bounds) {
    return { minX: p.x, minY: p.y, minZ: p.z, maxX: p.x, maxY: p.y, maxZ: p.z };
  }
  return {
    minX: Math.min(bounds.minX, p.x),
    minY: Math.min(bounds.minY, p.y),
    minZ: Math.min(bounds.minZ, p.z),
    maxX: Math.max(bounds.maxX, p.x),
    maxY: Math.max(bounds.maxY, p.y),
    maxZ: Math.max(bounds.maxZ, p.z)
  };
}

export function includeBox(bounds, from, to) {
  const box = normalizeBox(from, to);
  return includePoint(includePoint(bounds, box.from), box.to);
}
