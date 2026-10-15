/** Make authored tiles periodic at runtime; keep their central brushwork untouched. */
export function prepareSurfaceMaterial(pixels: Uint8ClampedArray | Uint8Array, side: number): Uint8ClampedArray {
  if (!Number.isSafeInteger(side) || side < 4 || pixels.length !== side * side * 4) throw new RangeError('Invalid surface material dimensions');
  const output = new Uint8ClampedArray(pixels), weights = new Float32Array(side);
  const band = Math.max(3, side * .11), plateau = Math.min(1.5, band / 2), half = Math.floor(side / 2);
  for (let i = 0; i < side; i++) {
    const distance = Math.min(i + .5, side - i - .5), t = Math.max(0, Math.min(1, (distance - plateau) / (band - plateau)));
    weights[i] = 1 - t * t * (3 - 2 * t);
  }
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const wx = weights[x], wy = weights[y]; if (!wx && !wy) continue;
    const sx = (x + half) % side, sy = (y + half) % side;
    const a = (y * side + x) * 4, b = (y * side + sx) * 4, c = (sy * side + x) * 4, d = (sy * side + sx) * 4;
    for (let channel = 0; channel < 4; channel++) output[a + channel] =
      pixels[a + channel] * (1 - wx) * (1 - wy) + pixels[b + channel] * wx * (1 - wy)
      + pixels[c + channel] * (1 - wx) * wy + pixels[d + channel] * wx * wy;
  }
  return output;
}
