/** Stable hue (0-359) derived from a string, used to tint tag and deck tiles. */
export function hueFromString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}
