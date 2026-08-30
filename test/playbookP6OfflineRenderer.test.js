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
const BLUEPRINT = { bounds: BOUNDS, operations: CUBE };
const BLUEPRINT_SHA256 = sha256(Buffer.from(stableJsonIndependent(BLUEPRINT)));

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

test('visible geometry changes alter the reference hash without changing material', () => {
  const solid = renderReferenceView({ blueprint: BLUEPRINT, operations: CUBE, camera: CAMERA, settings: P6_VISUAL_SETTINGS });
  const missingCorner = renderReferenceView({
    blueprint: BLUEPRINT,
    operations: [...CUBE, { kind: 'setblock', at: { x: 2, y: 2, z: 2 }, block: 'minecraft:air' }],
    camera: CAMERA,
    settings: P6_VISUAL_SETTINGS
  });
  assert.notEqual(sha256(solid), sha256(missingCorner));
});

test('z-buffer keeps the nearer color when lexicographic traversal draws it first', () => {
  const overlapCamera = {
    view_id: 'quarter-southwest', horizontal_fov_degrees: 70,
    position: { x: '-5.000000', y: '-5.000000', z: '-5.000000' },
    target: { x: '1.000000', y: '1.000000', z: '1.000000' }
  };
  const near = { kind: 'setblock', at: { x: 0, y: 0, z: 0 }, block: 'minecraft:gold_block', material_role: 'accent' };
  const far = { kind: 'setblock', at: { x: 2, y: 2, z: 2 }, block: 'minecraft:oak_planks', material_role: 'timber' };
  const png = renderReferenceView({ blueprint: BLUEPRINT, operations: [far, near], camera: overlapCamera, settings: P6_VISUAL_SETTINGS });
  assert.deepEqual(pixelAt(decodeRgba(png), 1920, 960, 540), shade(P6_REFERENCE_PALETTE.accent, 0.60));
});

test('operation order is final-write-wins and air removes prior geometry', () => {
  const overlapCamera = {
    view_id: 'quarter-southwest', horizontal_fov_degrees: 70,
    position: { x: '-5.000000', y: '-5.000000', z: '-5.000000' },
    target: { x: '1.000000', y: '1.000000', z: '1.000000' }
  };
  const nearAccent = { kind: 'setblock', at: { x: 0, y: 0, z: 0 }, block: 'minecraft:gold_block', material_role: 'accent' };
  const nearTimber = { kind: 'setblock', at: { x: 0, y: 0, z: 0 }, block: 'minecraft:oak_planks', material_role: 'timber' };
  const farStone = { kind: 'setblock', at: { x: 2, y: 2, z: 2 }, block: 'minecraft:stone', material_role: 'stone' };
  const overwritten = renderReferenceView({ blueprint: BLUEPRINT, operations: [nearAccent, nearTimber], camera: overlapCamera, settings: P6_VISUAL_SETTINGS });
  assert.deepEqual(pixelAt(decodeRgba(overwritten), 1920, 960, 540), shade(P6_REFERENCE_PALETTE.timber, 0.60));
  const removed = renderReferenceView({
    blueprint: BLUEPRINT,
    operations: [nearAccent, farStone, { ...nearAccent, block: 'minecraft:air', material_role: undefined }],
    camera: overlapCamera,
    settings: P6_VISUAL_SETTINGS
  });
  assert.deepEqual(pixelAt(decodeRgba(removed), 1920, 960, 540), shade(P6_REFERENCE_PALETTE.stone, 0.60));
});

test('renders exactly six ordered files without retaining decoded pixels', () => {
  const cameraManifest = deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01',
    blueprintSha256: BLUEPRINT_SHA256,
    buildFunctionSha256: HASH_B,
    bounds: BOUNDS,
    mainEntry: { center_x: 1, center_y: 1, center_z: 2, facing: 'south' },
    sharedFraming: null
  });
  const images = renderReferenceViews({
    solution: {
      solution_id: 'playbook-candidate-01',
      blueprint_sha256: BLUEPRINT_SHA256,
      build_function_sha256: HASH_B,
      bounds: BOUNDS,
      main_entry: { center_x: 1, center_y: 1, center_z: 2, facing: 'south' },
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

test('reference-view orchestration validates the complete camera and solution authority', () => {
  const { solution, cameraManifest } = validReferenceAuthority();
  assert.equal(renderReferenceViews({ solution, cameraManifest, settings: P6_VISUAL_SETTINGS }).length, 6);

  const staleBlueprint = { ...solution, blueprint_sha256: HASH_A };
  assert.throws(
    () => renderReferenceViews({ solution: staleBlueprint, cameraManifest, settings: P6_VISUAL_SETTINGS }),
    stableRenderError
  );
  const staleBuild = { ...solution, build_function_sha256: HASH_A };
  assert.throws(
    () => renderReferenceViews({ solution: staleBuild, cameraManifest, settings: P6_VISUAL_SETTINGS }),
    stableRenderError
  );
  const substitutedOperations = {
    ...solution,
    operations: [{ kind: 'setblock', at: { x: 1, y: 1, z: 1 }, block: 'minecraft:stone_bricks', material_role: 'stone' }]
  };
  assert.throws(
    () => renderReferenceViews({ solution: substitutedOperations, cameraManifest, settings: P6_VISUAL_SETTINGS }),
    stableRenderError
  );
  const malformedCamera = structuredClone(cameraManifest);
  malformedCamera.views[0].position.x = 1;
  assert.throws(
    () => renderReferenceViews({ solution, cameraManifest: malformedCamera, settings: P6_VISUAL_SETTINGS }),
    stableRenderError
  );
  const arbitraryCamera = structuredClone(cameraManifest);
  arbitraryCamera.views[0].position.x = '99.000000';
  assert.throws(
    () => renderReferenceViews({ solution, cameraManifest: arbitraryCamera, settings: P6_VISUAL_SETTINGS }),
    stableRenderError
  );
  const staleRequest = structuredClone(cameraManifest);
  staleRequest.request_sha256 = HASH_A;
  assert.throws(
    () => renderReferenceViews({ solution, cameraManifest: staleRequest, settings: P6_VISUAL_SETTINGS }),
    stableRenderError
  );
});

test('camera coordinates require primitive six-decimal strings without native error leakage', () => {
  for (const value of ['', null, 1, Symbol('coordinate')]) {
    const camera = { ...CAMERA, position: { ...CAMERA.position, x: value } };
    assert.throws(
      () => renderReferenceView({ blueprint: BLUEPRINT, operations: CUBE, camera, settings: P6_VISUAL_SETTINGS }),
      stableRenderError
    );
  }
});

test('successful and rejected renders leave every caller input unchanged', () => {
  const success = {
    blueprint: structuredClone(BLUEPRINT), operations: structuredClone(CUBE),
    camera: structuredClone(CAMERA), settings: structuredClone(P6_VISUAL_SETTINGS)
  };
  const successBefore = structuredClone(success);
  renderReferenceView(success);
  assert.deepEqual(success, successBefore);

  const rejected = {
    blueprint: structuredClone(BLUEPRINT),
    operations: [{ kind: 'setblock', at: { x: 3, y: 1, z: 1 }, block: 'minecraft:stone' }],
    camera: structuredClone(CAMERA), settings: structuredClone(P6_VISUAL_SETTINGS)
  };
  const rejectedBefore = structuredClone(rejected);
  assert.throws(() => renderReferenceView(rejected), stableRenderError);
  assert.deepEqual(rejected, rejectedBefore);
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

function pixelAt(rgba, width, x, y) {
  const offset = (y * width + x) * 4;
  return [...rgba.subarray(offset, offset + 4)];
}

function shade(color, factor) {
  return color.map((component, index) => index === 3 ? component : Math.round(component * factor));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJsonIndependent(value) {
  return `${JSON.stringify(sortIndependent(value), null, 2)}\n`;
}

function sortIndependent(value) {
  if (Array.isArray(value)) return value.map(sortIndependent);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortIndependent(value[key])]));
}

function validReferenceAuthority() {
  const cameraManifest = deriveFixedViewManifest({
    solutionId: 'playbook-candidate-01', blueprintSha256: BLUEPRINT_SHA256,
    buildFunctionSha256: HASH_B, bounds: BOUNDS,
    mainEntry: { center_x: 1, center_y: 1, center_z: 2, facing: 'south' }, sharedFraming: null
  });
  return {
    solution: {
      solution_id: 'playbook-candidate-01', blueprint_sha256: BLUEPRINT_SHA256,
      build_function_sha256: HASH_B, bounds: BOUNDS,
      main_entry: { center_x: 1, center_y: 1, center_z: 2, facing: 'south' },
      blueprint: BLUEPRINT, operations: CUBE
    },
    cameraManifest
  };
}

function stableRenderError(error) {
  return error?.name === 'P6ContractError'
    && ['P6_RENDER_FAILED', 'P6_CAMERA_PROTOCOL_INVALID'].includes(error.code);
}
