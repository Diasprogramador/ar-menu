/** Short-baseline camera tracking around the tapped point. A fixed bank of
 * textured patches avoids integrating flow indefinitely on a moving phone. */
type Point = { x: number; y: number };
type Patch = { origin: Point; previous: Point; samples: Float32Array };
export type ImagePlane = { width: number; height: number; data: Uint8Array };

export function greyPlane(frame: ImageData): ImagePlane {
  // Keep the search window and CPU cost similar on different camera sensors.
  const width = Math.ceil(frame.width / 2),
    height = Math.ceil(frame.height / 2);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * 2 * frame.width + 2 * x) * 4;
      data[y * width + x] = (frame.data[i]! * 77 + frame.data[i + 1]! * 150 + frame.data[i + 2]! * 29) >> 8;
    }
  return { width, height, data };
}

const R = 3,
  COUNT = 49;
function sample(img: ImagePlane, x: number, y: number, out: Float32Array) {
  if (x < R || y < R || x >= img.width - R || y >= img.height - R) return 0;
  let sum = 0,
    sumSq = 0,
    i = 0;
  for (let dy = -R; dy <= R; dy++) {
    let index = (y + dy) * img.width + x - R;
    for (let dx = -R; dx <= R; dx++) {
      const v = img.data[index++]!;
      out[i++] = v;
      sum += v;
      sumSq += v * v;
    }
  }
  const length = Math.sqrt(Math.max(0, sumSq - (sum * sum) / COUNT));
  if (length < 42) return 0;
  for (let k = 0; k < COUNT; k++) out[k] = (out[k]! - sum / COUNT) / length;
  return length;
}

export class TableTexture {
  private patches: Patch[] = [];
  private center: Point;
  private scratch = new Float32Array(COUNT);
  constructor(img: ImagePlane, center: Point) {
    this.center = center;
    const cell = Math.round(Math.min(img.width, img.height) * 0.075);
    for (let row = -1; row <= 1; row++)
      for (let col = -1; col <= 1; col++) {
        let best = 0;
        let patch: Patch | undefined;
        for (let dy = -4; dy <= 4; dy += 2)
          for (let dx = -4; dx <= 4; dx += 2) {
            const x = Math.round(center.x + col * cell + dx),
              y = Math.round(center.y + row * cell + dy);
            const score = sample(img, x, y, this.scratch);
            if (score <= best) continue;
            best = score;
            patch = { origin: { x, y }, previous: { x, y }, samples: this.scratch.slice() };
          }
        if (patch) this.patches.push(patch);
      }
  }

  track(img: ImagePlane) {
    const matches: { p: Patch; x: number; y: number }[] = [];
    for (const p of this.patches) {
      let score = 0.82,
        runnerUp = 0,
        bestX = 0,
        bestY = 0;
      for (let dy = -8; dy <= 8; dy++)
        for (let dx = -8; dx <= 8; dx++) {
          const x = p.previous.x + dx,
            y = p.previous.y + dy;
          if (!sample(img, x, y, this.scratch)) continue;
          let corr = 0;
          for (let i = 0; i < COUNT; i++) corr += p.samples[i]! * this.scratch[i]!;
          if (corr > score) {
            if (Math.abs(x - bestX) + Math.abs(y - bestY) > 2)
              runnerUp = Math.max(runnerUp, score === 0.82 ? 0 : score);
            score = corr;
            bestX = x;
            bestY = y;
          } else if (Math.abs(x - bestX) + Math.abs(y - bestY) > 2) runnerUp = Math.max(runnerUp, corr);
        }
      if (score > 0.82 && score - runnerUp > 0.035) matches.push({ p, x: bestX, y: bestY });
    }
    // Similarity consensus rejects independently moving details, flat colours
    // and repeated patterns. The scale is relative to this initial viewpoint.
    let support = 0;
    let result: { x: number; y: number; scale: number } | null = null;
    let inliers: typeof matches = [];
    for (const a of matches)
      for (const b of matches) {
        const dx = b.p.origin.x - a.p.origin.x,
          dy = b.p.origin.y - a.p.origin.y,
          norm = dx * dx + dy * dy;
        if (norm < 120) continue;
        const u = b.x - a.x,
          v = b.y - a.y,
          cos = (u * dx + v * dy) / norm,
          sin = (v * dx - u * dy) / norm;
        const scale = Math.hypot(cos, sin);
        if (scale < 0.65 || scale > 1.55) continue;
        const project = (p: Point) => ({
          x: a.x + cos * (p.x - a.p.origin.x) - sin * (p.y - a.p.origin.y),
          y: a.y + sin * (p.x - a.p.origin.x) + cos * (p.y - a.p.origin.y),
        });
        const agreed = matches.filter((m) => {
          const p = project(m.p.origin);
          return Math.hypot(p.x - m.x, p.y - m.y) < 2.2;
        });
        if (agreed.length >= 5 && agreed.length > support) {
          support = agreed.length;
          inliers = agreed;
          result = { ...project(this.center), scale };
        }
      }
    if (result) {
      for (const m of inliers) m.p.previous = { x: m.x, y: m.y };
    }
    return result;
  }
}
