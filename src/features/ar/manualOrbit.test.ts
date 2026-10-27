import { describe, expect, it } from 'vitest';

import { calculateManualOrbit, MAX_MANUAL_PITCH } from './manualOrbit';

describe('calculateManualOrbit', () => {
  it('completes one horizontal turn across the viewport', () => {
    const result = calculateManualOrbit({
      startYaw: 0.25,
      startPitch: 0,
      deltaX: 390,
      deltaY: 0,
      viewportWidth: 390,
      viewportHeight: 844,
    });

    expect(result.yaw).toBeCloseTo(0.25 + Math.PI * 2);
    expect(result.pitch).toBe(0);
  });

  it('clamps vertical orbit before the model flips', () => {
    const down = calculateManualOrbit({
      startYaw: 0,
      startPitch: 0,
      deltaX: 0,
      deltaY: 5_000,
      viewportWidth: 390,
      viewportHeight: 844,
    });
    const up = calculateManualOrbit({
      startYaw: 0,
      startPitch: 0,
      deltaX: 0,
      deltaY: -5_000,
      viewportWidth: 390,
      viewportHeight: 844,
    });

    expect(down.pitch).toBe(MAX_MANUAL_PITCH);
    expect(up.pitch).toBe(-MAX_MANUAL_PITCH);
  });

  it('handles a temporarily zero-sized viewport', () => {
    const result = calculateManualOrbit({
      startYaw: 0,
      startPitch: 0,
      deltaX: 1,
      deltaY: 1,
      viewportWidth: 0,
      viewportHeight: 0,
    });

    expect(Number.isFinite(result.yaw)).toBe(true);
    expect(Number.isFinite(result.pitch)).toBe(true);
  });
});
