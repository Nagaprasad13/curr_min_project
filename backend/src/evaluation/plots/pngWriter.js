/**
 * CareBridge Pure Zero-Dependency PNG Generator
 * 
 * Encodes raw 24-bit RGB pixel buffers into standard PNG format
 * using Node.js built-in `zlib` module. Guaranteed to run on any machine without native deps.
 */

const zlib = require('zlib');

/**
 * Calculates CRC32 checksum for a PNG chunk.
 */
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    for (let j = 0; j < 8; j++) {
      const bit = (byte ^ crc) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
      byte >>>= 1;
    }
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Creates a PNG chunk with length, type, data, and CRC32.
 */
function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

/**
 * Encodes an RGB canvas buffer into a PNG file buffer.
 * 
 * @param {number} width 
 * @param {number} height 
 * @param {Buffer} rgbBuffer Buffer of size width * height * 3 (RGB)
 * @returns {Buffer} Valid PNG file Buffer
 */
function encodePNG(width, height, rgbBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type 2: RGB
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw Scanlines with Filter 0 (None)
  const rowBytes = width * 3;
  const scanlines = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (1 + rowBytes);
    scanlines[scanlineOffset] = 0; // Filter byte: 0
    const srcOffset = y * rowBytes;
    rgbBuffer.copy(scanlines, scanlineOffset + 1, srcOffset, srcOffset + rowBytes);
  }

  // IDAT Chunk (Compressed scanlines)
  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Simple RGB Canvas for drawing lines, boxes, and text.
 */
class SimpleCanvas {
  constructor(width, height, bg = [255, 255, 255]) {
    this.width = width;
    this.height = height;
    this.buffer = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      this.buffer[i * 3] = bg[0];
      this.buffer[i * 3 + 1] = bg[1];
      this.buffer[i * 3 + 2] = bg[2];
    }
  }

  setPixel(x, y, color) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 3;
    this.buffer[idx] = color[0];
    this.buffer[idx + 1] = color[1];
    this.buffer[idx + 2] = color[2];
  }

  fillRect(x, y, w, h, color) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.setPixel(px, py, color);
      }
    }
  }

  drawLine(x0, y0, x1, y1, color, thickness = 1) {
    let ix0 = Math.round(x0);
    let iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);

    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;
    const maxSteps = (dx + dy) * 2 + 50;
    let steps = 0;

    while (steps++ < maxSteps) {
      if (thickness <= 1) {
        this.setPixel(ix0, iy0, color);
      } else {
        const half = Math.floor(thickness / 2);
        for (let ox = -half; ox <= half; ox++) {
          for (let oy = -half; oy <= half; oy++) {
            this.setPixel(ix0 + ox, iy0 + oy, color);
          }
        }
      }
      if (ix0 === ix1 && iy0 === iy1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        ix0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        iy0 += sy;
      }
    }
  }

  toPNG() {
    return encodePNG(this.width, this.height, this.buffer);
  }
}

module.exports = {
  encodePNG,
  SimpleCanvas,
};
