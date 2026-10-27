// WCAG AA 对比度 token 守门（2026-10-18）：
// 上游 --text-muted 浅色 #999 / 深色 #888 在常用背景上低于 4.5:1。
// 三个壳层（IaShell/ILaLegacyShell/IDE）分别覆盖 token；本测试固定值并计算
// 与常见背景的对比度，防止后续改色或漏改某个壳。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

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

const LIGHT_BGS = ['#fafafa', '#f0f0f0', '#ffffff']
const DARK_BGS = ['#1a1a1a', '#252525', '#2a2a2a']
const AA = 4.5

describe('壳层文字 token 对比度（WCAG 2.2 AA 正文 4.5:1）', () => {
  it('浅色 muted #666 / secondary #555 对常用浅背景达标', () => {
    for (const bg of LIGHT_BGS) {
      expect(contrast('#666666', bg), `muted on ${bg}`).toBeGreaterThanOrEqual(AA)
      expect(contrast('#555555', bg), `secondary on ${bg}`).toBeGreaterThanOrEqual(AA)
    }
  })

  it('深色 muted #9a9a9a / secondary #a0a0a0 对常用深背景达标', () => {
    for (const bg of DARK_BGS) {
      expect(contrast('#9a9a9a', bg), `muted on ${bg}`).toBeGreaterThanOrEqual(AA)
      expect(contrast('#a0a0a0', bg), `secondary on ${bg}`).toBeGreaterThanOrEqual(AA)
    }
  })

  it('三壳共享 token 单源声明：shell-overrides.scss 浅/深两套齐备且覆盖三壳（漏一壳即红）', () => {
    // 2026-10-27 Task 11 收敛：三壳（.ia-shell/.ide-shell/.ia-lshell）同值 token
    // 从三个壳文件收敛到 shell-overrides.scss 单一定义处（bootstrap 顶层导入，
    // 三壳冷启动都生效）；本守卫语义不变——值固定 + 浅深成对 + 三壳选择器组覆盖。
    const src = readFileSync(resolve(__dirname, '../ia2/styles/shell-overrides.scss'), 'utf8')
    expect(src, 'light 三壳选择器组').toContain('.ia-shell, .ide-shell, .ia-lshell')
    expect(src, 'dark 三壳选择器组').toContain('.dark .ia-shell, .dark .ide-shell, .dark .ia-lshell')
    expect(src, 'light muted').toContain('--text-muted: #666')
    expect(src, 'dark muted').toContain('--text-muted: #9a9a9a')
    expect(src, 'light secondary').toContain('--text-secondary: #555')
    expect(src, 'dark secondary').toContain('--text-secondary: #a0a0a0')
  })

  it('五态状态色在常用背景与状态底色上达 AA（浅/深两套）', () => {
    const light = { fresh: '#17663a', stale: '#7a5a06', fail: '#b3261e', pass: '#17663a', compensated: '#5e3f92' }
    const dark = { fresh: '#53b483', stale: '#d4a017', fail: '#f08a8a', pass: '#53b483', compensated: '#b39ddb' }
    const lightBgs = ['#fafafa', '#f0f0f0', '#f7e2e2', '#deefe6', '#e8dcf4']
    const darkBgs = ['#1a1a1a', '#252525', '#2a2a2a', '#1c2a22', '#30243c']
    for (const [k, v] of Object.entries(light)) {
      for (const bg of lightBgs) expect(contrast(v, bg), `light ${k} on ${bg}`).toBeGreaterThanOrEqual(AA)
    }
    for (const [k, v] of Object.entries(dark)) {
      for (const bg of darkBgs) expect(contrast(v, bg), `dark ${k} on ${bg}`).toBeGreaterThanOrEqual(AA)
    }
    const src = readFileSync(resolve(__dirname, '../ia2/styles/ia2.scss'), 'utf8')
    for (const [k, v] of [...Object.entries(light), ...Object.entries(dark)]) {
      expect(src, `ia2.scss ${k} ${v}`).toContain(`--ia-${k}: ${v}`)
    }
  })

  it('表单控件边框 ≥3:1（WCAG 1.4.11 非文本）且三壳同规则（shell-overrides.scss 单源）', () => {
    const NON_TEXT_AA = 3
    for (const bg of ['#fafafa', '#f0f0f0', '#ffffff']) {
      expect(contrast('#8a8a8a', bg), `light control border on ${bg}`).toBeGreaterThanOrEqual(NON_TEXT_AA)
    }
    for (const bg of ['#1a1a1a', '#252525', '#2a2a2a']) {
      expect(contrast('#808080', bg), `dark control border on ${bg}`).toBeGreaterThanOrEqual(NON_TEXT_AA)
    }
    const src = readFileSync(resolve(__dirname, '../ia2/styles/shell-overrides.scss'), 'utf8')
    expect(src, 'light control border').toContain('--ia-border-control: #8a8a8a')
    expect(src, 'dark control border').toContain('--ia-border-control: #808080')
    // 三壳的 input/select/textarea 都吃到同一规则（选择器组显式列名）
    for (const shell of ['.ia-shell input', '.ide-shell input', '.ia-lshell input']) {
      expect(src, `${shell} 同步`).toContain(shell)
    }
  })

  it('顶栏搜索框有可见 focus-visible 轮廓（WCAG 2.4.7）', () => {
    const src = readFileSync(resolve(__dirname, '../ia2/components/IaShellHeader.vue'), 'utf8')
    expect(src).toContain('.cockpit-top__search-input:focus-visible')
    expect(src).toContain('outline: 2px solid var(--accent-primary')
  })
})
