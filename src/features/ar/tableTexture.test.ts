import { expect, it } from 'vitest';
import { TableTexture } from './tableTexture';

function makeTable() {
  const width = 180,
    height = 120;
  const data = new Uint8Array(width * height);
  let seed = 42;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  return { width, height, data };
}

it('acompanha o detalhe tocado e descarta uma mesa que perdeu a textura', () => {
  const initial = makeTable();
  const tracker = new TableTexture(initial, { x: 90, y: 60 });
  for (const dx of [0, 4, 8, 12, 16, 20]) {
    const data = new Uint8Array(initial.data.length);
    for (let y = 0; y < initial.height; y++) {
      const index = y * initial.width;
      data.set(initial.data.subarray(index, index + initial.width - dx), index + dx);
    }
    const observation = tracker.track({ ...initial, data });
    expect(observation?.x).toBeCloseTo(90 + dx);
    expect(observation?.y).toBeCloseTo(60);
    expect(observation?.scale).toBeCloseTo(1);
  }
  expect(tracker.track({ ...initial, data: new Uint8Array(initial.data.length).fill(120) })).toBeNull();
});

it('uma superfície lisa nunca fornece uma medida de movimento', () => {
  const plane = makeTable();
  plane.data.fill(127);
  expect(new TableTexture(plane, { x: 90, y: 60 }).track(plane)).toBeNull();
});
