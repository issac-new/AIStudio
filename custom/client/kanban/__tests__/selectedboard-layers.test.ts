// overlay/custom/client/kanban/__tests__/selectedboard-layers.test.ts
// patch 540 + ide store 批四守门（2026-10-02 #13 步二批四收官）：
// ①540 登记+纯净签名 ②上游 kanban store 选板走分层（收养+读写）③ide store
// layout/sidebar 两键分层（遗留收养）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
const UP = resolve(OVERLAY_ROOT, '../upstream/hermes-studio')

describe('patch 540：看板选板迁分层', () => {
  it('series 登记 + 纯净签名（6+/2-，零其它补丁行混入）', () => {
    expect(readFileSync(resolve(OVERLAY_ROOT, 'patches/series'), 'utf8')).toContain('540-kanban-selectedboard-layers.patch')
    const patch = readFileSync(resolve(OVERLAY_ROOT, 'patches/540-kanban-selectedboard-layers.patch'), 'utf8')
    const plus = patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
    const minus = patch.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'))
    expect(plus).toHaveLength(6)
    expect(minus).toHaveLength(2)
    // 纯净（反向断言）：plus 行零其它补丁标记（v020/probeAuthViaRest/diagnostics 等）
    const foreign = ['probeAuthViaRest', 'HERMES_CUSTOM', 'diagnostics = ref', 'projects = ref', 'selectedIds']
    for (const l of plus) {
      for (const f of foreign) expect(l.includes(f), `混入外来行：${l}`).toBe(false)
    }
  })

  it('上游 kanban store：读收养+分层读、写分层', () => {
    const src = readFileSync(resolve(UP, 'packages/client/src/stores/hermes/kanban.ts'), 'utf8')
    expect(src).toContain("adoptLegacySetting('kanban.selectedBoard', KANBAN_SELECTED_BOARD_STORAGE_KEY)")
    expect(src).toContain("writeSetting('user', 'kanban.selectedBoard', resolved)")
    expect(src).not.toContain('safeStorageSet(KANBAN_SELECTED_BOARD_STORAGE_KEY')
  })
})

describe('ide store 批四：layout/sidebar 迁分层', () => {
  it('两键读写走分层+遗留收养；旧裸键键名仅存于收养参数', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ide/store/ide.ts'), 'utf8')
    expect(src).toContain("loadJson<IdeLayoutPrefs>('ide.layout', DEFAULT_LAYOUT, LAYOUT_KEY)")
    expect(src).toContain("loadJson('ide.sidebar', DEFAULT_SIDEBAR, SIDEBAR_KEY)")
    expect(src).toContain("writeSetting('user', 'ide.layout', value)")
    expect(src).toContain("writeSetting('user', 'ide.sidebar', sidebar.value)")
  })
})
