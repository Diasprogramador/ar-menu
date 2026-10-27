import { clamp } from './scale';

export const MAX_MANUAL_PITCH = Math.PI * 0.28;

type ManualOrbitInput = {
  startYaw: number;
  startPitch: number;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
};

/**
 * Converts a one-finger drag into a stable orbit for the universal fallback.
 * Horizontal dragging can complete a full turn; vertical dragging is bounded
 * so the food never flips underneath the table.
 */
export function calculateManualOrbit({
  startYaw,
  startPitch,
  deltaX,
  deltaY,
  viewportWidth,
  viewportHeight,
}: ManualOrbitInput): { yaw: number; pitch: number } {
  const safeWidth = Math.max(viewportWidth, 1);
  const safeHeight = Math.max(viewportHeight, 1);

  return {
    yaw: startYaw + (deltaX / safeWidth) * Math.PI * 2,
    pitch: clamp(
      startPitch + (deltaY / safeHeight) * Math.PI,
      -MAX_MANUAL_PITCH,
      MAX_MANUAL_PITCH,
    ),
  };
}
