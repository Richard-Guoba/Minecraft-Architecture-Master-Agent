import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inflateSync } from 'node:zlib';

import { deriveFixedViewManifest } from '../src/playbook/p6/cameras.js';
import { P6_VIEW_IDS, P6_VISUAL_SETTINGS } from '../src/playbook/p6/constants.js';
import {
  P6_REFERENCE_PALETTE,
  renderReferenceView,
  renderReferenceViews
} from '../src/playbook/p6/offlineRenderer.js';
import { encodeRgbaPng, inspectPngHeader } from '../src/playbook/p6/png.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const BOUNDS = { min_x: 0, min_y: 0, min_z: 0, max_x: 2, max_y: 2, max_z: 2 };
const BLUEPRINT = { bounds: BOUNDS };
const CAMERA = {
  view_id: 'quarter-southeast',
  horizontal_fov_degrees: 70,
  position: { x: '7.000000', y: '5.000000', z: '7.000000' },
  target: { x: '1.000000', y: '1.000000', z: '1.000000' }
};
const CUBE = [{
  kind: 'fill',
  from: { x: 0, y: 0, z: 0 },
  to: { x: 2, y: 2, z: 2 },
  block: 'minecraft:stone_bricks',
  material_role: 'stone'
}];

test('PNG encoder writes valid deterministic chunks and rejects corrupt bytes', () => {
  const rgba = Buffer.from([10, 20, 30, 255]);
  const first = encodeRgbaPng({ width: 1, height: 1, rgba });
  const second = encodeRgbaPng({ width: 1, height: 1, rgba });
  assert.deepEqual(first, second);
  assert.deepEqual([...first.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(inspectPngHeader(first), {
    width: 1, height: 1, bit_depth: 8, color_type: 6
  });
  const corrupt = Buffer.from(first);
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => inspectPngHeader(corrupt), { code: 'P6_RENDER_FAILED' });
});

test('reference render is a deterministic non-empty 1920x1080 perspective PNG', () => {
  const first = renderReferenceView({
    blueprint: BLUEPRINT,
    operations: CUBE,
    camera: CAMERA,
    settings: P6_VISUAL_SETTINGS
  });
  const second = renderReferenceView({
    blueprint: BLUEPRINT,
    operations: CUBE,
    camera: CAMERA,
    settings: P6_VISUAL_SETTINGS
  });
  assert.deepEqual(first, second);
  assert.deepEqual(inspectPngHeader(first), {
    width: 1920, height: 1080, bit_depth: 8, color_type: 6
  });
  const pixels = decodeRgba(first);
  const background = P6_REFERENCE_PALETTE.background.join(',');
  assert.ok([...pixelSet(pixels)].some(pixel => pixel !== background), 'geometry changes background pixels');
  assert.equal(sha256(first), 'd08f6114a793b9345284fcf69926041f931858cfc6dbbffb7956e6f777a78dc4');
});

test('visible operation changes alter the reference hash and use the frozen role palette', () => {
  assert.equal(Object.isFrozen(P6_REFERENCE_PALETTE), true);
  assert.deepEqual(P6_REFERENCE_PALETTE, {
    background: [210, 225, 232, 255],
    stone: [126, 126, 118, 255],
    timber: [104, 70, 43, 255],
    roof: [73, 47, 48, 255],
    glass: [116, 181, 196, 255],
    foliage: [86, 125, 65, 255],
    water: [70, 124, 168, 255],
    accent: [181, 146, 72, 255],
    neutral: [154, 139, 119, 255]
  });
  const stone = renderReferenceView({ blueprint: BLUEPRINT, operations: CUBE, camera: CAMERA, settings: P6_VISUAL_SETTINGS });
  const timber = renderReferenceView({
    blueprint: BLUEPRINT,
    operations: [{ ...CUBE[0], block: 'minecraft:oak_planks', material_role: 'timber' }],
    camera: CAMERA,
    settings: P6_VISUAL_SETTINGS
  });
  assert.notEqual(sha256(stone), sha256(timber));
  const renderedColors = pixelSet(decodeRgba(timber));
  assert.ok([...renderedColors].some(color => color === shade(P6_REFERENCE_PALETTE.timber, 1).join(',')));
});

test('z-buffer depth result does not depend on operation traversal order', () => {
  const near = { kind: 'setblock', at: { x: 2, y: 1, z: 2 }, block: 'minecraft:gold_block', material_role: 'accent' };
  const far = { kind: 'setblock', at: { x: 0, y: 1, z: 0 }, block: 'minecraft:oak_planks', material_role: 'timber' };
  const first = renderReferenceView({ blueprint: BLUEPRINT, operations: [near, far], camera: CAMERA, settings: P6_VISUAL_SETTINGS });
  const reversed = renderReferenceView({ blueprint: BLUEPRINT, operations: [far, near], camera: CAMERA, settings: P6_VISUAL_SETTINGS });
  assert.deepEqual(first, reversed);
});

test('renders exactly six ordered files without retaining decoded pixels', () => {
  const cameraManifest = deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01',
    blueprintSha256: HASH_A,
    buildFunctionSha256: HASH_B,
    bounds: BOUNDS,
    mainEntry: { center_x: 1, center_y: 1, center_z: 2, facing: 'south' },
    sharedFraming: null
  });
  const images = renderReferenceViews({
    solution: {
      solution_id: 'playbook-candidate-01',
      blueprint: BLUEPRINT,
      operations: CUBE
    },
    cameraManifest,
    settings: P6_VISUAL_SETTINGS
  });
  assert.deepEqual(images.map(image => image.view_id), P6_VIEW_IDS);
  assert.equal(images.length, 6);
  for (const image of images) {
    assert.match(image.filename, /^playbook-candidate-01-[a-z-]+-reference\.png$/u);
    assert.equal(image.width, 1920);
    assert.equal(image.height, 1080);
    assert.equal(image.sha256, sha256(image.bytes));
    assert.equal(Object.hasOwn(image, 'rgba'), false);
    assert.equal(Object.hasOwn(image, 'depth'), false);
  }
});

test('rejects empty or out-of-bounds canonical operations', () => {
  assert.throws(() => renderReferenceView({
    blueprint: BLUEPRINT, operations: [], camera: CAMERA, settings: P6_VISUAL_SETTINGS
  }), { code: 'P6_RENDER_FAILED' });
  assert.throws(() => renderReferenceView({
    blueprint: BLUEPRINT,
    operations: [{ kind: 'setblock', at: { x: 3, y: 1, z: 1 }, block: 'minecraft:stone' }],
    camera: CAMERA,
    settings: P6_VISUAL_SETTINGS
  }), { code: 'P6_RENDER_FAILED' });
});

function decodeRgba(png) {
  const { width, height } = inspectPngHeader(png);
  const chunks = chunksOf(png);
  const raw = inflateSync(Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)));
  const rgba = Buffer.alloc(width * height * 4);
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    assert.equal(raw[y * (stride + 1)], 0);
    raw.copy(rgba, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  }
  return rgba;
}

function chunksOf(png) {
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

function pixelSet(rgba) {
  const colors = new Set();
  for (let index = 0; index < rgba.length; index += 4) {
    colors.add(`${rgba[index]},${rgba[index + 1]},${rgba[index + 2]},${rgba[index + 3]}`);
  }
  return colors;
}

function shade(color, factor) {
  return color.map((component, index) => index === 3 ? component : Math.round(component * factor));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
