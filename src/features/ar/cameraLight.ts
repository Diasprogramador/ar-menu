/** Mean midtone of the central camera image. Sample the video before composing the dish. */
export function cameraBrightness(frame: ImageData) {
  let sum = 0, count = 0;
  for (let row = 1; row < 8; row++) {
    for (let col = 1; col < 12; col++) {
      const i = 4 * (Math.floor(frame.height * row / 8) * frame.width + Math.floor(frame.width * col / 12));
      const y = (frame.data[i]! * .213 + frame.data[i+1]! * .715 + frame.data[i+2]! * .072) / 255;
      sum += Math.max(.08, Math.min(.9, y));
      count++;
    }
  }
  return sum/count;
}
