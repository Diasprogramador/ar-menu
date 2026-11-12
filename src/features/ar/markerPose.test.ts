import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { markerCameraPose } from './markerPose';
import { isTableMarker } from '../qrcodes/tableMarker';

function observe(position: Vector3, target: Vector3, width: number, height: number, lens = 66) {
  const focal = Math.max(width, height) / (2 * Math.tan((lens * Math.PI) / 360));
  const camera = new PerspectiveCamera((2 * Math.atan(height / (2 * focal)) * 180) / Math.PI, width / height);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const pixel = (x: number, z: number) => {
    const p = new Vector3(x, 0, z).project(camera);
    return { x: ((1 + p.x) * width) / 2, y: ((1 - p.y) * height) / 2 };
  };
  return {
    camera,
    corners: {
      topLeftCorner: pixel(-0.025, -0.025),
      topRightCorner: pixel(0.025, -0.025),
      bottomRightCorner: pixel(0.025, 0.025),
      bottomLeftCorner: pixel(-0.025, 0.025),
    },
  };
}

describe('posição do celular pelo cartão da mesa', () => {
  it.each([
    [0.05, 0.34, 0.12, 360, 640],
    [-0.12, 0.42, 0.32, 640, 360],
    [0.02, 0.23, -0.08, 640, 480],
  ])('recupera translação e inclinação nas coordenadas da mesa', (x, y, z, w, h) => {
    const position = new Vector3(x, y, z);
    const { camera, corners } = observe(position, new Vector3(0.02, 0, 0.01), w, h);
    const pose = markerCameraPose(corners, w, h);
    expect(pose?.position.distanceTo(position)).toBeLessThan(1e-5);
    expect(pose?.rotation.angleTo(camera.quaternion)).toBeLessThan(1e-5);
  });
  it('descarta uma referência sem área ou com cantos espelhados', () => {
    const { corners } = observe(new Vector3(0, 0.33, 0.15), new Vector3(), 640, 360);
    expect(markerCameraPose({ ...corners, bottomLeftCorner: corners.topLeftCorner }, 640, 360)).toBeNull();
    expect(
      markerCameraPose(
        { ...corners, bottomLeftCorner: corners.topRightCorner, topRightCorner: corners.bottomLeftCorner },
        640,
        360,
      ),
    ).toBeNull();
  });
  it('estima a focal de outra lente a partir de um cartão inclinado', () => {
    const position = new Vector3(.035,.23,.18);
    const {corners} = observe(position,new Vector3(),800,600,55);
    const first = markerCameraPose(corners,800,600);
    expect(first?.lensSample).toBeCloseTo(1 / (2 * Math.tan(55*Math.PI/360)),5);
    const pose = markerCameraPose(corners,800,600,first!.lensSample!);
    expect(pose?.position.distanceTo(position)).toBeLessThan(.0001);
  });
  it('só atribui escala a um cartão métrico do mesmo restaurante', () => {
    const page = 'https://menu.local/r/brasa/produto/burger';
    expect(isTableMarker('https://menu.local/r/brasa/mesa/07#ar-menu-50mm', page)).toBe(true);
    for (const wrong of [
      page,
      'https://menu.local/r/outro#ar-menu-50mm',
      'bad url',
      'https://other.local/r/brasa#ar-menu-50mm',
    ]) {
      expect(isTableMarker(wrong, page)).toBe(false);
    }
  });
});
