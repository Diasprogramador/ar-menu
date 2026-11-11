import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

// Rows of the locally authored diffuse sheet: grill, bakery, fried food, garnish.
const finishes = {
  'brioche-assado': 0, 'carne-selada': 1, 'queijo-derretido': 2, bacon: 3,
  miolo: 4, 'massa-assada': 5, mucarela: 6, 'alface-romana': 7, 'nervura-alface': 7,
  empanado: 8, farofa: 8, 'batata-frita': 9, chocolate: 10, sorvete: 11,
  'costela-glaceada': 12, 'carne-ao-ponto': 13, pepperoni: 14, 'casca-laranja': 15,
};
const sheet = await loadImage(fileURLToPath(new URL('./ingredient-swatches.jpg', import.meta.url)));
const cache = new Map();

function texture(canvas, color = false) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
  map.flipY = false;
  map.userData.mimeType = 'image/jpeg';
  return map;
}

function surface(index) {
  if (cache.has(index)) return cache.get(index);
  const size = 256;
  const image = createCanvas(size, size);
  const ctx = image.getContext('2d');
  const tile = sheet.width / 4;
  // Leave a gutter inside each source tile so adjacent foods never bleed.
  ctx.drawImage(sheet, index % 4 * tile + 6, Math.floor(index / 4) * tile + 6,
    tile - 12, tile - 12, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const relief = createCanvas(size, size);
  const reliefCtx = relief.getContext('2d');
  const normals = reliefCtx.createImageData(size, size);
  function luminance(x, y) {
    const i = 4 * (Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x)));
    return (0.21 * data[i] + 0.72 * data[i + 1] + 0.07 * data[i + 2]) / 255;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (luminance(x - 1, y) - luminance(x + 1, y)) * 1.4;
      const dy = (luminance(x, y + 1) - luminance(x, y - 1)) * 1.4;
      const length = Math.hypot(dx, dy, 1);
      normals.data.set([(1 + dx / length) * 127.5, (1 + dy / length) * 127.5,
        (1 + 1 / length) * 127.5, 255], 4 * (y * size + x));
    }
  }
  reliefCtx.putImageData(normals, 0, 0);
  const maps = { map: texture(image, true), normalMap: texture(relief) };
  cache.set(index, maps);
  return maps;
}

export function applyIngredientSurface(mesh) {
  const material = mesh.material;
  const index = finishes[material.name.replace(/^REAL-/, '')];
  if (index === undefined) return;
  Object.assign(material, surface(index));
  material.color.set(0xffffff);
  material.vertexColors = false;
  mesh.geometry.deleteAttribute('color');
}
