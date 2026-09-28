// overlay/custom/client/ide/__tests__/search-hotkey-cmdf.test.ts
// 守门：Search Sessions 全局快捷键 ⌘K → ⌘F（patch 377 注入）。
// 走查（2026-09-23 驾驶舱 IDE 回归轮）发现 upstream useKeyboard 的 ⌘K 与
// IDE 命令面板（IdeShell，对标 zcode quickPick）双开，Search 弹层在前遮蔽
// 命令面板。裁决：命令面板保留 ⌘K，Search Sessions 迁 ⌘F。
// 断言对象是注入态上游文件（与 appsidebar-ide-entry.test.ts 同模式）：
// 测试跑在 inject 之后，patch 丢失/漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 自本文件 5 级到 ncwk 根，再进 upstream/hermes-studio（同 appsidebar 模式）；
// overlay 自身文件 4 级到 overlay 根。
const UPSTREAM_CLIENT = '../../../../../upstream/hermes-studio/packages/client/src'
const OVERLAY_ROOT = '../../../..'

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, `${UPSTREAM_CLIENT}/${rel}`), 'utf8')
}

function readOverlay(rel: string): string {
  return readFileSync(resolve(__dirname, `${OVERLAY_ROOT}/${rel}`), 'utf8')
}

const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh', 'zh-TW']

describe('Search Sessions 快捷键 ⌘F 迁移（patch 377 守门）', () => {
  const src = readUpstream('composables/useKeyboard.ts')

  it('绑定改为 f 且带可编辑焦点守卫（monaco/输入框内不抢 ⌘F）', () => {
    expect(src).toContain("e.key.toLowerCase() === 'f' && !isEditableTarget(e.target)")
    expect(src).toContain('function isEditableTarget(')
    expect(src).toContain("el.closest('.monaco-editor')")
  })

  it('搜索不再绑 ⌘K（遮蔽命令面板的根因消除）', () => {
    expect(src).not.toMatch(/===\s*'k'[\s\S]{0,120}openSessionSearch/)
  })

  it('全部 11 个 locale 的 searchHint 同步为 Cmd/Ctrl+F（不留旧键位假提示）', () => {
    for (const loc of LOCALES) {
      const locale = readUpstream(`i18n/locales/${loc}.ts`)
      expect(locale, `locale ${loc} 缺 Cmd/Ctrl+F searchHint`).toMatch(/chat:[\s\S]*?searchHint:\s*'Cmd\/Ctrl\+F'/)
      expect(locale, `locale ${loc} 残留旧键位提示`).not.toContain("'Cmd/Ctrl+K'")
    }
  })

  it('patch 377 已登记 series（inject 枚举单一事实源）', () => {
    const series = readOverlay('patches/series')
    expect(series).toMatch(/^377-client-search-hotkey-cmdf\.patch$/m)
  })

  it('IDE 命令面板保留 ⌘K（迁移的另一侧契约，IdeShell 不动）', () => {
    const shell = readOverlay('custom/client/ide/views/IdeShell.vue')
    expect(shell).toContain("event.key.toLowerCase() === 'k'")
  })
})
