// overlay/custom/client/ia2/__tests__/visual-coherence.test.ts
// 守门（产品一致性 Task 11 · 壳 token 收敛 + 触及组件视觉最小集）：
// ① 三壳（IaShell/IdeShell/IaLegacyShell）同值 token 只在 shell-overrides.scss
//    定义一处（正身=原 ia2.scss .ia-shell 值：WCAG AA 修正灰），壳组件不再
//    各自重复覆盖块
// ② 触及组件（landing hero / security bar / 命令面板条目）视觉最小集：
//    正文 14px 为主、辅助字号 ≥12px、主要动作 40-44px 命中区
// ③ 设置命令统一 ia2.govSettings（设置目录唯一入口，Task 7 裁定）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string): string => readFileSync(resolve(__dirname, rel), 'utf8')

const SHELL_OVERRIDES = '../styles/shell-overrides.scss'
const IA2_SCSS = '../styles/ia2.scss'
const LEGACY_SHELL = '../views/IaLegacyShell.vue'
const IDE_SHELL = '../../ide/views/IdeShell.vue'
const LANDING_HERO = '../../ide/components/IdeLandingHero.vue'
const SECURITY_BAR = '../../ide/components/IdeSecurityBoostBar.vue'
const COMMAND_PALETTE = '../../ide/components/IdeCommandPalette.vue'
const FILES_PANE = '../../ide/views/IdeFilesPane.vue'

describe('三壳 token 单源（Task 11 收敛）', () => {
  it('shell-overrides.scss 承载三壳共享 token：浅/暗成对 + 表单控件边框规则', () => {
    const scss = read(SHELL_OVERRIDES)
    // 三壳选择器组同块定义（bootstrap 顶层导入，冷启动独立 fullscreen 路由可达）
    expect(scss).toContain('.ia-shell, .ide-shell, .ia-lshell')
    expect(scss).toContain('.dark .ia-shell, .dark .ide-shell, .dark .ia-lshell')
    // 正身值 = 原 ia2.scss .ia-shell 定义（2026-10-18 WCAG AA 修正灰）
    expect(scss).toContain('--text-secondary: #555')
    expect(scss).toContain('--text-muted: #666')
    expect(scss).toContain('--ia-border-control: #8a8a8a')
    expect(scss).toContain('--text-secondary: #a0a0a0')
    expect(scss).toContain('--text-muted: #9a9a9a')
    expect(scss).toContain('--ia-border-control: #808080')
    // 表单控件边框（WCAG 1.4.11）三壳同规则
    expect(scss).toContain('.ide-shell input')
    expect(scss).toContain('.ia-lshell input')
  })

  it('壳侧不再重复定义：IdeShell/IaLegacyShell/ia2.scss 无 token 覆盖块', () => {
    for (const f of [IA2_SCSS, LEGACY_SHELL, IDE_SHELL]) {
      const src = read(f)
      expect(src, `${f} 不应再定义 --text-secondary 覆盖`).not.toMatch(/--text-secondary:\s*#/)
      expect(src, `${f} 不应再定义 --text-muted 覆盖`).not.toMatch(/--text-muted:\s*#/)
      expect(src, `${f} 不应再定义 --ia-border-control 覆盖`).not.toMatch(/--ia-border-control:\s*#/)
    }
  })
})

describe('触及组件视觉最小集（正文 14px 为主 / 辅助 ≥12px / 主要动作 40-44px 命中区）', () => {
  const styleOf = (src: string): string => src.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const fontSizes = (src: string): number[] =>
    [...styleOf(src).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))

  it('landing hero / security bar / 命令面板：样式块内无低于 12px 字号', () => {
    for (const f of [LANDING_HERO, SECURITY_BAR, COMMAND_PALETTE]) {
      const sizes = fontSizes(read(f))
      expect(sizes.length, `${f} 应有可检字号`).toBeGreaterThan(0)
      const min = Math.min(...sizes)
      expect(min, `${f} 辅助字号低于 12px：${sizes.join(',')}px`).toBeGreaterThanOrEqual(12)
    }
  })

  it('landing 正文 14px 为主：副题与任务标题 14px', () => {
    const hero = styleOf(read(LANDING_HERO))
    expect(hero).toMatch(/\.ide-landing__sub[^{]*\{[^}]*font-size:\s*14px/)
    expect(hero).toMatch(/\.ide-landing__task-title\s*\{[^}]*font-size:\s*14px/)
  })

  it('主要动作 40px 命中区：landing 任务行/进入钮、命令面板条目、扫描执行/boost 发送', () => {
    const hero = styleOf(read(LANDING_HERO))
    expect(hero).toMatch(/\.ide-landing__task\s*{[^}]*min-height:\s*40px/)
    expect(hero).toMatch(/\.ide-landing__enter\s*{[^}]*min-height:\s*40px/)
    const palette = styleOf(read(COMMAND_PALETTE))
    expect(palette).toMatch(/\.ide-palette__item\s*{[^}]*min-height:\s*40px/)
    expect(palette).toMatch(/\.ide-palette__item\s*{[^}]*font-size:\s*14px/)
    const secbar = styleOf(read(SECURITY_BAR))
    expect(secbar).toMatch(/\.ide-secbar__run\s*{[^}]*min-height:\s*40px/)
    expect(secbar).toMatch(/\.ide-secbar__boost-send\s*{[^}]*min-height:\s*40px/)
  })
})

describe('设置命令统一 ia2.govSettings（设置目录唯一入口）', () => {
  it('命令面板与文件页「查看账号角色」不再指 hermes.settings', () => {
    const palette = read(COMMAND_PALETTE)
    expect(palette).toContain("{ key: 'settings', to: { name: 'ia2.govSettings' } }")
    expect(palette).not.toContain("{ name: 'hermes.settings' }")
    const files = read(FILES_PANE)
    expect(files).toContain("router.push({ name: 'ia2.govSettings' })")
    expect(files).not.toContain("{ name: 'hermes.settings' }")
  })
})
