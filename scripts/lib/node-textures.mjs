// Pixel decoding/encoding for Three's browser-oriented asset tools. Build time only.
import { Canvas, createCanvas, loadImage } from '@napi-rs/canvas';

globalThis.self ??= globalThis;
// Three identifies DataTexture by image.data. NAPI's unrelated data() method
// would make the exporter interpret canvases as empty pixel arrays.
delete Object.getPrototypeOf(createCanvas(1, 1)).data;
globalThis.HTMLCanvasElement ??= Canvas;
globalThis.document ??= { createElement: () => createCanvas(1, 1) };
globalThis.createImageBitmap ??= async (blob) => {
  const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas;
};
