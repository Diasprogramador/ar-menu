/**
 * Gera os ícones PNG do PWA sem depender de nenhuma biblioteca de imagem.
 *
 * O desenho é o mesmo motivo da marca: o anel de brasa — o retículo que a
 * sessão de AR projeta na superfície detectada — sobre o fundo carvão.
 *
 * Uso: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');

const CARVAO = [0x14, 0x11, 0x0f];
const BRASA_CLARA = [0xff, 0x6b, 0x2c];
const BRASA_ESCURA = [0xc4, 0x23, 0x1a];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mix = (from, to, t) => [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];

/**
 * `maskable` exige que o conteúdo caiba no círculo interno de 80% do ícone,
 * porque o sistema operacional pode recortar as bordas.
 */
function drawIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 3);
  const center = (size - 1) / 2;
  const safeArea = maskable ? 0.62 : 0.78;
  const outerRadius = (size / 2) * safeArea;
  const ringWidth = outerRadius * 0.26;
  const innerRadius = outerRadius - ringWidth;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.hypot(dx, dy);

      // Gradiente do anel na diagonal, igual ao --ember-gradient do CSS
      const t = Math.min(1, Math.max(0, (dx + dy) / (size * 1.1) + 0.5));
      const ember = mix(BRASA_CLARA, BRASA_ESCURA, t);

      // Antialiasing de 1px nas duas bordas do anel
      const outerEdge = clamp01(outerRadius - distance);
      const innerEdge = clamp01(distance - innerRadius);
      const alpha = Math.min(outerEdge, innerEdge);

      const color = alpha <= 0 ? CARVAO : mix(CARVAO, ember, alpha);

      const offset = (y * size + x) * 3;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }

  return pixels;
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Codifica RGB cru em PNG (cor tipo 2, 8 bits, sem filtro por linha). */
function encodePng(size, rgb) {
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro None
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 2; // truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const { file, size, maskable } of outputs) {
  const png = encodePng(size, drawIcon(size, { maskable }));
  writeFileSync(resolve(OUT_DIR, file), png);
  console.log(`${file} — ${size}×${size} — ${Math.round(png.byteLength / 1024)} KB`);
}
