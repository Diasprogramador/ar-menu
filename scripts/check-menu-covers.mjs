/** Fail fast when a demo product has no usable local catalog cover. */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/features/menu/demoData.ts'), 'utf8');
const slugs = [...source.matchAll(/image:\s*cover\('([^']+)'\)/g)].map((match) => match[1]);
const unique = new Set(slugs);

if (slugs.length !== 19 || unique.size !== slugs.length) {
  throw new Error(`Expected 19 unique local cover references, found ${slugs.length} (${unique.size} unique).`);
}

function jpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('not a JPEG');
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('JPEG dimensions not found');
}

for (const slug of slugs) {
  const path = resolve('public/demo/covers', `${slug}.jpg`);
  const stats = statSync(path);
  if (stats.size < 10_000 || stats.size > 500_000) {
    throw new Error(`${slug}: suspicious cover size ${stats.size} bytes`);
  }
  const dimensions = jpegDimensions(readFileSync(path));
  if (dimensions.width !== 900 || dimensions.height !== 720) {
    throw new Error(`${slug}: expected 900x720, found ${dimensions.width}x${dimensions.height}`);
  }
}

console.log(`Menu covers OK: ${slugs.length}/${slugs.length} local JPEGs at 900x720.`);
