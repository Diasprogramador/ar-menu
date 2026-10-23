/** Normalize the Blender GLB, export Quick Look, and measure the actual geometry. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    }).catch((error) => this.onerror?.(error));
  }
};

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('Pass a product slug');
const file = resolve('public/demo-models', `${slug}.glb`);
const input = readFileSync(file);
const { scene } = await new GLTFLoader().parseAsync(
  input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength), '',
);
scene.updateMatrixWorld(true);
const crust = [];
scene.traverse((object) => {
  if (object.isMesh && object.material.name === 'SM-Crosta') crust.push(object);
});
if (crust.length > 1) {
  const geometry = mergeGeometries(crust.map((object) =>
    object.geometry.clone().applyMatrix4(object.matrixWorld)));
  const merged = new THREE.Mesh(geometry, crust[0].material);
  merged.name = 'Crosta tostada';
  for (const object of crust) object.removeFromParent();
  scene.add(merged);
  scene.updateMatrixWorld(true);
}
const bounds = new THREE.Box3().setFromObject(scene, true);
const center = bounds.getCenter(new THREE.Vector3());
const group = new THREE.Group();
group.name = slug;
group.add(scene);
scene.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
group.updateMatrixWorld(true);
const size = new THREE.Box3().setFromObject(group, true).getSize(new THREE.Vector3());
if (size.toArray().some((value) => !Number.isFinite(value) || value < .001 || value > .5)) {
  throw new Error(`Unexpected menu-item dimensions: ${size.toArray()}`);
}
let triangles = 0;
group.traverse((object) => {
  if (object.isMesh) {
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    object.material.side = THREE.FrontSide;
  }
});
if (triangles > 60000) throw new Error(`Triangle budget exceeded: ${triangles}`);
const glb = Buffer.from(await new GLTFExporter().parseAsync(group, { binary: true }));
if (glb.length > 3 * 1024 * 1024) throw new Error('GLB exceeds 3 MB');
// USDZExporter writes displayColor but does not wire it to the preview material.
// Give Quick Look a representative ingredient colour instead of white materials.
const quickLook = group.clone(true);
quickLook.traverse((object) => {
  if (!object.isMesh) return;
  object.material = object.material.clone();
  const colors = object.geometry.attributes.color;
  if (object.material.vertexColors && colors) {
    const average = new THREE.Color(0, 0, 0);
    for (let i = 0; i < colors.count; i++) {
      average.r += colors.getX(i);
      average.g += colors.getY(i);
      average.b += colors.getZ(i);
    }
    average.multiplyScalar(1 / colors.count);
    object.material.color.multiply(average);
    object.material.vertexColors = false;
  }
});
const usdz = Buffer.from(await new USDZExporter().parseAsync(quickLook, {
  quickLookCompatible: true,
  includeAnchoringProperties: true,
  ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
}));
let cursor = 0;
let entries = 0;
while (cursor + 30 <= usdz.length && usdz.readUInt32LE(cursor) === 0x04034b50) {
  const start = cursor + 30 + usdz.readUInt16LE(cursor + 26) + usdz.readUInt16LE(cursor + 28);
  if (usdz.readUInt16LE(cursor + 8) !== 0 || start % 64) throw new Error('Invalid USDZ packing');
  cursor = start + usdz.readUInt32LE(cursor + 18);
  entries++;
}
if (!entries) throw new Error('Empty USDZ');
writeFileSync(file, glb);
writeFileSync(file.replace(/\.glb$/, '.usdz'), usdz);
const report = {
  slug, triangles, bytes: glb.length, usdzBytes: usdz.length,
  sizeCm: size.toArray().map((n) => Math.round(n * 1000) / 10),
  baseY: new THREE.Box3().setFromObject(group, true).min.y,
  usdzEntries: entries,
};
const reportDir = resolve('artifacts/model-validation');
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, `${slug}.json`), JSON.stringify(report, null, 2));
console.log(report);
