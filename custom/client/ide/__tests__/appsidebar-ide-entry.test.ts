// overlay/custom/client/ide/__tests__/appsidebar-ide-entry.test.ts
// 守门（V5 补遗⑤ 后口径）：主侧栏一级入口仅「驾驶舱」+系统折叠组——IDE 一级
// 入口已随 M2 移除（IDE 归一 /app/ide 子页面），系统组三入口（技能用量/主题/
// 宠物商店）已随 S1 摘除。
//
// 断言对象改为本仓 patch 文件（脱离共享注入树——注入态与检出分支不保证同步，
// 读共享树会随并行 clean/inject 翻树假红/假绿；2026-09-29 驾驶舱聚焦轮实测）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

function readPatch(name: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, 'patches', name), 'utf8')
}

describe('AppSidebar 单一级入口守门（⑤ M2/S1 后口径，patch 072/519）', () => {
  const p072 = readPatch('072-cockpit-packages_client_src_components_layout_AppSidebar.vue.patch')
  const p519 = readPatch('519-client-appsidebar-system-trim.patch')

  it('M2：IDE 一级入口已移除——072 无 ide.shell 路由链接与 isIdeArea', () => {
    expect(p072).not.toContain(`:to="{ name: 'ide.shell' }"`)
    expect(p072).not.toContain('isIdeArea')
    expect(p072).not.toContain('overlay[ide]')
  })

  it('驾驶舱唯一一级入口在位（ia2.collab）+ 系统折叠组结构不变', () => {
    expect(p072).toContain(`:to="{ name: 'ia2.collab' }"`)
    expect(p072).toContain('sidebar-system-toggle')
    expect(p072).toContain('sidebar-system-items')
  })

  it('S1：系统组三入口摘除——519 含三处 RouteLinkItem 删除与数组收缩', () => {
    const removedLines = p519.split('\n').filter(l => l.startsWith('-'))
    for (const name of ['hermes.skillsUsage', 'hermes.theme', 'hermes.petdex']) {
      expect(removedLines.some(l => l.includes(`:to="{ name: '${name}' }"`)), name).toBe(true)
    }
    // SYSTEM_ROUTE_NAMES 收缩后的数组不含三名（补丁后态）
    // 补丁后态 = 上下文行(空格) + 新增行(+)；删除行(-)不计
    const after = p519.split('\n').filter(l => (l.startsWith('+') || l.startsWith(' ')) && l.includes('"hermes.'))
    const joined = after.join('\n')
    expect(joined).not.toContain('hermes.skillsUsage')
    expect(joined).not.toContain('hermes.theme')
    expect(joined).not.toContain('hermes.petdex')
    expect(joined).toContain('"hermes.logs"')
    expect(joined).toContain('"hermes.settings"')
  })

  it('series 登记：519/520 在列', () => {
    const s = readFileSync(resolve(OVERLAY_ROOT, 'patches', 'series'), 'utf8')
    expect(s).toContain('519-client-appsidebar-system-trim.patch')
    expect(s).toContain('520-client-webpet-off.patch')
  })
})
