type Point = { x: number; y: number; z: number };

/** Approximate lens angle on the long sensor axis, then apply the video's CSS object-cover crop. */
export const DEFAULT_FOCAL_RATIO = 1 / (2 * Math.tan(33 * Math.PI / 180));
export function cameraVerticalFov(videoWidth: number, videoHeight: number, width: number, height: number,
  focalRatio = DEFAULT_FOCAL_RATIO) {
  const cover = Math.max(width / videoWidth, height / videoHeight);
  const focalPx = Math.max(videoWidth, videoHeight) * cover * focalRatio;
  return 2 * Math.atan(height / (2 * focalPx)) * 180 / Math.PI;
}

type Pose = { emulatedPosition: boolean; transform: { position: Point; matrix: Float32Array } };

export function isTableHit(viewer: Pose | null | undefined, hit: Pose | null | undefined) {
  if (!viewer || viewer.emulatedPosition || !hit || hit.emulatedPosition) return false;
  // Element 5 is the vertical component of the hit plane's unit normal.
  return (hit.transform.matrix[5] ?? 0) > 0.94 && tableDistance(viewer.transform.position, hit.transform.position) !== null;
}

/** Câmera e ponto de apoio devem estar no mesmo referencial métrico. */
export function tableDistance(camera: Point, target: Point) {
  const height = camera.y - target.y;
  const range = Math.hypot(camera.x - target.x, height, camera.z - target.z);
  if (!Number.isFinite(range) || height <= 0 || range > 30) return null;
  return { heightCm: Math.round(height * 100), rangeCm: Math.round(range * 100) };
}

/** A separação entre raios projetados num plano horizontal é proporcional à altura. */
export function heightFromReference(a: Point, b: Point, assumedHeightCm: number) {
  const spanCm = 100 * Math.hypot(a.x - b.x, a.z - b.z);
  const height = assumedHeightCm * 10 / spanCm; // segmento de régua de 10 cm
  return Number.isFinite(height) && height >= 15 && height <= 120 ? height : null;
}
