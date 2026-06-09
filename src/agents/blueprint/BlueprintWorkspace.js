import { includeBox, includePoint, normalizeBox, point } from '../../lib/geometry.js';

export class BlueprintWorkspace {
  constructor(design) {
    this.design = design;
    this.elements = design.elements || {};
    this.operations = [];
    this.bounds = undefined;
    this.moduleCounts = new Map();
    this.agentOutputs = {};
  }

  fill(from, to, block, module) {
    const box = normalizeBox(from, to);
    this.operations.push({ kind: 'fill', from: box.from, to: box.to, block, module });
    this.bounds = includeBox(this.bounds, box.from, box.to);
    this.bump(module);
  }

  setblock(at, block, module) {
    this.operations.push({ kind: 'setblock', at, block, module });
    this.bounds = includePoint(this.bounds, at);
    this.bump(module);
  }

  bump(module) {
    this.moduleCounts.set(module, (this.moduleCounts.get(module) || 0) + 1);
  }

  wallThickness() {
    return clamp(this.elements.wall?.thickness || 1, 1, 3);
  }

  innerBounds() {
    const { width, depth } = this.design.dimensions;
    const t = this.wallThickness();
    return {
      minX: t,
      maxX: width - 1 - t,
      minZ: t,
      maxZ: depth - 1 - t
    };
  }

  doorOpening() {
    const { width, depth } = this.design.dimensions;
    const side = this.elements.door?.side || 'south';
    const doorWidth = clamp(this.elements.door?.width || 1, 1, 3);
    const openingWidth = Math.max(3, doorWidth + 2);
    if (side === 'east' || side === 'west') {
      const center = Math.floor(depth / 2);
      const start = clamp(center - Math.floor(openingWidth / 2), 1, depth - 1 - openingWidth);
      return { side, start, end: start + openingWidth - 1 };
    }
    const center = Math.floor(width / 2);
    const start = clamp(center - Math.floor(openingWidth / 2), 1, width - 1 - openingWidth);
    return { side, start, end: start + openingWidth - 1 };
  }

  overlapsDoor(side, start, end, level, opening = this.doorOpening()) {
    if (level !== 0 || opening.side !== side) return false;
    return start <= opening.end && end >= opening.start;
  }

  setAgentOutputs(outputs) {
    this.agentOutputs = outputs;
  }

  toBlueprint() {
    return {
      version: 3,
      target: {
        minecraft: 'Java 1.21',
        datapackFormat: 48
      },
      origin: {
        type: 'relative-player-position',
        note: 'Run /function architect:build while standing near the northwest corner of the desired build area.'
      },
      bounds: this.bounds,
      modules: Object.fromEntries(this.moduleCounts.entries()),
      agents: this.agentOutputs,
      design: {
        id: this.design.id,
        style: this.design.style,
        scale: this.design.scale,
        floors: this.design.floors,
        dimensions: this.design.dimensions,
        palette: this.design.palette,
        elements: this.design.elements,
        plan: this.design.plan
      },
      operations: this.operations
    };
  }
}

export { point };

export function doorState(base, facing, half, hinge) {
  const block = String(base).split('[')[0];
  return `${block}[facing=${facing},half=${half},hinge=${hinge}]`;
}

export function windowPositions(span, thickness, windowWidth, spacing) {
  const positions = [];
  const start = thickness + 3;
  const end = span - thickness - windowWidth - 1;
  for (let value = start; value <= end; value += spacing) {
    positions.push(value);
  }
  if (!positions.length) {
    positions.push(Math.max(thickness + 1, Math.floor((span - windowWidth) / 2)));
  }
  return positions;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value))));
}
