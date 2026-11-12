import { Matrix4, Quaternion, Vector3 } from 'three';
import { MARKER_MM } from '../qrcodes/tableMarker';
import { DEFAULT_FOCAL_RATIO } from './tableDistance';

type Pixel = { x: number; y: number };
export type MarkerCorners = {
  topLeftCorner: Pixel;
  topRightCorner: Pixel;
  bottomRightCorner: Pixel;
  bottomLeftCorner: Pixel;
};

/** Recover a camera pose from a metric square in the uncropped video frame.
 * X follows the printed top edge, Z points down the paper, and Y points off the table.
 * The focal length is an estimate; relative size benefits from observing the actual symbol.
 */
export function markerCameraPose(c: MarkerCorners, width: number, height: number, focalRatio = DEFAULT_FOCAL_RATIO) {
  const corners = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  const focal = Math.max(width, height) * focalRatio;
  if (
    corners.some((p, i) => {
      const next = corners[(i + 1) % 4]!;
      return !Number.isFinite(p.x + p.y) || Math.hypot(p.x - next.x, p.y - next.y) < 12;
    })
  )
    return null;
  const [a, b, d, e] = corners.map(
    (p) => new Vector3((p.x - width / 2) / focal, (height / 2 - p.y) / focal, -1),
  ) as [Vector3, Vector3, Vector3, Vector3];
  // Homogeneous depths at the square's vertices satisfy a + d = b + e.
  const depths = new Matrix4().makeBasis(b, e, d.clone().negate());
  if (Math.abs(depths.determinant()) < 1e-8) return null;
  const k = a.clone().applyMatrix4(depths.invert());
  if (Math.min(k.x, k.y, k.z) <= 0) return null;
  const right = b.multiplyScalar(k.x).sub(a);
  const down = e.multiplyScalar(k.y).sub(a);
  const lengthX = right.length(),
    lengthZ = down.length();
  // A square has perpendicular edges of equal length. Oblique, sufficiently
  // large observations constrain the focal length; a frontal view does not.
  const dotXY = right.x*down.x + right.y*down.y;
  const diffXY = right.x**2 + right.y**2 - down.x**2 - down.y**2;
  const dotZ = right.z*down.z, diffZ = right.z**2-down.z**2;
  const estimate = focalRatio * Math.sqrt(-(dotXY*dotZ + diffXY*diffZ)/(dotZ**2+diffZ**2));
  const spans = corners.map((p,i) => Math.hypot(p.x - corners[(i+1)%4]!.x,p.y - corners[(i+1)%4]!.y));
  const lensSample = Math.min(...spans) > 40 && Math.max(Math.abs(right.z)/lengthX,Math.abs(down.z)/lengthZ) > .42
    && estimate > .48 && estimate < 1.5 ? estimate : null;
  if (Math.min(lengthX, lengthZ) / Math.max(lengthX, lengthZ) < 0.72) return null;
  const metric = ((MARKER_MM / 1000) * 2) / (lengthX + lengthZ);
  const center = a.clone().addScaledVector(right, 0.5).addScaledVector(down, 0.5).multiplyScalar(metric);
  right.normalize();
  down.normalize();
  if (Math.abs(right.dot(down)) > 0.3) return null;
  const up = new Vector3().crossVectors(down, right).normalize();
  down.crossVectors(right, up).normalize();
  const transform = new Matrix4().makeBasis(right, up, down).setPosition(center).invert();
  const position = new Vector3().setFromMatrixPosition(transform);
  if (position.y < 0.06 || position.length() > 2.5) return null;
  return { position, rotation: new Quaternion().setFromRotationMatrix(transform), focalRatio, lensSample };
}
