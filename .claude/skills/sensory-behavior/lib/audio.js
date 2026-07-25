// 耳の解析 — PCM から音量・破綻・音階を読み、波形とスペクトログラムを描く
//
// Claude は音を直接は聴けない。だからここで音を「見える形」と「数値」に
// 翻訳する: 波形 PNG / スペクトログラム PNG / dBFS / クリッピング率 /
// 卓越周波数と音名。user の耳のためには .wav も書き出す(官能評価の原音)。

import { encodePng } from './png.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PENTA = [0, 2, 4, 7, 9]; // メジャーペンタトニック(移調は 12 通り試す)

/** base64(PCM16 mono) → Float32Array [-1, 1] */
export function decodePcm16(b64) {
  const raw = Buffer.from(b64, 'base64');
  const n = raw.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = raw.readInt16LE(i * 2) / 0x8000;
  return out;
}

/** PCM16 mono → WAV Buffer */
export function wavEncode(b64, sampleRate) {
  const data = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** in-place 基数 2 FFT */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function magnitudes(pcm, offset, size) {
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)); // Hann
    re[i] = (pcm[offset + i] || 0) * w;
  }
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
export const fmtDb = (x) => (Number.isFinite(x) ? `${x.toFixed(1)} dBFS` : '-∞ dBFS(完全な無音)');

function noteOf(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  return {
    name: `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`,
    pc: ((nearest % 12) + 12) % 12,
    cents: Math.round((midi - nearest) * 100),
  };
}

/** 音名集合がメジャーペンタトニック(いずれかの移調)に収まるなら root を返す */
export function pentatonicRoot(pitchClasses) {
  const set = [...new Set(pitchClasses)];
  if (!set.length) return null;
  for (let r = 0; r < 12; r++) {
    const scale = new Set(PENTA.map((p) => (p + r) % 12));
    if (set.every((pc) => scale.has(pc))) return NOTE_NAMES[r];
  }
  return null;
}

/** 波形 PNG(min/max 柱) */
export function waveformPng(pcm, { width = 960, height = 150 } = {}) {
  const img = Buffer.alloc(width * height * 4);
  const put = (x, y, r, g, b) => {
    const o = (y * width + x) * 4;
    img[o] = r; img[o + 1] = g; img[o + 2] = b; img[o + 3] = 255;
  };
  for (let i = 0; i < width * height; i++) {
    img[i * 4] = 16; img[i * 4 + 1] = 22; img[i * 4 + 2] = 30; img[i * 4 + 3] = 255;
  }
  const mid = height >> 1;
  for (let x = 0; x < width; x++) put(x, mid, 40, 55, 70);
  const per = pcm.length / width;
  for (let x = 0; x < width; x++) {
    let lo = 0, hi = 0;
    const s = Math.floor(x * per), e = Math.min(pcm.length, Math.ceil((x + 1) * per));
    for (let i = s; i < e; i++) {
      if (pcm[i] < lo) lo = pcm[i];
      if (pcm[i] > hi) hi = pcm[i];
    }
    const y1 = Math.max(0, Math.round(mid - hi * (mid - 2)));
    const y2 = Math.min(height - 1, Math.round(mid - lo * (mid - 2)));
    for (let y = y1; y <= y2; y++) put(x, y, 120, 230, 210);
  }
  return encodePng({ width, height, data: img });
}

/** スペクトログラム PNG(x=時間, y=周波数 低→下, 明るさ=強さ) */
export function spectrogramPng(pcm, sampleRate, { fftSize = 1024, hop = 512, fMax = 6000 } = {}) {
  const frames = Math.max(1, Math.floor((pcm.length - fftSize) / hop) + 1);
  const bins = Math.min(fftSize / 2, Math.ceil((fMax / sampleRate) * fftSize));
  const cols = Math.min(frames, 960);
  const height = bins;
  const img = Buffer.alloc(cols * height * 4);
  let peak = 1e-9;
  const grid = [];
  for (let c = 0; c < cols; c++) {
    const f = Math.floor((c / cols) * frames);
    const mag = magnitudes(pcm, f * hop, fftSize);
    grid.push(mag);
    for (let b = 0; b < bins; b++) if (mag[b] > peak) peak = mag[b];
  }
  for (let c = 0; c < cols; c++) {
    for (let b = 0; b < bins; b++) {
      const v = Math.max(0, 1 + db(grid[c][b] / peak) / 70); // -70dB を床に正規化
      const y = height - 1 - b;
      const o = (y * cols + c) * 4;
      // 夜の水面 → 燐光 → 白 のランプ
      const r = v < 0.5 ? 10 + v * 2 * 40 : 50 + (v - 0.5) * 2 * 205;
      const g = v < 0.5 ? 18 + v * 2 * 130 : 148 + (v - 0.5) * 2 * 107;
      const bl = v < 0.5 ? 28 + v * 2 * 125 : 153 + (v - 0.5) * 2 * 92;
      img[o] = r; img[o + 1] = g; img[o + 2] = bl; img[o + 3] = 255;
    }
  }
  return encodePng({ width: cols, height, data: img });
}

/**
 * 総合解析。
 * @returns {{ seconds, rmsDb, peakDb, clipRatio, peaks, pitchClasses, pentaRoot, summary }}
 */
export function analyzePcm(pcm, sampleRate) {
  const n = pcm.length;
  let sum = 0, peakAbs = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(pcm[i]);
    sum += pcm[i] * pcm[i];
    if (a > peakAbs) peakAbs = a;
    if (a > 0.985) clipped++;
  }
  const rmsDb = db(Math.sqrt(sum / Math.max(1, n)));
  const peakDb = db(peakAbs);
  const clipRatio = clipped / Math.max(1, n);

  // 平均スペクトル → 卓越ピーク
  const SIZE = 4096;
  const avg = new Float64Array(SIZE / 2);
  let frames = 0;
  for (let off = 0; off + SIZE <= n; off += SIZE / 2) {
    const mag = magnitudes(pcm, off, SIZE);
    for (let i = 0; i < avg.length; i++) avg[i] += mag[i];
    frames++;
  }
  const peaks = [];
  if (frames > 0) {
    for (let i = 0; i < avg.length; i++) avg[i] /= frames;
    const minBin = Math.ceil((40 / sampleRate) * SIZE); // 40Hz 未満は無視
    let top = 1e-12;
    for (let i = minBin; i < avg.length; i++) if (avg[i] > top) top = avg[i];
    for (let i = minBin + 1; i < avg.length - 1; i++) {
      if (avg[i] > avg[i - 1] && avg[i] >= avg[i + 1] && avg[i] > top * 0.05) {
        // 放物線補間で周波数を細める
        const a = avg[i - 1], b = avg[i], c = avg[i + 1];
        const d = (a - c) / (2 * (a - 2 * b + c) || 1);
        const freq = ((i + d) * sampleRate) / SIZE;
        peaks.push({ freq, mag: b });
      }
    }
    peaks.sort((x, y) => y.mag - x.mag);
    peaks.length = Math.min(peaks.length, 8);
    for (const p of peaks) Object.assign(p, noteOf(p.freq));
  }
  const pitchClasses = peaks.map((p) => p.pc);
  const pentaRoot = pentatonicRoot(pitchClasses);
  const notes = peaks.slice(0, 5).map((p) => `${p.name}${p.cents ? `${p.cents > 0 ? '+' : ''}${p.cents}c` : ''}`).join(' ');
  const summary =
    `${(n / sampleRate).toFixed(1)}s / RMS ${fmtDb(rmsDb)} / peak ${fmtDb(peakDb)} / ` +
    `クリッピング ${(clipRatio * 100).toFixed(2)}%` +
    (notes ? ` / 主な音: ${notes}` : '') +
    (pentaRoot ? ` / 五音音階に収まる(root ${pentaRoot})` : '');
  return { seconds: n / sampleRate, rmsDb, peakDb, clipRatio, peaks, pitchClasses, pentaRoot, summary };
}
