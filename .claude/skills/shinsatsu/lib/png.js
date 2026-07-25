// PNG の読み・書き・差分 — 依存ゼロ(node:zlib のみ)
//
// スクリーンショット同士を画素で比べるために、PNG コーデックを自前で持つ。
// Chromium のスクリーンショットは 8bit・非インターレースの RGB/RGBA なので、
// その範囲だけを正しく扱う(汎用 PNG ライブラリにはしない)。

import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** PNG → { width, height, data: RGBA Buffer } */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('PNG ではない');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0) {
    throw new Error(`未対応の PNG 形式 (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const line = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0; // 左
      const b = prev[x];                      // 上
      const c = x >= bpp ? prev[x - bpp] : 0; // 左上
      let v = row[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: throw new Error(`未知の PNG filter: ${filter}`);
      }
      line[x] = v;
    }
    for (let px = 0; px < width; px++) {
      const s = px * bpp, d = (y * width + px) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

function chunk(type, data) {
  const buf = Buffer.alloc(12 + data.length);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, 'latin1');
  data.copy(buf, 8);
  buf.writeUInt32BE(crc32(buf.subarray(4, 8 + data.length)), 8 + data.length);
  return buf;
}

/** { width, height, data: RGBA } → PNG Buffer */
export function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // 各行 filter 0
  for (let y = 0; y < height; y++) data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * 2 枚の PNG の差分(absdiff)。
 * 変わった画素を赤く塗り、下地は淡いグレーに沈めた差分画像と、変化率を返す。
 * threshold はチャンネル差の閾値(アンチエイリアスの揺れを拾わない程度)。
 */
export function diffPng(aBuf, bBuf, { threshold = 24 } = {}) {
  const a = decodePng(aBuf);
  const b = decodePng(bBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { ratio: 1, count: -1, total: 0, png: null, sizeMismatch: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const total = a.width * a.height;
  const out = Buffer.alloc(total * 4);
  let count = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const d = Math.max(
      Math.abs(a.data[o] - b.data[o]),
      Math.abs(a.data[o + 1] - b.data[o + 1]),
      Math.abs(a.data[o + 2] - b.data[o + 2]),
    );
    if (d > threshold) {
      count++;
      out[o] = 235; out[o + 1] = 40; out[o + 2] = 40; out[o + 3] = 255;
    } else {
      const g = Math.round((a.data[o] * 0.299 + a.data[o + 1] * 0.587 + a.data[o + 2] * 0.114) * 0.3 + 165);
      out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = 255;
    }
  }
  return { ratio: count / total, count, total, png: encodePng({ width: a.width, height: a.height, data: out }) };
}
