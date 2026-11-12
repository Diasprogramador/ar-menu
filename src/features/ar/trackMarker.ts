import { markerCameraPose, type MarkerCorners } from './markerPose';
import { DEFAULT_FOCAL_RATIO } from './tableDistance';

type Anchor = { x: number; y: number } | null;
export type SurfaceObservation = { x: number; y: number; scale: number };
/** One frame in flight, a bounded capture size, and no camera data leaves the device. */
export function trackMarker(
  video: HTMLVideoElement,
  update: (pose: NonNullable<ReturnType<typeof markerCameraPose>>) => void,
  onSurface: (motion: SurfaceObservation, width: number, height: number) => void,
  onLight: (brightness: number) => void,
) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const unavailable = { stop: () => {}, setAnchor: (_anchor: Anchor) => {} };
  if (!ctx || typeof Worker === 'undefined') return unavailable;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./marker.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return unavailable;
  }
  let busy = false;
  let lastTime = -1;
  let anchor: Anchor = null;
  let sequence = 0;
  let focalRatio = DEFAULT_FOCAL_RATIO;
  const lensSamples: number[] = [];
  const timer = window.setInterval(() => {
    if (busy || video.readyState < 2 || video.currentTime === lastTime || document.hidden) return;
    lastTime = video.currentTime;
    const ratio = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * ratio),
      h = Math.round(video.videoHeight * ratio);
    if (w < 2 || h < 2) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    busy = true;
    worker.postMessage({ frame, page: location.href, sequence, anchor }, [frame.data.buffer]);
  }, 100);
  const stop = () => {
    clearInterval(timer);
    worker.terminate();
  };
  worker.onerror = stop;
  worker.onmessage = ({
    data,
  }: MessageEvent<{
    corners: MarkerCorners | null;
    width: number;
    height: number;
    sequence: number;
    brightness: number;
    surface: SurfaceObservation | null;
  }>) => {
    busy = false;
    if (data.sequence !== sequence) return;
    onLight(data.brightness);
    if (data.surface) onSurface(data.surface, data.width, data.height);
    if (!data.corners) return;
    const pose = markerCameraPose(data.corners, data.width, data.height, focalRatio);
    if (!pose) return;
    if (pose.lensSample !== null) {
      lensSamples.push(pose.lensSample);
      if (lensSamples.length > 7) lensSamples.shift();
      if (lensSamples.length >= 5) {
        const samples = [...lensSamples].sort((a,b)=>a-b);
        const median = samples[Math.floor(samples.length/2)]!;
        if (samples.at(-2)! - samples[1]! < .12 * median) focalRatio += .18*(median-focalRatio);
      }
    }
    update(pose);
  };
  return {
    stop,
    setAnchor: (point: Anchor) => {
      anchor = point;
      sequence++;
    },
  };
}
