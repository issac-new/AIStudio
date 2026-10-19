// overlay/custom/server/matrix/default-avatar.ts
// 默认头像生成（2026-10-19 群聊身份标识轮，spec D-2）：纯函数、零新依赖
// （node:zlib + 手写 CRC32/PNG 编码）。人类款=首字母+哈希配色（暖/中性 16 色板，
// 色板内碰撞由首字母区分）；AI 款=机器人图形+冷色靛紫系（色系分离=第二重身份
// 线索，spec D-6）。同一 userId 确定性复现（补发/重跑幂等）。
import { deflateSync } from 'node:zlib'

export const AVATAR_SIZE = 128

export type DefaultAvatarKind = 'human' | 'agent'

/** FNV-1a 32bit——配色的唯一哈希源（同 id 必同像）。 */
export function hashUserId(userId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** userId → localpart（@name:server → name）。 */
export function matrixLocalpart(userId: string): string {
  return (userId.startsWith('@') ? userId.slice(1) : userId).split(':')[0]
}

type Rgb = readonly [number, number, number]

// 人类色板：暖色/中性 16 款（中暗明度，白字形成对比；冷色靛紫系留给 AI 款）
const HUMAN_PALETTE: readonly Rgb[] = [
  [192, 57, 57], [210, 92, 44], [219, 134, 40], [172, 145, 45],
  [112, 145, 55], [62, 138, 94], [58, 128, 128], [156, 118, 68],
  [166, 90, 114], [138, 110, 60], [122, 116, 112], [96, 104, 122],
  [150, 86, 64], [128, 142, 70], [196, 118, 74], [104, 124, 138],
]

// AI 色板：冷色靛紫/蓝紫 6 款（与人类色系分离，spec D-6）
const AGENT_PALETTE: readonly Rgb[] = [
  [91, 84, 214], [112, 74, 196], [66, 98, 214],
  [128, 92, 222], [76, 110, 230], [104, 76, 208],
]

// 5×7 点阵字模（A-Z 0-9，行=5bit 高位在左）
const FONT_5X7: Record<string, readonly number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e],
}

/** 首字母来源：displayname 首字符 → localpart 首字符，仅收 ASCII 字母数字；
 *  都不满足（如纯中文昵称+非 ASCII 用户名）返回 null → 画几何形兜底。 */
function pickInitial(userId: string, displayName?: string): string | null {
  for (const source of [displayName?.trim(), matrixLocalpart(userId)]) {
    const ch = source?.charAt(0)
    if (ch && /[A-Za-z0-9]/.test(ch)) return ch.toUpperCase()
  }
  return null
}

class AvatarCanvas {
  readonly rgba: Buffer

  constructor(readonly size: number, private readonly bg: Rgb) {
    this.rgba = Buffer.alloc(size * size * 4)
    this.fillRect(0, 0, size, size, bg)
  }

  setPixel(x: number, y: number, color: Rgb): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    const i = (y * this.size + x) * 4
    this.rgba[i] = color[0]
    this.rgba[i + 1] = color[1]
    this.rgba[i + 2] = color[2]
    this.rgba[i + 3] = 0xff
  }

  fillRect(x: number, y: number, w: number, h: number, color: Rgb): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.setPixel(x + dx, y + dy, color)
  }

  fillCircle(cx: number, cy: number, r: number, color: Rgb): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) this.setPixel(cx + dx, cy + dy, color)
      }
    }
  }

  /** 5×7 字模放大绘制（bit 高位在左）。 */
  drawGlyph(glyph: readonly number[], x0: number, y0: number, scale: number, color: Rgb): void {
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        if ((glyph[ry] >> (4 - rx)) & 1) this.fillRect(x0 + rx * scale, y0 + ry * scale, scale, scale, color)
      }
    }
  }
}

const WHITE: Rgb = [255, 255, 255]

/** 人类款：首字母（白字，×12 放大）+ 哈希配色；无 ASCII 首字母时白色圆点兜底
 *  （配色哈希仍保证「每人不同」）。 */
export function renderHumanAvatarPng(userId: string, displayName?: string): Buffer {
  const color = HUMAN_PALETTE[hashUserId(userId) % HUMAN_PALETTE.length]
  const canvas = new AvatarCanvas(AVATAR_SIZE, color)
  const initial = pickInitial(userId, displayName)
  if (initial && FONT_5X7[initial]) {
    const scale = 12
    canvas.drawGlyph(FONT_5X7[initial], (AVATAR_SIZE - 5 * scale) / 2, (AVATAR_SIZE - 7 * scale) / 2, scale, WHITE)
  } else {
    canvas.fillCircle(AVATAR_SIZE / 2, AVATAR_SIZE / 2, 30, WHITE)
  }
  return encodePng(AVATAR_SIZE, AVATAR_SIZE, canvas.rgba)
}

/** AI 款：机器人图形（天线+头+双耳+眼洞+口+身体，白色）+ 冷色靛紫系哈希配色。 */
export function renderAgentAvatarPng(userId: string): Buffer {
  const color = AGENT_PALETTE[hashUserId(userId) % AGENT_PALETTE.length]
  const canvas = new AvatarCanvas(AVATAR_SIZE, color)
  // 天线（球+杆）
  canvas.fillCircle(64, 16, 6, WHITE)
  canvas.fillRect(61, 22, 6, 12, WHITE)
  // 头 + 双耳
  canvas.fillRect(32, 36, 64, 46, WHITE)
  canvas.fillRect(22, 50, 10, 18, WHITE)
  canvas.fillRect(96, 50, 10, 18, WHITE)
  // 眼/口为背景色「挖洞」
  canvas.fillRect(46, 50, 12, 16, color)
  canvas.fillRect(70, 50, 12, 16, color)
  canvas.fillRect(52, 68, 24, 4, color)
  // 身体
  canvas.fillRect(40, 88, 48, 22, WHITE)
  return encodePng(AVATAR_SIZE, AVATAR_SIZE, canvas.rgba)
}

// ── 极简 PNG 编码（RGBA/8bit/无滤波/非隔行）──

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBytes, Buffer.from(data)])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** rgba 行主序（h 行 × w 列 × 4 字节）。 */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ])
}
