// Minimal PNG reader/writer for 8-bit RGB/RGBA (no deps).
// Used to crop the floor-plan render and to verify hotspot placement by
// sampling pixels. Not general-purpose: handles colour types 2 and 6 only,
// which is all pdftoppm emits.
const fs = require('fs');
const zlib = require('zlib');

function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png: ' + file);

  let pos = 8, w = 0, h = 0, ch = 0, bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      bitDepth = body[8];
      const colour = body[9];
      if (bitDepth !== 8 || (colour !== 2 && colour !== 6)) {
        throw new Error(`unsupported png: depth=${bitDepth} colour=${colour}`);
      }
      ch = colour === 2 ? 3 : 4;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);

  // Undo per-scanline filters (PNG spec 9.2).
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
      }
      cur[i] = v & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

function crop(img, x, y, w, h) {
  const out = Buffer.alloc(w * h * img.ch);
  for (let r = 0; r < h; r++) {
    img.data.copy(out, r * w * img.ch, ((y + r) * img.w + x) * img.ch, ((y + r) * img.w + x + w) * img.ch);
  }
  return { w, h, ch: img.ch, data: out };
}

function encode(img, file) {
  const stride = img.w * img.ch;
  const raw = Buffer.alloc((stride + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    img.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, body) => {
    const b = Buffer.alloc(12 + body.length);
    b.writeUInt32BE(body.length, 0);
    b.write(type, 4, 'ascii');
    body.copy(b, 8);
    b.writeInt32BE(crc(b.subarray(4, 8 + body.length)) | 0, 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = img.ch === 3 ? 2 : 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

let crcTable = null;
function crc(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/** Bounding box of everything that isn't the top-left corner colour. */
function contentBox(img, tol = 12) {
  const px = (x, y) => {
    const i = (y * img.w + x) * img.ch;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  const bg = px(0, 0);
  const differs = (x, y) => {
    const p = px(x, y);
    return Math.abs(p[0] - bg[0]) > tol || Math.abs(p[1] - bg[1]) > tol || Math.abs(p[2] - bg[2]) > tol;
  };
  let x0 = img.w, y0 = img.h, x1 = 0, y1 = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!differs(x, y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, bg };
}

module.exports = { decode, encode, crop, contentBox };
