import jsQR from 'jsqr';
import { isTableMarker } from '../qrcodes/tableMarker';
import { greyPlane, TableTexture } from './tableTexture';
import { cameraBrightness } from './cameraLight';

export type FrameRequest = {
  frame: ImageData;
  page: string;
  sequence: number;
  anchor: { x: number; y: number } | null;
};
let texture: TableTexture | null = null;
let previousSequence = -1;
let lastQr = -Infinity;
self.onmessage = ({ data }: MessageEvent<FrameRequest>) => {
  const { frame, page, sequence, anchor } = data;
  const scan = !anchor || performance.now() - lastQr > 350;
  const code = scan ? jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' }) : null;
  if (scan) lastQr = performance.now();
  const corners = code && isTableMarker(code.data, page) ? code.location : null;
  let surface = null;
  if (anchor) {
    const img = greyPlane(frame);
    if (sequence !== previousSequence) {
      texture = new TableTexture(img, { x: anchor.x * img.width, y: anchor.y * img.height });
    } else {
      const motion = texture?.track(img);
      if (motion) surface = { x: motion.x / img.width, y: motion.y / img.height, scale: motion.scale };
    }
  } else texture = null;
  previousSequence = sequence;
  self.postMessage({ corners, width: frame.width, height: frame.height, sequence, surface, brightness: cameraBrightness(frame) });
};
