// Script to generate PWA icons
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Create a simple PNG file with the Block-You game board icon
// This creates a minimal valid PNG with a colorful grid pattern

function createPNG(size) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdr = createIHDR(size, size);

  // IDAT chunk (image data)
  const idat = createIDAT(size);

  // IEND chunk
  const iend = createIEND();

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createIHDR(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8);  // bit depth
  data.writeUInt8(2, 9);  // color type (RGB)
  data.writeUInt8(0, 10); // compression
  data.writeUInt8(0, 11); // filter
  data.writeUInt8(0, 12); // interlace

  return createChunk('IHDR', data);
}

function createIDAT(size) {
  const zlib = require('zlib');

  // Create RGB pixel data with filter byte
  const rowSize = size * 3 + 1; // RGB (3 bytes) per pixel + 1 filter byte
  const rawData = Buffer.alloc(rowSize * size);

  // Colors for the 4 player corners (Blue, Yellow, Red, Green)
  const colors = {
    blue: [33, 150, 243],
    yellow: [255, 235, 59],
    red: [244, 67, 54],
    green: [76, 175, 80],
    white: [245, 245, 245],
    grid: [200, 200, 200]
  };

  const cellSize = Math.floor(size / 5);
  const padding = Math.floor(cellSize * 0.5);
  const gridStart = padding;
  const gridSize = cellSize * 4;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // No filter

    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      let color = colors.white;

      // Check if inside grid area
      const gridX = x - gridStart;
      const gridY = y - gridStart;

      if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
        const cellX = Math.floor(gridX / cellSize);
        const cellY = Math.floor(gridY / cellSize);
        const inCellX = gridX % cellSize;
        const inCellY = gridY % cellSize;

        // Grid lines
        if (inCellX === 0 || inCellY === 0) {
          color = colors.grid;
        } else {
          // Color corners
          if (cellX === 0 && cellY === 0) color = colors.blue;
          else if (cellX === 3 && cellY === 0) color = colors.yellow;
          else if (cellX === 0 && cellY === 3) color = colors.red;
          else if (cellX === 3 && cellY === 3) color = colors.green;
          // Add some pieces in other cells
          else if (cellX === 1 && cellY === 0) color = colors.blue;
          else if (cellX === 2 && cellY === 1) color = colors.yellow;
          else if (cellX === 1 && cellY === 2) color = colors.red;
          else if (cellX === 2 && cellY === 3) color = colors.green;
        }
      }

      rawData[pixelOffset] = color[0];
      rawData[pixelOffset + 1] = color[1];
      rawData[pixelOffset + 2] = color[2];
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return createChunk('IDAT', compressed);
}

function createIEND() {
  return createChunk('IEND', Buffer.alloc(0));
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = makeCRCTable();

  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
  }

  return crc ^ 0xFFFFFFFF;
}

function makeCRCTable() {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  return table;
}

// Generate icons
const sizes = [192, 512];
const outputDir = path.join(__dirname, '..');

sizes.forEach(size => {
  const png = createPNG(size);
  const filename = path.join(outputDir, `icon-${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
});

console.log('Icons generated successfully!');
