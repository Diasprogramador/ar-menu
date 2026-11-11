import { describe, expect, it } from 'vitest';
import { cameraVerticalFov, heightFromReference, isTableHit, tableDistance } from './tableDistance';

describe('distância à mesa', () => {
  const camera = { x: 2, y: 1.4, z: -1 };
  it('respeita a rotação do vídeo e o recorte de uma câmera horizontal em tela vertical', () => {
    expect(cameraVerticalFov(1080, 1920, 390, 844)).toBeCloseTo(66);
    expect(cameraVerticalFov(1920, 1080, 390, 844)).toBeCloseTo(40.13, 0);
  });
  it('aceita o tampo rastreado e descarta paredes, poses emuladas e perda de rastreamento', () => {
    const matrix = new Float32Array(16);
    matrix[5] = 1;
    const viewer = { emulatedPosition: false, transform: { position: camera, matrix } };
    const hit = { emulatedPosition: false, transform: { position: { ...camera, y: 1 }, matrix } };
    expect(isTableHit(viewer, hit)).toBe(true);
    expect(isTableHit(null, hit)).toBe(false);
    expect(isTableHit(viewer, undefined)).toBe(false);
    expect(isTableHit({ ...viewer, emulatedPosition: true }, hit)).toBe(false);
    matrix[5] = 0;
    expect(isTableHit(viewer, hit)).toBe(false);
  });
  it('distingue altura perpendicular e distância ao ponto inclinado', () => {
    expect(tableDistance(camera, { x: 2.3, y: 1, z: -1 })).toEqual({ heightCm: 40, rangeCm: 50 });
  });
  it('descarta alvos acima da câmera, inválidos ou além do plano visível', () => {
    for (const target of [{ ...camera, y: 2 }, { x: NaN, y: 1, z: 0 }, { x: 100, y: 1, z: 0 }]) {
      expect(tableDistance(camera, target)).toBeNull();
    }
  });
  it('recupera a altura usando dois pontos da régua projetados no plano', () => {
    expect(heightFromReference(camera, { ...camera, x: 2.03, z: -.96 }, 30)).toBeCloseTo(60);
    expect(heightFromReference(camera, camera, 30)).toBeNull();
  });
});
