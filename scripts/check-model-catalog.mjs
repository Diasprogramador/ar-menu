/** Validate the actual demo assets, their dimensions and Quick Look ZIP packing. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { demoProducts } from '../src/features/menu/demoData.ts';

const results = [];
const problems = [];
for (const product of demoProducts) {
  const model = product.product_models;
  assert(model?.ar_enabled, `${product.slug}: no AR model`);
  const data = readFileSync(`public${model.model_url}`);
  if (data.length !== model.file_size_bytes) problems.push(`${product.slug}: bytes ${model.file_size_bytes} -> ${data.length}`);
  assert(data.length < 3 * 1024 * 1024, `${product.slug}: GLB exceeds budget`);
  const { scene } = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '',
  );
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(100).toArray();
  assert(Math.abs(box.min.y) < .0005, `${product.slug}: floating base`);
  const expected = [model.width_cm ?? model.diameter_cm, model.height_cm, model.depth_cm ?? model.diameter_cm];
  size.forEach((value, i) => {
    assert(Number.isFinite(value) && value > 0, `${product.slug}: invalid geometry`);
    if (Math.abs(value - expected[i]) >= .2) problems.push(`${product.slug}: dimension ${i}: ${expected[i]} -> ${value}`);
  });
  let triangles = 0;
  let meshes = 0;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    for (const value of object.geometry.attributes.position.array) assert(Number.isFinite(value));
  });
  assert(triangles > 0 && triangles <= 60000, `${product.slug}: triangle budget`);
  const usdz = readFileSync(`public${model.usdz_url}`);
  let cursor = 0;
  let entries = 0;
  while (cursor + 30 <= usdz.length && usdz.readUInt32LE(cursor) === 0x04034b50) {
    const start = cursor + 30 + usdz.readUInt16LE(cursor + 26) + usdz.readUInt16LE(cursor + 28);
    assert.equal(usdz.readUInt16LE(cursor + 8), 0, `${product.slug}: compressed USDZ`);
    assert.equal(start % 64, 0, `${product.slug}: USDZ alignment`);
    cursor = start + usdz.readUInt32LE(cursor + 18);
    entries++;
  }
  assert(entries > 0, `${product.slug}: empty USDZ`);
  results.push({ slug: product.slug, triangles, meshes, sizeCm: size, bytes: data.length, usdzEntries: entries });
}
mkdirSync('artifacts/model-validation', { recursive: true });
writeFileSync('artifacts/model-validation/catalog.json', JSON.stringify(results, null, 2));
console.table(results.map(({ slug, triangles, meshes, bytes }) => ({ slug, triangles, meshes, bytes })));
assert.equal(problems.length, 0, problems.join('\n'));
console.log(`${results.length}/${demoProducts.length} products validated`);
