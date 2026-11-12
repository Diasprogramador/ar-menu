import { describe, expect, it } from 'vitest';
import { findTablePoint, TablePoseTracker } from './xrTable';

const space = {} as XRReferenceSpace;
function pose(x: number, y: number, z: number, normalY = 1, emulatedPosition = false) {
  const matrix = new Float32Array(16);
  matrix[5] = normalY;
  return { transform: { position: { x, y, z }, matrix }, emulatedPosition };
}
const eye = pose(0, 1, 0);
const table = pose(0, 0.6, -0.3);
const point = table.transform.position;

describe('handheld horizontal plane hits', () => {
  it('takes the nearest usable table even when a nearer hit has no pose or hits a wall', () => {
    const hits = [null, pose(0, 0.9, -0.1, 0), table, pose(0, 0.45, -0.5)];
    expect(findTablePoint(eye, hits.map(hit => ({ getPose: () => hit })), space)).toEqual(point);
  });

  it.each([
    pose(0, 1.2, 0), pose(0, -0.5, 0), pose(0, 0.8, -3), pose(0, 0.99, 0),
    pose(0, 0.6, 0, -1), pose(0, 0.6, 0, 0.8), pose(NaN, 0.6, 0), pose(0, 0.6, 0, 1, true),
  ])('rejects out-of-reach, sloped, invalid or emulated poses', hit => {
    expect(findTablePoint(eye, [{ getPose: () => hit }], space)).toBeNull();
  });
  it('requires tracked viewer position', () => {
    expect(findTablePoint({ ...eye, emulatedPosition: true }, [{ getPose: () => table }], space)).toBeNull();
  });
});

describe('table pose stability', () => {
  function acquiredTracker() {
    const tracker = new TablePoseTracker();
    for (const time of [0, 42, 84]) expect(tracker.update(point, time)).toBeNull();
    expect(tracker.update(point, 126)).toEqual(point);
    return tracker;
  }

  it('smooths small changes without accumulating frame-rate-dependent lag', () => {
    const shifted = { ...point, x: 0.015 };
    const fast = acquiredTracker();
    const slow = acquiredTracker();
    for (const time of [146, 166, 186]) fast.update(shifted, time);
    const x = slow.update(shifted, 186)?.x;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(shifted.x);
    expect(x).toBeCloseTo(fast.confirmed(186)!.x, 8);
  });

  it.each([null, { ...point, y: 0.50 }, { ...point, z: -0.8 }])('withdraws placement on loss or discontinuity', hit => {
    const tracker = acquiredTracker();
    expect(tracker.update(hit, 142)).toBeNull();
    expect(tracker.confirmed(142)).toBeNull();
    expect(tracker.update(point, 158)).toBeNull();
  });

  it('expires the last selectable point while frames are suspended and reacquires after reset', () => {
    const tracker = acquiredTracker();
    expect(tracker.confirmed(400)).toBeNull();
    expect(tracker.update(point, 400)).toBeNull();
    tracker.reset();
    expect(tracker.confirmed(400)).toBeNull();
    expect(tracker.update(point, 450)).toBeNull();
  });
});
