// diagram-design 收编测试（项1+项2 守门）：
//   1. vendored 正本完整性（SKILL.md/references/scripts/LICENSE/PROVENANCE）
//   2. sync 脚本幂等（首装→全 skip→漂移重写；品牌化口径参与对账）
//   3. 品牌 profile WCAG 对比度机械验（等效上游 verify-contrast 的门；改 token 当场 fail）
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const overlayRoot = resolve(__dirname, '..')
const SKILL_DIR = join(overlayRoot, 'assets', 'skills', 'diagram-design')
const BRAND_FILE = join(overlayRoot, 'assets', 'skills', 'diagram-design-brand', 'swarmstudio.profile.md')
const SYNC_SCRIPT = join(overlayRoot, 'scripts', 'sync-diagram-skill.mjs')

// ---------- WCAG 2.x 对比度 ----------
function channelLum(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channelLum(rgb[0]) + 0.7152 * channelLum(rgb[1]) + 0.0722 * channelLum(rgb[2])
}
function parseColor(token: string): { rgb: [number, number, number]; alpha: number } {
  const hex = token.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const v = hex[1]
    return { rgb: [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)], alpha: 1 }
  }
  const rgba = token.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i)
  if (rgba) {
    return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: Number(rgba[4]) }
  }
  throw new Error(`无法解析的颜色 token：${token}`)
}
function composite(fg: { rgb: [number, number, number]; alpha: number }, bg: [number, number, number]): [number, number, number] {
  return [
    Math.round(fg.rgb[0] * fg.alpha + bg[0] * (1 - fg.alpha)),
    Math.round(fg.rgb[1] * fg.alpha + bg[1] * (1 - fg.alpha)),
    Math.round(fg.rgb[2] * fg.alpha + bg[2] * (1 - fg.alpha)),
  ]
}
function contrastRatio(fgToken: string, bgToken: string): number {
  const fg = parseColor(fgToken)
  const bg = parseColor(bgToken)
  const fgRgb = fg.alpha < 1 ? composite(fg, composite(bg, [255, 255, 255])) : fg.rgb
  const bgRgb = bg.alpha < 1 ? composite(bg, [255, 255, 255]) : bg.rgb
  const l1 = luminance(fgRgb)
  const l2 = luminance(bgRgb)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function parseRoles(md: string): Map<string, { light: string; dark: string }> {
  const roles = new Map<string, { light: string; dark: string }>()
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|[^|]*\|\s*`([^`]+)`(?:\s*\([^)]*\))?\s*\|\s*`([^`]+)`(?:\s*\([^)]*\))?\s*\|/i)
    if (m) roles.set(m[1], { light: m[2], dark: m[3] })
  }
  return roles
}

describe('项1 vendored 正本完整性', () => {
  it('SKILL.md/LICENSE/PROVENANCE/scripts 六件在位', () => {
    expect(existsSync(join(SKILL_DIR, 'SKILL.md'))).toBe(true)
    expect(existsSync(join(SKILL_DIR, 'LICENSE'))).toBe(true)
    expect(existsSync(join(SKILL_DIR, 'PROVENANCE.md'))).toBe(true)
    const scripts = readdirSync(join(SKILL_DIR, 'scripts')).filter((f) => f.endsWith('.py')).sort()
    expect(scripts).toEqual([
      'drawio_extract.py', 'excalidraw_extract.py', 'export_png.py',
      'export_svg.py', 'mermaid_extract.py', 'self_check.py',
    ])
  })

  it('references ≥55 篇且含关键件（style-guide/semantic-patterns/profiles/45 图型抽样）', () => {
    const refs = readdirSync(join(SKILL_DIR, 'references')).filter((f) => f.endsWith('.md'))
    expect(refs.length).toBeGreaterThanOrEqual(55)
    for (const key of ['style-guide.md', 'semantic-patterns.md', 'profiles.md', 'type-flowchart.md', 'type-sequence.md', 'type-wardley.md']) {
      expect(refs).toContain(key)
    }
    expect(refs.filter((f) => f.startsWith('type-')).length).toBeGreaterThanOrEqual(45)
  })

  it('PROVENANCE 记录上游锚点', () => {
    const prov = readFileSync(join(SKILL_DIR, 'PROVENANCE.md'), 'utf8')
    expect(prov).toContain('github.com/cathrynlavery/diagram-design')
    expect(prov).toContain('550fd66')
    expect(prov).toContain('MIT')
  })
})

describe('项1 sync 脚本幂等', () => {
  function run(home: string, hostRoot: string, extra: string[] = []): string {
    return execFileSync(process.execPath, [SYNC_SCRIPT, '--host-root', hostRoot, ...extra], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    })
  }

  it('首装→复核 OK→二次全 skip→漂移重写', () => {
    const root = mkdtempSync(join(tmpdir(), 'diagram-sync-'))
    try {
      const home = join(root, 'home')
      const host = join(root, 'host')
      mkdirSync(home, { recursive: true })

      const out1 = run(home, host)
      expect(out1).toContain('install: 技能正本')
      expect(out1).toContain('复核：skill=OK brand=OK profile=OK')
      const styleGuide = join(host, 'skills', 'diagram-design', 'references', 'style-guide.md')
      expect(readFileSync(styleGuide, 'utf8')).toBe(readFileSync(BRAND_FILE, 'utf8'))
      expect(readFileSync(join(home, '.diagram-design', 'profiles', 'swarmstudio.md'), 'utf8')).toBe(readFileSync(BRAND_FILE, 'utf8'))

      const out2 = run(home, host)
      expect(out2).not.toContain('install:')
      expect(out2).not.toContain('update:')
      expect(out2).not.toContain('brand:')
      expect((out2.match(/skip:/g) || []).length).toBe(3)

      // 漂移：目标被外部改动 → 重写并恢复品牌化稳态
      writeFileSync(join(host, 'skills', 'diagram-design', 'references', 'style-guide.md'), 'user edit')
      const out3 = run(home, host)
      expect(out3).toContain('update: 技能正本')
      expect(readFileSync(styleGuide, 'utf8')).toBe(readFileSync(BRAND_FILE, 'utf8'))

      // dry-run 不写盘
      rmSync(join(host, 'skills', 'diagram-design'), { recursive: true, force: true })
      const out4 = run(home, host, ['--dry-run'])
      expect(out4).toContain('[dry-run] install: 技能正本')
      expect(existsSync(join(host, 'skills', 'diagram-design'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('项2 品牌 profile 对比度契约', () => {
  const md = readFileSync(BRAND_FILE, 'utf8')
  const roles = parseRoles(md)

  it('profile 头与 font source=system', () => {
    expect(md).toContain('slug: swarmstudio')
    expect(md).toContain('Font source: `system`')
  })

  it('语义色行齐全', () => {
    for (const role of ['paper', 'paper-2', 'ink', 'ink-strong', 'muted', 'soft', 'rule', 'rule-solid', 'accent', 'accent-tint', 'link']) {
      expect(roles.has(role), `缺 ${role} 行`).toBe(true)
    }
  })

  it('文本 token 两皮肤 ≥4.5:1（ink/muted/soft/link/accent on paper）', () => {
    const paper = roles.get('paper')!
    for (const role of ['ink', 'muted', 'soft', 'link', 'accent']) {
      const t = roles.get(role)!
      expect(contrastRatio(t.light, paper.light), `light ${role}`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t.dark, paper.dark), `dark ${role}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('ink-strong 在 0.85 accent 合成面上 ≥4.5:1', () => {
    const paper = roles.get('paper')!
    const accent = parseColor(roles.get('accent')!.light)
    const accentD = parseColor(roles.get('accent')!.dark)
    const paperL = parseColor(paper.light).rgb
    const paperD = parseColor(paper.dark).rgb
    const surfaceL = composite({ ...accent, alpha: 0.85 }, paperL)
    const surfaceD = composite({ ...accentD, alpha: 0.85 }, paperD)
    const strong = roles.get('ink-strong')!
    const toHex = (rgb: [number, number, number]) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
    expect(contrastRatio(strong.light, toHex(surfaceL))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(strong.dark, toHex(surfaceD))).toBeGreaterThanOrEqual(4.5)
  })

  it('品牌锚定 status-colors.ts 单一事实源（#333333/#1a1a1a/#666666/#e0e0e0）', () => {
    expect(roles.get('accent')!.light).toBe('#333333')
    expect(roles.get('ink')!.light).toBe('#1a1a1a')
    expect(roles.get('muted')!.light).toBe('#666666')
    expect(roles.get('rule-solid')!.light).toBe('#e0e0e0')
  })
})
