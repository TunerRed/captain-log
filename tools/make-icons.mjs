/**
 * 机长日志 · 图标生成器（零依赖，纯 Node）
 *
 * 用 zlib 手写 PNG 编码，配合 4x4 超采样做抗锯齿，生成：
 *   icons/icon-192.png / icon-512.png / icon-maskable-512.png      （PWA）
 *   Android res/mipmap-<density>/ic_launcher, ic_launcher_round, ic_launcher_foreground
 *   Android res/drawable(-port|-land)-<density>/splash.png          （启动图）
 *   （安卓资源只在带 --android 参数时生成）
 *
 * 用法：
 *   node tools/make-icons.mjs              只生成 PWA 图标
 *   node tools/make-icons.mjs --android    额外生成安卓各密度图标 + 启动图
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');
const WANT_ANDROID = process.argv.includes('--android');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

/* ----------------------------------------------------------- PNG 编码 --- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** rgba: Uint8Array(length = w*h*4) */
function encodePNG(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // color type: truecolor + alpha
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace

  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter type 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* -------------------------------------------------------------- 几何 --- */
function insideRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= r && x <= w - r) || (y >= r && y <= h - r);
}

function insidePolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ---------------------------------------------------------------- 绘制 --- */
/** 纸飞机轮廓（feather "send" 的实心版），坐标系 24x24 */
const PLANE = [[22, 2], [15, 22], [11, 13], [2, 9]];

function hex2rgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const TOP = hex2rgb('#7c6cff');
const BOTTOM = hex2rgb('#a06bff');

/**
 * @param {number} size 边长
 * @param {object} opts
 *   maskable  自适应图标（满幅背景 + 图形缩到安全区）
 *   shape     'rounded' | 'circle' | 'square'
 *   fgOnly    只画纸飞机（透明背景），用于安卓自适应图标的前景层
 *   artScale  纸飞机占画布的比例（默认按 maskable/shape 推断）
 */
function render(size, opts = {}) {
  const maskable = !!opts.maskable;
  const fgOnly = !!opts.fgOnly;
  const shape = opts.shape || (maskable ? 'square' : 'rounded');
  const rgba = new Uint8Array(size * size * 4);
  const SS = 4;                       // 超采样倍数
  const radius = shape === 'circle' ? size / 2 : shape === 'square' ? 0 : size * 0.22;
  const artScale = (opts.artScale || (maskable ? 0.62 : 0.74)) * size / 24;
  const artOffset = (size - 24 * artScale) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHit = 0, fgHit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (shape === 'circle') {
            const dx = px - size / 2, dy = py - size / 2;
            if (dx * dx + dy * dy <= (size / 2) * (size / 2)) bgHit++;
          } else if (insideRoundRect(px, py, size, size, radius)) bgHit++;
          const ax = (px - artOffset) / artScale;
          const ay = (py - artOffset) / artScale;
          if (insidePolygon(ax, ay, PLANE)) fgHit++;
        }
      }
      const total = SS * SS;
      const bgA = fgOnly ? 1 : bgHit / total;
      const fgA = fgHit / total;

      // 对角渐变
      const t = (x / size) * 0.5 + (y / size) * 0.5;
      let r = Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t);
      let g = Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t);
      let b = Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t);

      // 白色纸飞机叠加
      r = Math.round(r * (1 - fgA) + 255 * fgA);
      g = Math.round(g * (1 - fgA) + 255 * fgA);
      b = Math.round(b * (1 - fgA) + 255 * fgA);

      const i = (y * size + x) * 4;
      if (fgOnly) {
        // 透明底 + 白色图形（安卓自适应图标前景层）
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255;
        rgba[i + 3] = Math.round(fgA * 255);
      } else {
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = Math.round(bgA * 255);
      }
    }
  }
  return encodePNG(rgba, size, size);
}

/* ---------------------------------------------------------------- 输出 --- */
fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }]
];
for (const [name, size, opts] of jobs) {
  const buf = render(size, opts);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`✓ ${name}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}

/* ------------------------------------------------------------ 安卓资源 --- */
if (WANT_ANDROID) {
  if (!fs.existsSync(ANDROID_RES)) {
    console.error(`✗ 找不到安卓资源目录：${ANDROID_RES}`);
    console.error('  先创建 android/ 工程（tools/build-apk.ps1 会处理），或用 --android 前先生成工程。');
    process.exit(1);
  }

  // 密度 -> [launcher 边长, 自适应前景边长(108dp)]
  const DENSITIES = [
    ['mdpi', 48, 108],
    ['hdpi', 72, 162],
    ['xhdpi', 96, 216],
    ['xxhdpi', 144, 324],
    ['xxxhdpi', 192, 432]
  ];

  let count = 0;
  for (const [density, launcher, foreground] of DENSITIES) {
    const dir = path.join(ANDROID_RES, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const items = [
      ['ic_launcher.png', render(launcher, { shape: 'rounded' })],
      ['ic_launcher_round.png', render(launcher, { shape: 'circle' })],
      // 自适应图标前景：图形只占中间安全区（约 62%），四周留透明
      ['ic_launcher_foreground.png', render(foreground, { fgOnly: true, artScale: 0.42 })]
    ];
    for (const [name, buf] of items) {
      fs.writeFileSync(path.join(dir, name), buf);
      count++;
    }
    console.log(`✓ mipmap-${density}  launcher=${launcher}px  foreground=${foreground}px`);
  }

  // 通知栏小图标：纯白 + 透明底（系统会自己着色），24dp 各密度
  const STAT = [['mdpi', 24], ['hdpi', 36], ['xhdpi', 48], ['xxhdpi', 72], ['xxxhdpi', 96]];
  for (const [density, size] of STAT) {
    const dir = path.join(ANDROID_RES, `drawable-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ic_stat_reminder.png'), render(size, { fgOnly: true, artScale: 0.82 }));
    count++;
  }
  console.log(`✓ ic_stat_reminder.png  通知小图标 ${STAT.length} 个密度`);

  // 启动图：竖屏/横屏各密度铺满，渐变 + 居中纸飞机
  const SPLASH = [
    ['drawable', 1080, 1080],
    ['drawable-port-mdpi', 320, 480],
    ['drawable-port-hdpi', 480, 800],
    ['drawable-port-xhdpi', 720, 1280],
    ['drawable-port-xxhdpi', 960, 1600],
    ['drawable-port-xxxhdpi', 1280, 1920],
    ['drawable-land-mdpi', 480, 320],
    ['drawable-land-hdpi', 800, 480],
    ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960],
    ['drawable-land-xxxhdpi', 1920, 1280]
  ];
  for (const [dir0, w, h] of SPLASH) {
    const dir = path.join(ANDROID_RES, dir0);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'splash.png'), renderSplash(w, h));
    count++;
  }
  console.log(`✓ splash.png  ${SPLASH.length} 套尺寸`);
  console.log(`安卓图标/启动图完成：${count} 个文件 -> ${path.relative(ROOT, ANDROID_RES)}`);
}

/** 启动图：渐变铺满 + 居中白色纸飞机 */
function renderSplash(w, h) {
  const rgba = new Uint8Array(w * h * 4);
  const SS = 3;
  const artSize = Math.min(w, h) * 0.42;
  const artScale = artSize / 24;
  const ox = (w - artSize) / 2;
  const oy = (h - artSize) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let fgHit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ax = (x + (sx + 0.5) / SS - ox) / artScale;
          const ay = (y + (sy + 0.5) / SS - oy) / artScale;
          if (insidePolygon(ax, ay, PLANE)) fgHit++;
        }
      }
      const fgA = fgHit / (SS * SS);
      const t = (x / w) * 0.35 + (y / h) * 0.65;
      let r = Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t);
      let g = Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t);
      let b = Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t);
      r = Math.round(r * (1 - fgA) + 255 * fgA);
      g = Math.round(g * (1 - fgA) + 255 * fgA);
      b = Math.round(b * (1 - fgA) + 255 * fgA);
      const i = (y * w + x) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return encodePNG(rgba, w, h);
}
