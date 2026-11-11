import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

// Rows of the locally authored diffuse sheet: grill, bakery, fried food, garnish.
const finishes = {
  'brioche-assado': 0, 'carne-selada': 1, 'queijo-derretido': 2, bacon: 3,
  miolo: 4, 'massa-assada': 5, mucarela: 6, 'alface-romana': 7, 'nervura-alface': 7,
  empanado: 8, farofa: 8, 'batata-frita': 9, chocolate: 10, sorvete: 11,
  'costela-glaceada': 12, 'carne-ao-ponto': 13, pepperoni: 14, 'casca-laranja': 15,
  'molho-tomate': 16, 'queijo-de-forno': 17, 'quatro-queijos-gratinado': 18,
  'costela-desfiada': 19, manjericao: 20, tomate: 21, 'casca-de-batata': 22,
  'noz-tostada': 23, 'polpa-laranja': 24, 'polpa-lima': 25,
  'milkshake-morango': 26, 'frutas-vermelhas': 27, 'ganache-meio-amargo': 28,
  pudim: 29, caramelo: 30, madeira: 31,
};
const sheets = await Promise.all(['ingredient-swatches.jpg', 'kitchen-swatches.jpg'].map(
  file => loadImage(fileURLToPath(new URL(file, import.meta.url))),
));
const cache = new Map();

function texture(canvas, color = false) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
  map.flipY = false;
  map.userData.mimeType = 'image/jpeg';
  return map;
}

function surface(index, roughness) {
  const key = index + ':' + roughness;
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const sheet = sheets[Math.floor(index / 16)];
  const image = createCanvas(size, size);
  const ctx = image.getContext('2d');
  const tile = sheet.width / 4;
  // Leave a gutter inside each source tile so adjacent foods never bleed.
  ctx.drawImage(sheet, index % 4 * tile + 6, Math.floor(index % 16 / 4) * tile + 6,
    tile - 12, tile - 12, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const relief = createCanvas(size, size);
  const reliefCtx = relief.getContext('2d');
  const normals = reliefCtx.createImageData(size, size);
  const orm = createCanvas(size, size);
  const ormCtx = orm.getContext('2d');
  const packed = ormCtx.createImageData(size, size);
  const strength = .22 + 1.6 * roughness;
  function luminance(x, y) {
    const i = 4 * (Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x)));
    return (0.21 * data[i] + 0.72 * data[i + 1] + 0.07 * data[i + 2]) / 255;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (luminance(x - 1, y) - luminance(x + 1, y)) * strength;
      const dy = (luminance(x, y + 1) - luminance(x, y - 1)) * strength;
      const microRoughness = Math.min(.95, Math.max(.12, roughness + (.50-luminance(x,y))*.24));
      packed.data.set([255, Math.round(255*microRoughness), 0, 255], 4*(y*size+x));
      const length = Math.hypot(dx, dy, 1);
      normals.data.set([(1 + dx / length) * 127.5, (1 + dy / length) * 127.5,
        (1 + 1 / length) * 127.5, 255], 4 * (y * size + x));
    }
  }
  reliefCtx.putImageData(normals, 0, 0);
  ormCtx.putImageData(packed, 0, 0);
  const roughnessMap = texture(orm);
  const maps = { map: texture(image, true), normalMap: texture(relief), roughnessMap, metalnessMap: roughnessMap };
  cache.set(key, maps);
  return maps;
}

function mineralLabel() {
  const canvas = createCanvas(1024, 220);
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#103f40';
  pen.fillRect(0, 0, 1024, 220);
  pen.fillStyle = '#cbac70';
  for (const y of [12, 18, 202, 208]) pen.fillRect(0, y, 1024, 2);
  pen.textAlign = 'center';
  for (const x of [200, 656]) {
    pen.fillStyle = '#e2cfad';
    pen.font = '17px Georgia';
    pen.fillText('B R A S A   &   M E S A', x, 55);
    pen.fillStyle = '#f7efdc';
    pen.font = 'italic 54px Georgia';
    pen.fillText('Mineral', x, 123);
    pen.fillStyle = '#ebd3a9';
    pen.font = '18px Arial';
    pen.fillText('ÁGUA COM GÁS', x, 166);
  }
  return texture(canvas, true);
}

export function applyIngredientSurface(mesh) {
  const material = mesh.material;
  if (material.name === 'REAL-rotulo-agua') {
    material.map = mineralLabel();
    material.color.set(0xffffff);
    material.vertexColors = false;
    mesh.geometry.deleteAttribute('color');
    return;
  }
  const index = finishes[material.name.replace(/^REAL-/, '')];
  if (index === undefined) return;
  if (!material.map) Object.assign(material, surface(index, material.roughness));
  material.roughness = 1;
  material.color.set(0xffffff);
  material.vertexColors = false;
  mesh.geometry.deleteAttribute('color');
}
