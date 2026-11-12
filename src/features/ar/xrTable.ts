import { isTableHit } from './tableDistance';

type Point = Pick<DOMPointReadOnly, 'x' | 'y' | 'z'>;
type Pose = Parameters<typeof isTableHit>[0];

/** WebXR returns hits nearest first. A nearer wall can precede the table. */
export function findTablePoint(
  viewer: Pose,
  results: readonly { getPose(space: XRReferenceSpace): Pose }[],
  space: XRReferenceSpace,
): Point | null {
  if (!viewer || viewer.emulatedPosition) return null;
  const eye = viewer.transform.position;
  for (const result of results) {
    const hit = result.getPose(space);
    if (!hit || !isTableHit(viewer, hit)) continue;
    const point = hit.transform.position;
    // Handheld dining distance, measured from the camera in local space.
    const drop = eye.y - point.y;
    if (drop >= 0.08 && drop <= 1.2 && Math.hypot(eye.x - point.x, drop, eye.z - point.z) <= 1.8) {
      return point;
    }
  }
  return null;
}

const ACQUIRE_MS = 125;
const MAX_FRAME_GAP_MS = 100;

/** Accumulate a continuous run of nearby hits, smoothing in metres and elapsed time. */
export class TablePoseTracker {
  private point: Point | null = null;
  private since = 0;
  private last = 0;

  reset() {
    this.point = null;
  }

  update(hit: Point | null, time: number) {
    if (!hit) {
      this.reset();
      return null;
    }
    const dt = time - this.last;
    this.last = time;
    const previous = this.point;
    if (!previous || dt < 0 || dt > MAX_FRAME_GAP_MS ||
        Math.abs(hit.y - previous.y) > 0.04 || Math.hypot(hit.x - previous.x, hit.z - previous.z) > 0.12) {
      this.since = time;
      this.point = hit;
    } else {
      const alpha = 1 - Math.exp(-dt / 65);
      this.point = {
        x: previous.x + (hit.x - previous.x) * alpha,
        y: previous.y + (hit.y - previous.y) * alpha,
        z: previous.z + (hit.z - previous.z) * alpha,
      };
    }
    return this.confirmed(time);
  }

  confirmed(time: number) {
    return this.last - this.since >= ACQUIRE_MS && time - this.last <= MAX_FRAME_GAP_MS ? this.point : null;
  }
}
