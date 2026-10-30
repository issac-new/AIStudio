// xterm 终端调色板可读性守门（run23 用户实报「终端文字不可读」根治件）：
// 两处终端面板（IDE/Cockpit）曾把 ANSI black 配成 #000000（黑底隐形）、
// brightBlack 配成 border 灰（#333≈1.6:1）、brightWhite 配 'var(--bg-card)'
// 字符串（xterm toColor 不认 var() → 静默回落）——暗色输出（时间戳/分隔线/
// 进度条）全部不可读。本测试按 one-dark/one-light 锚定 black 族值并计算
// 对终端底色的 WCAG 对比度，同时禁止主题槽位出现 var() 字面量。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function lum(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`bad hex ${hex}`)
  const n = parseInt(m[1], 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
function contrast(a: string, b: string): number {
  const l1 = lum(a), l2 = lum(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const FILES = [
  resolve(__dirname, '../ide/views/IdeTerminalPanel.vue'),
  resolve(__dirname, '../cockpit/components/CockpitTerminalPane.vue'),
]

// 提取主题 return 行里的槽位值
function slots(line: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of line.matchAll(/(\w+): ('[^']*'|`[^`]*`)/g)) out[m[1]] = m[2].slice(1, -1)
  return out
}

const DARK_BG = '#1a1a1a'   // cssVar('--bg-primary') 深色回落值
const LIGHT_BG = '#fafafa'  // 浅色回落值

describe('xterm 终端调色板可读性（black 族 ≥3:1；禁 var() 字面量）', () => {
  for (const f of FILES) {
    const name = f.split('/').pop()
    const src = readFileSync(f, 'utf8')
    // 深色分支：含 black: '#6e7681' 的 return 行；浅色分支：black: '#6a6d76'
    const darkLine = src.split('\n').find(l => l.includes("black: '#6e7681'") && l.includes('background: bg'))
    const lightLine = src.split('\n').find(l => l.includes("black: '#6a6d76'") && l.includes('background: bg'))

    it(`${name}：深色分支 black/brightBlack 对 #1a1a1a 底 ≥3:1`, () => {
      expect(darkLine, '深色主题行').toBeTruthy()
      const s = slots(darkLine!)
      expect(contrast(s.black, DARK_BG), 'black').toBeGreaterThanOrEqual(3)
      expect(contrast(s.brightBlack, DARK_BG), 'brightBlack').toBeGreaterThanOrEqual(3)
      expect(contrast(s.brightWhite, DARK_BG), 'brightWhite').toBeGreaterThanOrEqual(3)
    })

    it(`${name}：浅色分支 black/brightBlack 对 #fafafa 底 ≥3:1`, () => {
      expect(lightLine, '浅色主题行').toBeTruthy()
      const s = slots(lightLine!)
      expect(contrast(s.black, LIGHT_BG), 'black').toBeGreaterThanOrEqual(3)
      expect(contrast(s.brightBlack, LIGHT_BG), 'brightBlack').toBeGreaterThanOrEqual(3)
    })

    it(`${name}：主题槽位禁 var() 字面量（xterm toColor 静默回落坑）`, () => {
      for (const ln of [darkLine, lightLine]) {
        if (!ln) continue
        for (const v of Object.values(slots(ln))) {
          expect(v.startsWith('var('), `槽位值 ${v}`).toBe(false)
        }
      }
    })
  }
})
