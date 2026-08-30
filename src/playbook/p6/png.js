import { constants as zlibConstants, deflateSync } from 'node:zlib';

import { p6Error } from './contracts.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = createCrcTable();

export function encodeRgbaPng({ width, height, rgba } = {}) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) failed();
  if (!(Buffer.isBuffer(rgba) || rgba instanceof Uint8Array) || rgba.byteLength !== width * height * 4) failed();
  const stride = width * 4;
  const scanlines = Buffer.allocUnsafe(height * (stride + 1));
  const source = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let row = 0; row < height; row += 1) {
    const outputOffset = row * (stride + 1);
    scanlines[outputOffset] = 0;
    source.copy(scanlines, outputOffset + 1, row * stride, (row + 1) * stride);
  }
  const compressed = deflateSync(scanlines, {
    level: 9,
    memLevel: 8,
    strategy: zlibConstants.Z_DEFAULT_STRATEGY,
    windowBits: 15
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export function inspectPngHeader(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) failed();
  let offset = PNG_SIGNATURE.length;
  let header;
  let sawIdat = false;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) failed();
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) failed();
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([typeBytes, data])) !== expectedCrc) failed();
    if (!header) {
      if (type !== 'IHDR' || length !== 13) failed();
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bit_depth: data[8],
        color_type: data[9]
      };
      if (header.width <= 0 || header.height <= 0 || header.bit_depth !== 8
        || header.color_type !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) failed();
    } else if (type === 'IHDR') failed();
    if (type === 'IDAT') sawIdat = true;
    if (type === 'IEND') {
      if (length !== 0 || !sawIdat || end !== bytes.length) failed();
      sawEnd = true;
    }
    offset = end;
  }
  if (!header || !sawEnd) failed();
  return header;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const result = Buffer.allocUnsafe(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

function failed() { throw p6Error('P6_RENDER_FAILED'); }
