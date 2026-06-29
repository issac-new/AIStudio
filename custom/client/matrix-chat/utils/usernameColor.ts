// Per-user display-name coloring, mirroring element-web's username-color
// behavior (color derived from a hash of the user id). The palette is a
// Pure Ink greyscale set so the black-and-white theme is preserved — no
// saturated hues.

const PALETTE: readonly string[] = [
  '#1a1a1a', // darkest
  '#2b2b2b',
  '#3d3d3d',
  '#4f4f4f',
  '#616161',
  '#737373',
  '#404040',
  '#595959',
] as const

/**
 * Deterministic color for a Matrix user id.
 * Uses a simple FNV-1a-style hash so the same id always maps to the same color.
 */
export function colorFromUserId(userId: string): string {
  const input = userId ?? ''
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // 32-bit multiply; keep it in range
    hash = Math.imul(hash, 0x01000193)
  }
  // >>>0 makes it unsigned before modulo
  const index = (hash >>> 0) % PALETTE.length
  return PALETTE[index]
}
