/**
 * Procedural asset generator for Motion Browser.
 * Every binary, SVG, shader, sound, and JSON under public/motion is original
 * (or a licensed font copied from the local Fontsource package) and written here.
 * Run: node scripts/generate-motion-assets.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, extname } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const out = join(root, "public", "motion");

function ensure(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function write(rel, data) {
  const path = join(out, rel);
  ensure(path);
  writeFileSync(path, data);
  return path;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const dest = y * (stride + 1);
    raw[dest] = 0;
    for (let x = 0; x < stride; x += 1) raw[dest + 1 + x] = rgba[y * stride + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function paint(width, height, shader) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = shader(x, y, width, height);
      const i = (y * width + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
  return encodePng(width, height, rgba);
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const textures = {
  "textures/environment/floor_basecolor.png": paint(512, 512, (x, y, w, h) => {
    const u = (x / (w - 1)) * 2 - 1;
    const v = (y / (h - 1)) * 2 - 1;
    const r = Math.hypot(u, v);
    const ring = Math.abs(Math.sin(r * 28)) ** 8;
    const grain = hash2(x * 0.35, y * 0.35) * 10;
    const shade = 14 + (1 - Math.min(r, 1)) * 18 + ring * 22 + grain;
    return [clampByte(shade * 0.85), clampByte(shade * 0.95), clampByte(shade * 1.15), 255];
  }),
  "textures/environment/floor_roughness.png": paint(512, 512, (x, y) => {
    const n = hash2(x * 0.5, y * 0.2);
    const band = 150 + Math.sin(y * 0.35) * 18 + n * 40;
    return [band, band, band, 255];
  }),
  "textures/environment/floor_normal.png": paint(512, 512, (x, y, w, h) => {
    const u = (x / (w - 1)) * 2 - 1;
    const v = (y / (h - 1)) * 2 - 1;
    const r = Math.hypot(u, v);
    const ridge = Math.cos(r * 28);
    const nx = 128 + u * ridge * 10;
    const ny = 128 + v * ridge * 10;
    return [clampByte(nx), clampByte(ny), 235, 255];
  }),
  "textures/environment/distant_sky.png": paint(512, 256, (x, y, w, h) => {
    const t = y / (h - 1);
    const horizon = Math.exp(-((t - 0.72) ** 2) / 0.02);
    const r = 7 + t * 10 + horizon * 28;
    const g = 10 + t * 16 + horizon * 48;
    const b = 18 + t * 28 + horizon * 62;
    const star = hash2(x, y) > 0.997 ? 180 : 0;
    return [clampByte(r + star), clampByte(g + star), clampByte(b + star), 255];
  }),
  "textures/materials/brushed_metal_basecolor.png": paint(256, 256, (x, y) => {
    const streak = Math.sin(y * 0.85 + hash2(0, y) * 2) * 8;
    const base = 42 + streak + hash2(x, y) * 6;
    return [clampByte(base), clampByte(base + 2), clampByte(base + 6), 255];
  }),
  "textures/materials/brushed_metal_roughness.png": paint(256, 256, (x, y) => {
    const v = 92 + Math.sin(y * 1.3) * 16 + hash2(x * 0.4, y) * 20;
    return [v, v, v, 255];
  }),
  "textures/materials/glass_noise.png": paint(256, 256, (x, y) => {
    const n = hash2(x * 0.8, y * 0.8);
    const v = 118 + n * 40;
    return [v, v, v, 255];
  }),
  "textures/materials/carbon_detail.png": paint(256, 256, (x, y) => {
    const weave = ((x + y) % 8 < 2) || ((x - y + 256) % 11 < 2);
    const v = weave ? 58 : 28;
    return [v, v + 1, v + 4, 255];
  }),
  "textures/ui/noise_256.png": paint(256, 256, (x, y) => {
    const n = hash2(x, y);
    const v = 120 + n * 30;
    return [v, v, v, 255];
  }),
  "textures/ui/soft_gradient.png": paint(256, 256, (_x, y, _w, h) => {
    const t = y / (h - 1);
    const a = Math.round((1 - t) * 170);
    return [84, 217, 242, a];
  }),
  "textures/fallback/texture_fallback.png": paint(64, 64, (x, y) => {
    const check = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    const v = check ? 28 : 18;
    return [v, v + 4, v + 10, 255];
  }),
  "environment/environment_preview.png": paint(960, 540, (x, y, w, h) => {
    const u = x / w;
    const v = y / h;
    let r = 6 + (1 - v) * 8;
    let g = 8 + (1 - v) * 12;
    let b = 16 + (1 - v) * 22;
    const cx = (u - 0.5) * 1.6;
    const cy = (v - 0.58) * 1.15;
    const rad = Math.hypot(cx, cy);
    const ring = Math.exp(-((rad - 0.34) ** 2) / 0.0008) + Math.exp(-((rad - 0.48) ** 2) / 0.0012) * 0.6;
    r += ring * 40;
    g += ring * 120;
    b += ring * 150;
    const inFrame = Math.abs(cx) < 0.16 && Math.abs(cy) < 0.28;
    const edge = Math.abs(cx) > 0.145 && Math.abs(cx) < 0.16 && Math.abs(cy) < 0.28;
    const edgeY = Math.abs(cy) > 0.26 && Math.abs(cy) < 0.28 && Math.abs(cx) < 0.16;
    if (inFrame) {
      r = 10;
      g = 14;
      b = 22;
    }
    if (edge || edgeY) {
      r = 160;
      g = 190;
      b = 230;
    }
    const floor = v > 0.78 ? (v - 0.78) * 40 : 0;
    return [clampByte(r + floor), clampByte(g + floor), clampByte(b + floor * 1.3), 255];
  }),
};

for (const [rel, data] of Object.entries(textures)) write(rel, data);

function wavFromPcm(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) buffer.writeInt16LE(samples[i], 44 + i * 2);
  return buffer;
}

function synthTone({ freq, ms, volume, sampleRate = 22050, partials = [1] }) {
  const n = Math.max(1, Math.floor((sampleRate * ms) / 1000));
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = i / n;
    const attack = Math.min(1, i / Math.max(1, sampleRate * 0.008));
    const env = attack * Math.exp(-3.4 * p);
    let s = 0;
    for (const part of partials) {
      s += Math.sin(2 * Math.PI * freq * part * (i / sampleRate)) / part;
    }
    samples[i] = Math.max(-32767, Math.min(32767, s * volume * env * 32767));
  }
  return wavFromPcm(samples, sampleRate);
}

function synthLoop() {
  const sampleRate = 22050;
  const seconds = 8;
  const n = sampleRate * seconds;
  const samples = new Int16Array(n);
  const cyclesA = 110 * seconds;
  const cyclesB = 164.5 * seconds;
  for (let i = 0; i < n; i += 1) {
    const a = Math.sin((2 * Math.PI * cyclesA * i) / n);
    const b = Math.sin((2 * Math.PI * cyclesB * i) / n) * 0.35;
    const trem = 0.82 + 0.18 * Math.sin((2 * Math.PI * 2 * i) / n);
    samples[i] = Math.max(-32767, Math.min(32767, (a + b) * trem * 0.045 * 32767));
  }
  return wavFromPcm(samples, sampleRate);
}

write("audio/ui/focus.wav", synthTone({ freq: 740, ms: 70, volume: 0.12 }));
write("audio/ui/confirm.wav", synthTone({ freq: 520, ms: 120, volume: 0.11, partials: [1, 2] }));
write("audio/ui/back.wav", synthTone({ freq: 340, ms: 90, volume: 0.1 }));
write("audio/ui/panel_open.wav", synthTone({ freq: 410, ms: 110, volume: 0.09, partials: [1, 1.5] }));
write("audio/ui/panel_close.wav", synthTone({ freq: 300, ms: 100, volume: 0.09 }));
write("audio/ui/error_soft.wav", synthTone({ freq: 196, ms: 160, volume: 0.1, partials: [1, 1.41] }));
write("audio/ambience/observatory_loop.wav", synthLoop());

function icon(inner, view = 24) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" fill="none" stroke="#000" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`;
}

const icons = {
  "icons/navigation/back.svg": icon(`<path d="M14.5 5.5 8 12l6.5 6.5"/><path d="M8 12h11"/>`),
  "icons/navigation/forward.svg": icon(`<path d="M9.5 5.5 16 12l-6.5 6.5"/><path d="M16 12H5"/>`),
  "icons/navigation/reload.svg": icon(`<path d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2"/><path d="M19.5 4.5v4.2h-4.2"/>`),
  "icons/navigation/home.svg": icon(`<path d="M4 11.2 12 4.5l8 6.7"/><path d="M7.2 10.8V19.5h9.6v-8.7"/>`),
  "icons/navigation/close.svg": icon(`<path d="M6 6l12 12"/><path d="M18 6 6 18"/>`),
  "icons/navigation/expand.svg": icon(`<path d="M9 5H5v4"/><path d="M15 5h4v4"/><path d="M19 15v4h-4"/><path d="M5 15v4h4"/>`),
  "icons/navigation/collapse.svg": icon(`<path d="M5 9h4V5"/><path d="M15 5v4h4"/><path d="M19 15h-4v4"/><path d="M9 19v-4H5"/>`),
  "icons/navigation/external-open.svg": icon(`<path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V14"/><path d="M13 5h6v6"/><path d="M19 5 11 13"/>`),
  "icons/navigation/menu.svg": icon(`<path d="M4.5 7h15"/><path d="M4.5 12h15"/><path d="M4.5 17h15"/>`),
  "icons/navigation/more.svg": icon(`<circle cx="6" cy="12" r="0.8" fill="#000" stroke="none"/><circle cx="12" cy="12" r="0.8" fill="#000" stroke="none"/><circle cx="18" cy="12" r="0.8" fill="#000" stroke="none"/>`),
  "icons/browser/address.svg": icon(`<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M7 12h6"/><path d="M13 12l-1.4-1.4M13 12l-1.4 1.4"/>`),
  "icons/browser/search.svg": icon(`<circle cx="11" cy="11" r="5.5"/><path d="M15.2 15.2 19 19"/>`),
  "icons/browser/lock-state.svg": icon(`<rect x="6" y="10.5" width="12" height="8" rx="1.5"/><path d="M8.5 10.5V8.2a3.5 3.5 0 0 1 7 0"/><path d="M5 5.5 19 18.5"/>`),
  "icons/browser/globe.svg": icon(`<circle cx="12" cy="12" r="7.5"/><path d="M4.5 12h15"/><path d="M12 4.5c2.2 2.3 3.3 4.8 3.3 7.5s-1.1 5.2-3.3 7.5c-2.2-2.3-3.3-4.8-3.3-7.5s1.1-5.2 3.3-7.5"/>`),
  "icons/gestures/tilt-up.svg": icon(`<rect x="8" y="6" width="8" height="13" rx="1.6"/><path d="M12 3.2 12 6"/><path d="M10.2 4.6 12 3.2 13.8 4.6"/>`),
  "icons/gestures/tilt-down.svg": icon(`<rect x="8" y="5" width="8" height="13" rx="1.6"/><path d="M12 20.8V18"/><path d="M10.2 19.4 12 20.8l1.8-1.4"/>`),
  "icons/gestures/tilt-left.svg": icon(`<rect x="7" y="6" width="8" height="13" rx="1.6"/><path d="M4.2 12H7"/><path d="M5.4 10.2 4.2 12l1.2 1.8"/>`),
  "icons/gestures/tilt-right.svg": icon(`<rect x="9" y="6" width="8" height="13" rx="1.6"/><path d="M19.8 12H17"/><path d="M18.6 10.2 19.8 12l-1.2 1.8"/>`),
  "icons/gestures/rotate.svg": icon(`<path d="M18.5 8.5A6.5 6.5 0 1 0 19 14"/><path d="M18.5 4.8v4.1h-4"/>`),
  "icons/gestures/neutral-orientation.svg": icon(`<rect x="8" y="3.8" width="8" height="16.4" rx="1.8"/><path d="M5 12h14"/>`),
  "icons/gestures/sensor.svg": icon(`<rect x="8" y="3.5" width="8" height="17" rx="2"/><path d="M4.2 9.2a8 8 0 0 0 0 5.6"/><path d="M19.8 9.2a8 8 0 0 1 0 5.6"/><circle cx="12" cy="16.2" r="0.7" fill="#000" stroke="none"/>`),
  "icons/gestures/calibrate.svg": icon(`<circle cx="12" cy="12" r="6.5"/><path d="M12 3.5v3"/><path d="M12 17.5v3"/><path d="M3.5 12h3"/><path d="M17.5 12h3"/><circle cx="12" cy="12" r="1" fill="#000" stroke="none"/>`),
  "icons/gestures/gesture-disabled.svg": icon(`<rect x="8" y="3.5" width="8" height="17" rx="2"/><path d="M5 5l14 14"/>`),
  "icons/gestures/gesture-enabled.svg": icon(`<rect x="8" y="3.5" width="8" height="17" rx="2"/><path d="M10 12.2l1.4 1.4 2.8-3"/>`),
  "icons/gestures/sensitivity.svg": icon(`<path d="M5 16.5h14"/><path d="M7 16.5v-3"/><path d="M12 16.5V7.5"/><path d="M17 16.5v-5"/><circle cx="12" cy="7.5" r="1.2"/>`),
  "icons/gestures/reset-calibration.svg": icon(`<path d="M7 8.5A5.5 5.5 0 1 1 6.2 14"/><path d="M7 5.2v3.6h3.5"/><circle cx="15.5" cy="15.5" r="2.2"/>`),
  "icons/status/success.svg": icon(`<circle cx="12" cy="12" r="7.5"/><path d="M8.4 12.2 11 14.7 15.8 9.4"/>`),
  "icons/status/warning.svg": icon(`<path d="M12 4.2 20.2 19H3.8L12 4.2z"/><path d="M12 10v4.2"/><path d="M12 16.8h.01"/>`),
  "icons/status/error.svg": icon(`<circle cx="12" cy="12" r="7.5"/><path d="M9 9l6 6"/><path d="M15 9l-6 6"/>`),
  "icons/status/info.svg": icon(`<circle cx="12" cy="12" r="7.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>`),
  "icons/status/loading.svg": icon(`<path d="M12 4.5a7.5 7.5 0 1 1-6.4 3.6"/>`),
  "icons/status/offline.svg": icon(`<path d="M4 9.5a12 12 0 0 1 16 0"/><path d="M7 13a7 7 0 0 1 10 0"/><path d="M12 17.5h.01"/><path d="M5 5l14 14"/>`),
  "icons/status/permission.svg": icon(`<path d="M12 3.8 18.5 6.5v5.2c0 3.6-2.6 6.2-6.5 7.5-3.9-1.3-6.5-3.9-6.5-7.5V6.5L12 3.8z"/><path d="M9.2 12.1 11.1 14l3.8-4"/>`),
  "icons/system/reduced-motion.svg": icon(`<path d="M7 15.5c2.5-4 4-6.2 7.5-8"/><path d="M8.5 8.5h-3v3"/><path d="M5 5l14 14"/>`),
  "icons/system/sound-on.svg": icon(`<path d="M5 10h3l4-3v10l-4-3H5v-4z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5"/><path d="M17.8 7.5a6 6 0 0 1 0 9"/>`),
  "icons/system/sound-off.svg": icon(`<path d="M5 10h3l4-3v10l-4-3H5v-4z"/><path d="M16 10l4 4"/><path d="M20 10l-4 4"/>`),
  "icons/system/vibration-on.svg": icon(`<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M5 9v6"/><path d="M19 9v6"/><path d="M3.2 11v2"/><path d="M20.8 11v2"/>`),
  "icons/system/vibration-off.svg": icon(`<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4 5l16 14"/>`),
  "icons/system/contrast.svg": icon(`<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v15" fill="#000"/>`),
  "icons/system/text-size.svg": icon(`<path d="M5 17 9.2 6h1.2L15 17"/><path d="M6.6 13.2h6.2"/><path d="M17 17V9"/><path d="M17 9h2.2"/>`),
};

for (const [rel, data] of Object.entries(icons)) write(rel, data);

const mark = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#070A12"/>
  <circle cx="32" cy="32" r="22" fill="none" stroke="#54D9F2" stroke-width="2.4"/>
  <rect x="24" y="12" width="16" height="40" rx="3.2" fill="#101827" stroke="#F3F6FC" stroke-width="1.6"/>
  <rect x="24" y="12" width="16" height="7" rx="3.2" fill="#54D9F2"/>
  <rect x="24" y="16.2" width="16" height="3" fill="#54D9F2"/>
</svg>
`;
write("brand/motion-browser-mark.svg", mark);
write("brand/app-icon-foreground.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <circle cx="54" cy="54" r="28" fill="none" stroke="#54D9F2" stroke-width="3"/>
  <rect x="44" y="30" width="20" height="48" rx="4" fill="#101827" stroke="#F3F6FC" stroke-width="2"/>
  <rect x="44" y="30" width="20" height="9" rx="4" fill="#54D9F2"/>
  <rect x="44" y="35" width="20" height="4" fill="#54D9F2"/>
</svg>
`);
write("brand/app-icon-background.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <rect width="108" height="108" fill="#070A12"/>
  <circle cx="54" cy="54" r="40" fill="none" stroke="#143044" stroke-width="2"/>
</svg>
`);
write("brand/monochrome.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="22" fill="none" stroke="#000" stroke-width="3"/>
  <rect x="24" y="12" width="16" height="40" rx="3" fill="none" stroke="#000" stroke-width="3"/>
</svg>
`);
write("brand/motion-browser-wordmark.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 64">
  <circle cx="32" cy="32" r="18" fill="none" stroke="#54D9F2" stroke-width="2.2"/>
  <rect x="25" y="16" width="14" height="32" rx="2.5" fill="#101827" stroke="#F3F6FC" stroke-width="1.4"/>
  <rect x="25" y="16" width="14" height="6" fill="#54D9F2"/>
  <text x="64" y="42" fill="#F3F6FC" font-family="Outfit, sans-serif" font-size="28" letter-spacing="3">MOTION BROWSER</text>
</svg>
`);
write("brand/splash.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844">
  <rect width="390" height="844" fill="#070A12"/>
  <circle cx="195" cy="360" r="120" fill="none" stroke="#143044" stroke-width="2"/>
  <circle cx="195" cy="360" r="78" fill="none" stroke="#54D9F2" stroke-width="2"/>
  <rect x="171" y="292" width="48" height="136" rx="8" fill="#101827" stroke="#F3F6FC" stroke-width="2"/>
  <rect x="171" y="292" width="48" height="22" rx="8" fill="#54D9F2"/>
</svg>
`);

write("web/browser-shell/browser-frame.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
  <rect x="1.2" y="1.2" width="97.6" height="97.6" rx="4" fill="none" stroke="#8FB4C8" stroke-width="1.1"/>
  <path d="M8 1.2H1.2V8" fill="none" stroke="#54D9F2" stroke-width="1.4"/>
  <path d="M92 1.2H98.8V8" fill="none" stroke="#54D9F2" stroke-width="1.4"/>
  <path d="M1.2 92V98.8H8" fill="none" stroke="#54D9F2" stroke-width="1.4"/>
  <path d="M98.8 92V98.8H92" fill="none" stroke="#54D9F2" stroke-width="1.4"/>
</svg>
`);
write("web/browser-shell/focus-ring.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" preserveAspectRatio="none">
  <rect x="1" y="1" width="98" height="38" rx="19" fill="none" stroke="#54D9F2" stroke-width="1.5"/>
</svg>
`);
write("web/browser-shell/empty-state.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
  <rect width="160" height="120" fill="none"/>
  <circle cx="80" cy="60" r="36" fill="none" stroke="#54D9F2" stroke-width="2"/>
  <rect x="68" y="34" width="24" height="52" rx="4" fill="#101827" stroke="#F3F6FC" stroke-width="1.5"/>
</svg>
`);
write("web/browser-shell/error-state.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
  <circle cx="80" cy="58" r="28" fill="none" stroke="#FF707A" stroke-width="2"/>
  <path d="M80 44v20" stroke="#FF707A" stroke-width="2" stroke-linecap="round"/>
  <circle cx="80" cy="72" r="1.4" fill="#FF707A"/>
</svg>
`);
write("web/browser-shell/offline-state.svg", `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
  <path d="M40 70a28 28 0 0 1 40-22 22 22 0 0 1 36 16" fill="none" stroke="#AAB6C8" stroke-width="2"/>
  <path d="M48 48l64 48" stroke="#FF707A" stroke-width="2" stroke-linecap="round"/>
</svg>
`);

const shaders = {
  "shaders/portal_vertex.glsl": `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  "shaders/portal_fragment.glsl": `uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float sweep = fract(uTime * 0.07);
  float delta = abs(fract(vUv.x - sweep + 0.5) - 0.5);
  float band = smoothstep(0.08, 0.0, delta);
  vec3 base = vec3(0.09, 0.13, 0.18);
  vec3 accent = vec3(0.33, 0.85, 0.95);
  vec3 color = mix(base, accent, band * uIntensity);
  float alpha = 0.72 + band * 0.28 * uIntensity;
  gl_FragColor = vec4(color, alpha);
}
`,
  "shaders/glass_vertex.glsl": `varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  "shaders/glass_fragment.glsl": `uniform sampler2D uNoise;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  float noise = texture2D(uNoise, vUv * 2.0).r;
  float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 1.6);
  vec3 tint = vec3(0.16, 0.22, 0.3);
  vec3 edge = vec3(0.45, 0.78, 0.9);
  vec3 color = mix(tint, edge, fres * 0.55 * uIntensity);
  color += (noise - 0.5) * 0.04;
  gl_FragColor = vec4(color, 0.42 + fres * 0.25);
}
`,
  "shaders/atmosphere_vertex.glsl": `varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,
  "shaders/atmosphere_fragment.glsl": `uniform sampler2D uSky;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float h = clamp(dir.y * 0.5 + 0.55, 0.0, 1.0);
  vec3 sky = texture2D(uSky, vec2(vUv.x, h)).rgb;
  vec3 zenith = vec3(0.02, 0.03, 0.055);
  vec3 color = mix(sky, zenith, smoothstep(0.35, 1.0, h));
  gl_FragColor = vec4(color, 1.0);
}
`,
  "shaders/transition_vertex.glsl": `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  "shaders/transition_fragment.glsl": `uniform float uTime;
uniform sampler2D uNoise;
varying vec2 vUv;
void main() {
  float n = texture2D(uNoise, vUv + vec2(uTime * 0.05, 0.0)).r;
  float streak = smoothstep(0.35, 1.0, vUv.y + n * 0.25);
  vec3 color = mix(vec3(0.1, 0.45, 0.55), vec3(0.85, 0.95, 1.0), streak);
  float alpha = (0.25 + streak * 0.55) * smoothstep(0.0, 0.15, uTime) * (1.0 - smoothstep(0.45, 0.85, uTime));
  gl_FragColor = vec4(color, alpha);
}
`,
};

for (const [rel, data] of Object.entries(shaders)) write(rel, data);

function lottie({ name, w, h, layers }) {
  return JSON.stringify({
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 60,
    w,
    h,
    nm: name,
    ddd: 0,
    assets: [],
    layers,
  });
}

function shapeLayer({ name, shapes, rotate = false }) {
  const rotation = rotate
    ? {
        a: 1,
        k: [
          { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
          { t: 60, s: [360] },
        ],
      }
    : { a: 0, k: 0 };
  return {
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: rotation,
      p: { a: 0, k: [100, 100, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    shapes,
    ip: 0,
    op: 60,
    st: 0,
    bm: 0,
  };
}

function group(items) {
  return {
    ty: "gr",
    nm: "group",
    it: [
      ...items,
      {
        ty: "tr",
        p: { a: 0, k: [0, 0] },
        a: { a: 0, k: [0, 0] },
        s: { a: 0, k: [100, 100] },
        r: { a: 0, k: 0 },
        o: { a: 0, k: 100 },
        sk: { a: 0, k: 0 },
        sa: { a: 0, k: 0 },
      },
    ],
  };
}

function ellipse(w, h) {
  return { ty: "el", nm: "ellipse", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [w, h] }, d: 1 };
}
function stroke(rgb, width) {
  return { ty: "st", nm: "stroke", c: { a: 0, k: [...rgb, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: width }, lc: 2, lj: 2, ml: 4 };
}
function fill(rgb) {
  return { ty: "fl", nm: "fill", c: { a: 0, k: [...rgb, 1] }, o: { a: 0, k: 100 }, r: 1 };
}
function trim() {
  return {
    ty: "tm",
    nm: "trim",
    s: { a: 0, k: 0 },
    e: {
      a: 1,
      k: [
        { t: 0, s: [18], i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } },
        { t: 30, s: [78] },
        { t: 60, s: [18] },
      ],
    },
    o: {
      a: 1,
      k: [
        { t: 0, s: [0], i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } },
        { t: 60, s: [360] },
      ],
    },
    m: 1,
  };
}

const cyan = [0.33, 0.85, 0.95];
const ink = [0.95, 0.96, 0.99];
const mint = [0.46, 0.89, 0.76];

write(
  "lottie/loading.json",
  lottie({
    name: "loading",
    w: 200,
    h: 200,
    layers: [shapeLayer({ name: "arc", rotate: true, shapes: [group([ellipse(120, 120), stroke(cyan, 8), trim()])] })],
  }),
);
write(
  "lottie/permission_sensor.json",
  lottie({
    name: "permission_sensor",
    w: 200,
    h: 200,
    layers: [
      shapeLayer({
        name: "shield",
        shapes: [group([ellipse(90, 110), stroke(cyan, 6), fill([0.06, 0.1, 0.16])])],
      }),
    ],
  }),
);
write(
  "lottie/calibration_success.json",
  lottie({
    name: "calibration_success",
    w: 200,
    h: 200,
    layers: [shapeLayer({ name: "ring", shapes: [group([ellipse(120, 120), stroke(mint, 8)])] })],
  }),
);
write(
  "lottie/web_fallback.json",
  lottie({
    name: "web_fallback",
    w: 200,
    h: 200,
    layers: [shapeLayer({ name: "frame", shapes: [group([ellipse(70, 120), stroke(ink, 6)])] })],
  }),
);

const animations = {
  "animations/portal_enter.json": { name: "portal_enter", durationMs: 320, reducedMs: 160, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", property: "opacity-scale" },
  "animations/portal_exit.json": { name: "portal_exit", durationMs: 260, reducedMs: 140, easing: "cubic-bezier(0.4, 0, 0.2, 1)", property: "opacity-scale" },
  "animations/panel_open.json": { name: "panel_open", durationMs: 220, reducedMs: 120, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", property: "translateX" },
  "animations/panel_close.json": { name: "panel_close", durationMs: 180, reducedMs: 100, easing: "cubic-bezier(0.4, 0, 1, 1)", property: "translateX" },
  "animations/gesture_feedback.json": { name: "gesture_feedback", durationMs: 420, reducedMs: 160, easing: "linear", property: "opacity" },
  "animations/calibration.json": {
    name: "calibration",
    durationMs: 0,
    reducedMs: 0,
    pacing: "user",
    steps: [
      { id: "hold", copy: "Hold the phone the way you actually browse. You should not strain your wrist." },
      { id: "still", copy: "Keep it still for a moment, then capture that pose as neutral." },
      { id: "test", copy: "Tilt gently up, down, left, and right. Return near neutral between each one." },
    ],
  },
  "animations/scene_idle.json": { name: "scene_idle", durationMs: 48000, reducedMs: 0, tracks: [{ target: "distantRings", property: "rotationY", from: 0, to: 6.283185 }] },
  "animations/loading_transition.json": { name: "loading_transition", durationMs: 240, reducedMs: 120, easing: "linear", property: "opacity" },
  "animations/error_transition.json": { name: "error_transition", durationMs: 180, reducedMs: 100, easing: "linear", property: "opacity" },
};
for (const [rel, data] of Object.entries(animations)) write(rel, `${JSON.stringify(data, null, 2)}\n`);

write(
  "audio/haptics/haptic-patterns.json",
  `${JSON.stringify(
    {
      confirm: [12],
      error: [18, 36, 18],
      panel: [8],
      note: "Patterns are millisecond pulses for the Vibration API. Nothing vibrates continuously.",
    },
    null,
    2,
  )}\n`,
);

write(
  "config/scene-defaults.json",
  `${JSON.stringify(
    {
      camera: { position: [0, 1.38, 4.15], lookAt: [0, 1.12, 0], fovPortrait: 40, fovLandscape: 34 },
      fog: { color: "#070A12", density: 0.055 },
      exposure: 1.04,
      placements: {
        portalRing: { position: [0, 1.18, 0], rotation: [Math.PI / 2, 0, 0] },
        portalFrame: { position: [0, 1.16, 0.08], rotation: [0, 0, 0] },
        portalCore: { position: [0, 1.16, -0.05], rotation: [Math.PI / 2, 0, 0] },
        browserFrame: { position: [0, 1.16, 0.16], rotation: [0, 0, 0] },
        orb: { position: [0, 0.28, 1.85], rotation: [0, 0, 0] },
        compass: { position: [0.42, 0.28, 1.85], rotation: [Math.PI / 2, 0, 0] },
        marker: { position: [0, 1.18, 0.55], rotation: [Math.PI / 2, 0, 0] },
      },
    },
    null,
    2,
  )}\n`,
);

write(
  "config/performance-profiles.json",
  `${JSON.stringify(
    {
      high: { renderScaleCap: 1.75, shadows: "off", particles: 64, postProcessing: false, textureTier: "standard", modelTier: "standard", targetFramePolicy: "follow display, do not promise above 60 without measurement" },
      balanced: { renderScaleCap: 1.35, shadows: "off", particles: 28, postProcessing: false, textureTier: "standard", modelTier: "standard", targetFramePolicy: "stable 60 where the device allows" },
      low: { renderScaleCap: 1, shadows: "off", particles: 0, postProcessing: false, textureTier: "standard", modelTier: "low", targetFramePolicy: "keep the page responsive; drop decoration first" },
      fallback2d: { renderScaleCap: 0, shadows: "off", particles: 0, postProcessing: false, textureTier: "ui-only", modelTier: "none", targetFramePolicy: "no WebGL" },
    },
    null,
    2,
  )}\n`,
);

write(
  "config/gesture-visuals.json",
  `${JSON.stringify(
    {
      labels: { ready: "Ready", calibrating: "Calibrating", paused: "Paused", unavailable: "Gesture unavailable" },
      directions: {
        up: { label: "Next", hint: "Tilt the top of the phone away from you" },
        down: { label: "Previous", hint: "Tilt the top of the phone toward you" },
        left: { label: "Notes", hint: "Tilt left" },
        right: { label: "Close notes", hint: "Tilt right" },
      },
    },
    null,
    2,
  )}\n`,
);

write(
  "config/accessibility.json",
  `${JSON.stringify(
    {
      minTouchTargetPx: 44,
      motionOptional: true,
      touchAlternative: true,
      reducedMotion: "Crossfade only. Scene idle rotation and particles stop.",
      contrast: "High-contrast token override. State is never color-only.",
      textScale: ["sm", "md", "lg"],
      sensorCopy: "Hold the phone comfortably. Calibration does not ask for extreme wrist angles.",
    },
    null,
    2,
  )}\n`,
);

function vec(x, y, z) {
  return [x, y, z];
}

function pushTri(indices, a, b, c) {
  indices.push(a, b, c);
}

function emptyMesh() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function mergeMesh(target, source, transform) {
  const base = target.positions.length / 3;
  for (let i = 0; i < source.positions.length; i += 3) {
    const p = transform(source.positions[i], source.positions[i + 1], source.positions[i + 2]);
    const n = transform.normal(source.normals[i], source.normals[i + 1], source.normals[i + 2]);
    target.positions.push(p[0], p[1], p[2]);
    target.normals.push(n[0], n[1], n[2]);
  }
  for (let i = 0; i < source.uvs.length; i += 1) target.uvs.push(source.uvs[i]);
  for (const index of source.indices) target.indices.push(index + base);
}

function identityTransform() {
  const fn = (x, y, z) => [x, y, z];
  fn.normal = (x, y, z) => [x, y, z];
  return fn;
}

function compose(translate, rotate, scale = [1, 1, 1]) {
  const [rx, ry, rz] = rotate;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const rot = (x, y, z) => {
    let y1 = y * cx - z * sx;
    let z1 = y * sx + z * cx;
    let x1 = x;
    const x2 = x1 * cy + z1 * sy;
    const z2 = -x1 * sy + z1 * cy;
    const y2 = y1;
    const x3 = x2 * cz - y2 * sz;
    const y3 = x2 * sz + y2 * cz;
    return [x3, y3, z2];
  };
  const fn = (x, y, z) => {
    const r = rot(x * scale[0], y * scale[1], z * scale[2]);
    return [r[0] + translate[0], r[1] + translate[1], r[2] + translate[2]];
  };
  fn.normal = (x, y, z) => {
    const r = rot(x, y, z);
    const len = Math.hypot(r[0], r[1], r[2]) || 1;
    return [r[0] / len, r[1] / len, r[2] / len];
  };
  return fn;
}

function boxMesh(sx = 1, sy = 1, sz = 1) {
  const mesh = emptyMesh();
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces = [
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
  ];
  for (const face of faces) {
    const start = mesh.positions.length / 3;
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    face.v.forEach((p, i) => {
      mesh.positions.push(...p);
      mesh.normals.push(...face.n);
      mesh.uvs.push(...uvs[i]);
    });
    pushTri(mesh.indices, start, start + 1, start + 2);
    pushTri(mesh.indices, start, start + 2, start + 3);
  }
  return mesh;
}

function sphereMesh(radius, widthSeg, heightSeg) {
  const mesh = emptyMesh();
  for (let y = 0; y <= heightSeg; y += 1) {
    const v = y / heightSeg;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSeg; x += 1) {
      const u = x / widthSeg;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      mesh.positions.push(nx * radius, ny * radius, nz * radius);
      mesh.normals.push(nx, ny, nz);
      mesh.uvs.push(u, 1 - v);
    }
  }
  const row = widthSeg + 1;
  for (let y = 0; y < heightSeg; y += 1) {
    for (let x = 0; x < widthSeg; x += 1) {
      const a = y * row + x;
      const b = a + row;
      pushTri(mesh.indices, a, b, a + 1);
      pushTri(mesh.indices, b, b + 1, a + 1);
    }
  }
  return mesh;
}

function discMesh(radius, segments) {
  const mesh = emptyMesh();
  mesh.positions.push(0, 0, 0);
  mesh.normals.push(0, 1, 0);
  mesh.uvs.push(0.5, 0.5);
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    mesh.positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    mesh.normals.push(0, 1, 0);
    mesh.uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 1; i <= segments; i += 1) {
    const next = i === segments ? 1 : i + 1;
    pushTri(mesh.indices, 0, i, next);
  }
  return mesh;
}

function torusMesh(R, r, radial, tubular, arc = Math.PI * 2) {
  const mesh = emptyMesh();
  for (let i = 0; i <= radial; i += 1) {
    const u = (i / radial) * arc;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= tubular; j += 1) {
      const v = (j / tubular) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      mesh.positions.push((R + r * cv) * cu, r * sv, (R + r * cv) * su);
      mesh.normals.push(cv * cu, sv, cv * su);
      mesh.uvs.push(i / radial, j / tubular);
    }
  }
  const row = tubular + 1;
  for (let i = 0; i < radial; i += 1) {
    for (let j = 0; j < tubular; j += 1) {
      const a = i * row + j;
      const b = a + row;
      pushTri(mesh.indices, a, b, a + 1);
      pushTri(mesh.indices, b, b + 1, a + 1);
    }
  }
  return mesh;
}

function transformed(mesh, transform) {
  const copy = emptyMesh();
  mergeMesh(copy, mesh, transform);
  return copy;
}

function frameBoxes(width, height, depth, thickness) {
  const mesh = emptyMesh();
  const hw = width / 2;
  const hh = height / 2;
  const parts = [
    transformed(boxMesh(width, thickness, depth), compose([0, hh - thickness / 2, 0], [0, 0, 0])),
    transformed(boxMesh(width, thickness, depth), compose([0, -hh + thickness / 2, 0], [0, 0, 0])),
    transformed(boxMesh(thickness, height, depth), compose([-hw + thickness / 2, 0, 0], [0, 0, 0])),
    transformed(boxMesh(thickness, height, depth), compose([hw - thickness / 2, 0, 0], [0, 0, 0])),
  ];
  for (const part of parts) mergeMesh(mesh, part, identityTransform());
  return mesh;
}

function buildGlb(primitives) {
  const binParts = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = [];

  function align(n) {
    return (n + 3) & ~3;
  }

  function pushBuffer(array, target) {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const pad = align(byteOffset) - byteOffset;
    if (pad) {
      binParts.push(Buffer.alloc(pad));
      byteOffset += pad;
    }
    const viewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target });
    binParts.push(bytes);
    byteOffset += bytes.length;
    return viewIndex;
  }

  primitives.forEach((prim, index) => {
    const positions = new Float32Array(prim.mesh.positions);
    const normals = new Float32Array(prim.mesh.normals);
    const uvs = new Float32Array(prim.mesh.uvs);
    const indices = new Uint16Array(prim.mesh.indices);
    if (indices.length > 65535) throw new Error(`Too many indices in ${prim.name}`);
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k], positions[i + k]);
        max[k] = Math.max(max[k], positions[i + k]);
      }
    }
    const posView = pushBuffer(positions, 34962);
    const norView = pushBuffer(normals, 34962);
    const uvView = pushBuffer(uvs, 34962);
    const idxView = pushBuffer(indices, 34963);
    const posAcc = accessors.length;
    accessors.push({ bufferView: posView, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max });
    const norAcc = accessors.length;
    accessors.push({ bufferView: norView, componentType: 5126, count: normals.length / 3, type: "VEC3" });
    const uvAcc = accessors.length;
    accessors.push({ bufferView: uvView, componentType: 5126, count: uvs.length / 2, type: "VEC2" });
    const idxAcc = accessors.length;
    accessors.push({ bufferView: idxView, componentType: 5123, count: indices.length, type: "SCALAR" });
    const mat = prim.material;
    materials.push({
      name: prim.name,
      doubleSided: Boolean(mat.doubleSided),
      alphaMode: mat.alpha || "OPAQUE",
      pbrMetallicRoughness: {
        baseColorFactor: mat.color,
        metallicFactor: mat.metal,
        roughnessFactor: mat.rough,
      },
      emissiveFactor: mat.emissive || [0, 0, 0],
    });
    meshes.push({
      name: prim.name,
      primitives: [
        {
          attributes: { POSITION: posAcc, NORMAL: norAcc, TEXCOORD_0: uvAcc },
          indices: idxAcc,
          material: index,
        },
      ],
    });
    nodes.push({ name: prim.name, mesh: index });
  });

  const json = {
    asset: { version: "2.0", generator: "motion-browser-procedural-1.0.0" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: align(byteOffset) }],
  };
  let jsonText = JSON.stringify(json);
  while (Buffer.byteLength(jsonText) % 4 !== 0) jsonText += " ";
  const jsonBuf = Buffer.from(jsonText);
  const bin = Buffer.concat(binParts);
  const binPad = Buffer.alloc(align(bin.length) - bin.length);
  const binChunk = Buffer.concat([bin, binPad]);
  const total = 12 + 8 + jsonBuf.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binChunk]);
}

const metal = { color: [0.09, 0.11, 0.14, 1], metal: 0.72, rough: 0.38, doubleSided: true };
const metalSoft = { color: [0.07, 0.09, 0.12, 1], metal: 0.55, rough: 0.62, doubleSided: true };
const emissiveCyan = { color: [0.15, 0.55, 0.65, 1], metal: 0.1, rough: 0.35, emissive: [0.12, 0.45, 0.55], doubleSided: true };
const glass = { color: [0.45, 0.7, 0.8, 0.35], metal: 0, rough: 0.08, alpha: "BLEND", doubleSided: true };
const shardMat = { color: [0.55, 0.85, 0.95, 0.8], metal: 0.1, rough: 0.2, emissive: [0.2, 0.5, 0.6], alpha: "BLEND", doubleSided: true };

const triangleReport = {};

function emitGlb(rel, primitives) {
  const glb = buildGlb(primitives);
  write(rel, glb);
  const tris = primitives.reduce((sum, prim) => sum + prim.mesh.indices.length / 3, 0);
  triangleReport[rel] = tris;
  return glb;
}

const floor = discMesh(5.2, 128);
const floorRings = emptyMesh();
for (const radius of [1.4, 2.35, 3.4]) {
  mergeMesh(floorRings, torusMesh(radius, 0.012, 144, 12), identityTransform());
}
const distant = emptyMesh();
mergeMesh(distant, torusMesh(3.1, 0.03, 180, 18), compose([0, 1.35, -2.4], [Math.PI / 2, 0.15, 0]));
mergeMesh(distant, torusMesh(4.3, 0.02, 200, 16), compose([0, 1.5, -3.3], [Math.PI / 2.2, -0.2, 0.1]));
const arches = emptyMesh();
mergeMesh(arches, torusMesh(2.6, 0.045, 120, 14, Math.PI), compose([-1.7, 0.1, -1.2], [0, 0.4, Math.PI / 2]));
mergeMesh(arches, torusMesh(2.6, 0.045, 120, 14, Math.PI), compose([1.7, 0.1, -1.2], [0, -0.4, -Math.PI / 2]));

emitGlb("environment/motion_observatory.glb", [
  { name: "Floor", mesh: floor, material: metal },
  { name: "FloorRings", mesh: floorRings, material: emissiveCyan },
  { name: "DistantRings", mesh: distant, material: metalSoft },
  { name: "Arches", mesh: arches, material: metalSoft },
]);

emitGlb("environment/environment_low.glb", [
  { name: "Floor", mesh: discMesh(4.6, 64), material: metal },
  { name: "FloorRings", mesh: torusMesh(2.2, 0.016, 72, 8), material: emissiveCyan },
  { name: "DistantRings", mesh: transformed(torusMesh(3.4, 0.03, 96, 12), compose([0, 1.3, -2.6], [Math.PI / 2, 0, 0])), material: metalSoft },
]);

emitGlb("models/portal/portal_frame.glb", [
  { name: "PortalFrame", mesh: frameBoxes(1.72, 2.35, 0.05, 0.045), material: metal },
]);
emitGlb("models/portal/portal_ring.glb", [
  { name: "PortalRing", mesh: torusMesh(1.22, 0.018, 192, 24), material: emissiveCyan },
]);
emitGlb("models/portal/portal_core.glb", [
  { name: "PortalCore", mesh: discMesh(0.92, 48), material: glass },
]);
emitGlb("models/browser/browser_frame.glb", [
  { name: "BrowserFrame", mesh: frameBoxes(1.42, 1.95, 0.035, 0.028), material: metal },
]);
emitGlb("models/browser/browser_corner_detail.glb", [
  {
    name: "BrowserCorners",
    mesh: (() => {
      const mesh = emptyMesh();
      const corners = [[-0.68, 0.94, 0], [0.68, 0.94, 0], [-0.68, -0.94, 0], [0.68, -0.94, 0]];
      for (const corner of corners) mergeMesh(mesh, boxMesh(0.12, 0.018, 0.02), compose(corner, [0, 0, 0]));
      return mesh;
    })(),
    material: emissiveCyan,
  },
]);
emitGlb("models/browser/browser_side_rail.glb", [
  {
    name: "SideRails",
    mesh: (() => {
      const mesh = emptyMesh();
      mergeMesh(mesh, boxMesh(0.02, 1.7, 0.02), compose([-0.78, 0, 0], [0, 0, 0]));
      mergeMesh(mesh, boxMesh(0.02, 1.7, 0.02), compose([0.78, 0, 0], [0, 0, 0]));
      return mesh;
    })(),
    material: { ...metal, rough: 0.5 },
  },
]);
emitGlb("models/controls/gesture_orb.glb", [
  { name: "GestureOrb", mesh: sphereMesh(0.09, 24, 16), material: emissiveCyan },
]);
emitGlb("models/controls/orientation_compass.glb", [
  {
    name: "Compass",
    mesh: (() => {
      const mesh = emptyMesh();
      mergeMesh(mesh, torusMesh(0.11, 0.012, 40, 8), identityTransform());
      mergeMesh(mesh, boxMesh(0.012, 0.012, 0.12), compose([0, 0, 0.04], [0, 0, 0]));
      return mesh;
    })(),
    material: metal,
  },
]);
emitGlb("models/controls/calibration_marker.glb", [
  {
    name: "CalibrationMarker",
    mesh: (() => {
      const mesh = emptyMesh();
      mergeMesh(mesh, torusMesh(0.16, 0.008, 48, 8), identityTransform());
      mergeMesh(mesh, boxMesh(0.22, 0.008, 0.008), identityTransform());
      mergeMesh(mesh, boxMesh(0.008, 0.22, 0.008), identityTransform());
      return mesh;
    })(),
    material: emissiveCyan,
  },
]);
emitGlb("models/effects/transition_shards.glb", [
  {
    name: "Shards",
    mesh: (() => {
      const mesh = emptyMesh();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        mergeMesh(
          mesh,
          boxMesh(0.02, 0.22, 0.012),
          compose([Math.cos(a) * 1.05, Math.sin(a) * 1.25, 0], [0, 0, a]),
        );
      }
      return mesh;
    })(),
    material: shardMat,
  },
]);
emitGlb("models/effects/soft_light_rig.glb", [
  {
    name: "LightRig",
    mesh: (() => {
      const mesh = emptyMesh();
      const points = [vec(-1.4, 2.1, 0.4), vec(1.5, 1.9, 0.2), vec(0, 2.4, -1.4), vec(0, 0.4, 1.4)];
      for (const point of points) mergeMesh(mesh, sphereMesh(0.045, 12, 8), compose(point, [0, 0, 0]));
      return mesh;
    })(),
    material: emissiveCyan,
  },
]);

write("manifest/triangle-counts.json", `${JSON.stringify(triangleReport, null, 2)}\n`);

mkdirSync(join(out, "fonts/primary"), { recursive: true });
const fontDir = join(root, "node_modules/@fontsource-variable/outfit/files");
copyFileSync(join(fontDir, "outfit-latin-wght-normal.woff2"), join(out, "fonts/primary/outfit-latin-wght-normal.woff2"));
copyFileSync(join(fontDir, "outfit-latin-ext-wght-normal.woff2"), join(out, "fonts/primary/outfit-latin-ext-wght-normal.woff2"));
const ofl = readFileSync(join(root, "node_modules/@fontsource-variable/outfit/LICENSE"), "utf8");
write(
  "fonts/FONT_LICENSES.md",
  `# Font licenses

## Outfit (variable, latin and latin-ext)

- Family: Outfit
- Designer: Rodrigo Fuenzalida
- Upstream: https://github.com/Outfitio/Outfit-Fonts
- Packaged by: Fontsource @fontsource-variable/outfit@5.3.0
- Fontsource page: https://fontsource.org/fonts/outfit
- License: SIL Open Font License, Version 1.1
- Obtained: 2026-10-30 from the local npm package already installed for this build
- Files: fonts/primary/outfit-latin-wght-normal.woff2, fonts/primary/outfit-latin-ext-wght-normal.woff2
- Modifications: none beyond Fontsource's published unicode subsets. Only these two files are shipped.

## Fallback

No second font file is bundled. The CSS stack falls back to system-ui, sans-serif.
See fonts/fallback/SYSTEM_FALLBACK.md.

## SIL Open Font License text

${ofl}
`,
);
write(
  "fonts/fallback/SYSTEM_FALLBACK.md",
  `# System fallback

The interface uses Outfit when the bundled woff2 loads.
If it does not, the declared fallback is the platform UI sans (\`system-ui\`, \`sans-serif\`).
That fallback is not a redistributed font file, so no extra license is attached.
`,
);

write(
  "manifest/ASSET_LICENSES.md",
  `# Motion Browser asset licenses

Generated 2026-10-30.

| licenseId | Source | Creator | License | Files |
| --- | --- | --- | --- | --- |
| original | Procedural generator in scripts/generate-motion-assets.mjs | Motion Browser project | Original work, same terms as the app source | All GLB, PNG, SVG, GLSL, WAV, JSON, and Lottie files under public/motion except the Outfit font files |
| outfit-ofl | https://github.com/Outfitio/Outfit-Fonts via @fontsource-variable/outfit@5.3.0 | Rodrigo Fuenzalida / Outfit Project Authors | SIL Open Font License 1.1 | fonts/primary/*.woff2 |

No stock models, brand logos, emoji icon fonts, or remote CDN assets are included.
Runtime libraries (three.js, lottie-web) are npm dependencies with their own license files in node_modules and are not duplicated here.

Download date for the font package: 2026-10-30.
Modifications to the font: none.
`,
);

write(
  "manifest/asset-version.json",
  `${JSON.stringify({ manifestVersion: 1, appAssetVersion: "1.0.0", generatedBy: "scripts/generate-motion-assets.mjs" }, null, 2)}\n`,
);

write(
  "manifest/ASSET_QA_REPORT.md",
  `# Asset QA report

Status: assets generated locally. Runtime verification is recorded in docs/TEST_REPORT.md after the build is exercised.

- Models are original glTF 2.0 binaries produced by the generator, not downloaded scans.
- Textures are PNG rather than WebP because this environment has no WebP encoder. The loader consumes the PNG files directly.
- Ambience is a seamless WAV loop rather than OGG for the same reason. Playback does not depend on a particular compressed-music codec beyond what the browser decodes.
- Triangle counts are in manifest/triangle-counts.json. Counts are deliberately modest: the forms are precise primitives, not a dense scanned set.
- No physical Android device was available in this workspace. Do not treat any number here as an on-device FPS benchmark.
`,
);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".keep") continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

const mime = {
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".glsl": "text/x-glsl",
  ".json": "application/json",
  ".wav": "audio/wav",
  ".md": "text/markdown",
  ".woff2": "font/woff2",
};

const priorityFor = (rel) => {
  if (rel.includes("environment/motion_observatory") || rel.includes("portal_ring") || rel.includes("portal_frame") || rel.endsWith(".woff2")) return "critical";
  if (rel.includes("environment_low") || rel.includes("audio/ambience") || rel.includes("lottie")) return "optional";
  return "standard";
};

const files = walk(out).filter((abs) => !abs.endsWith(`${join("manifest", "asset-manifest.json")}`));
const assets = files
  .map((abs) => {
    const rel = relative(out, abs).split("\\").join("/");
    const buf = readFileSync(abs);
    const ext = extname(rel);
    return {
      id: rel.replaceAll("/", ".").replaceAll(/[^a-zA-Z0-9._-]/g, "_"),
      path: rel,
      type: mime[ext] || "application/octet-stream",
      purpose: rel.split("/")[0],
      required: !rel.includes("ambience") && !rel.includes("environment_low") && !rel.includes("lottie"),
      bytes: buf.length,
      version: "1.0.0",
      licenseId: rel.endsWith(".woff2") ? "outfit-ofl" : "original",
      priority: priorityFor(rel),
      fallback: rel.endsWith("motion_observatory.glb") ? "environment.environment_low.glb" : rel.includes("floor_basecolor") ? "textures.fallback.texture_fallback.png" : null,
      integrity: `sha256-${createHash("sha256").update(buf).digest("hex")}`,
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  manifestVersion: 1,
  appAssetVersion: "1.0.0",
  notes: [
    "Paths are relative to public/motion, served as /motion/<path>.",
    "Android's app/src/main/assets/motion layout is adapted to this web bundle. See docs/ARCHITECTURE.md.",
    "PNG and WAV are intentional substitutions where an encoder for WebP/OGG was not available.",
  ],
  assets,
};
write("manifest/asset-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
const byGroup = {};
for (const asset of assets) byGroup[asset.purpose] = (byGroup[asset.purpose] || 0) + asset.bytes;
console.log(JSON.stringify({ files: assets.length, bytes: total, byGroup, triangles: triangleReport }, null, 2));
