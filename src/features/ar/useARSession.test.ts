import { act, renderHook } from '@testing-library/react';
import { Group } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useARSession } from './useARSession';

const xr = vi.hoisted(() => ({
  loop: null as ((time: number, frame: XRFrame) => void) | null,
  local: new EventTarget(),
  setSession: vi.fn(),
}));

vi.mock('three', async (original) => ({
  ...await original<typeof import('three')>(),
  WebGLRenderer: class {
    domElement = document.createElement('canvas');
    xr = { setReferenceSpaceType: vi.fn(), setSession: xr.setSession, getReferenceSpace: () => xr.local };
    setPixelRatio() {}
    setSize() {}
    setAnimationLoop(loop: typeof xr.loop) { xr.loop = loop; }
    render() {}
    dispose() {}
  },
  PMREMGenerator: class {
    fromScene() { return { texture: null, dispose() {} }; }
    dispose() {}
  },
}));

vi.mock('@/features/models3d/modelLoader', async (original) => ({
  ...await original<typeof import('@/features/models3d/modelLoader')>(),
  loadGltf: () => Promise.resolve({ scene: new Group(), size: { x: 1, y: 1, z: 1 } }),
}));

function setup() {
  const source = { cancel: vi.fn() };
  const session = Object.assign(new EventTarget(), {
    requestHitTestSource: vi.fn(async () => source),
    requestReferenceSpace: vi.fn(async () => new EventTarget()),
    visibilityState: 'visible',
    end: vi.fn(async () => {}),
  });
  const request = vi.fn(async () => session);
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { xr: { requestSession: request } }));
  const onEvent = vi.fn();
  const hook = renderHook(() => useARSession({
    modelUrl: '/dish.glb',
    dimensions: { width_cm: 20, height_cm: 8, depth_cm: 16, diameter_cm: null },
    onEvent,
  }));
  return { ...hook, session, source, request, onEvent };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  xr.setSession.mockReset();
});

describe('native WebXR lifecycle', () => {
  it('requests once on activation and releases a late grant after switching away', async () => {
    const { result, request, session, onEvent } = setup();
    let grant!: (value: typeof session) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
    await act(async () => {
      const pending = result.current.start();
      void result.current.start();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]).toEqual(['immersive-ar', {
        requiredFeatures: ['hit-test'], optionalFeatures: ['anchors'],
      }]);
      result.current.stop();
      grant(session);
      await pending;
    });
    expect(session.end).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('idle');
    expect(onEvent.mock.calls.flat()).toEqual([{ type: 'opened' }, { type: 'exited' }]);
  });

  it('cleans up a failed renderer setup and allows a fresh launch', async () => {
    const { result, session } = setup();
    xr.setSession.mockRejectedValueOnce(new Error('GL incompatible'));
    await act(() => result.current.start());
    expect(result.current.error?.kind).toBe('session');
    expect(session.end).toHaveBeenCalledOnce();
    expect(document.querySelector('canvas')).toBeNull();
    await act(() => result.current.start());
    expect(result.current.status).toBe('scanning');
  });

  it('reports denied activation without retaining the startup lock', async () => {
    const { result, request } = setup();
    request.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    await act(() => result.current.start());
    expect(result.current.error?.kind).toBe('permission');
    await act(() => result.current.start());
    expect(result.current.status).toBe('scanning');
  });

  it('places only on a confirmed hit, follows the anchor, and clears it on reference reset', async () => {
    const { result, session, source } = setup();
    vi.stubGlobal('XRRigidTransform', class {});
    const anchor = { anchorSpace: {}, delete: vi.fn() };
    const matrix = new Float32Array(16);
    matrix[5] = 1;
    const pose = (y: number) => ({ emulatedPosition: false, transform: { position: { x: 0, y, z: 0 }, matrix } });
    const frame = {
      getViewerPose: () => pose(1),
      getHitTestResults: () => [{ getPose: () => pose(0.6) }],
      getPose: () => pose(0.65),
      createAnchor: vi.fn(async () => anchor),
    };
    const tick = (time: number) => act(() => xr.loop!(time, frame as unknown as XRFrame));
    const select = () => session.dispatchEvent(Object.assign(new Event('select'), { frame }));
    await act(() => result.current.start());
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now);
    tick(now - 150);
    act(() => { select(); });
    expect(result.current.status).toBe('scanning');
    tick(now - 75);
    tick(now);
    expect(result.current.surfaceFound).toBe(true);
    await act(async () => { select(); });
    expect(result.current.status).toBe('placed');
    tick(now + 250);
    expect(result.current.distance?.heightCm).toBe(35);
    act(() => { xr.local.dispatchEvent(new Event('reset')); });
    expect(anchor.delete).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('scanning');
    expect(result.current.surfaceFound).toBe(false);
    act(() => { session.dispatchEvent(new Event('end')); });
    expect(source.cancel).toHaveBeenCalledOnce();
    expect(session.end).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});
