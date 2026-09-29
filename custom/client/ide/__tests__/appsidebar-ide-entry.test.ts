// overlay/custom/client/ide/__tests__/appsidebar-ide-entry.test.ts
// 守门（补遗⑤ M2 后口径反转）：主侧边栏（上游 AppSidebar.vue，经 patch 072 注入）
// 的 IDE 工作台一级入口已移除——IDE 归一为驾驶舱子路由 /app/ide，进入路径 =
// 页头视图切换器（IaViewSwitcher）与任务 ⌨IDE 深链；/ide 旧直链走兼容重定向。
//
// 断言对象改为仓库内 patch 文件本体（非注入态共享树——注入态随并行会话
// inject/clean 漂移，非Hermetic；patch 文件是单一事实源，漂移当场 fail）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 自本文件 3 级到 overlay 根（custom/client/ide/__tests__ → overlay）
const OVERLAY_ROOT = '../../../..'

function readPatch(): string {
  return readFileSync(
    resolve(__dirname, `${OVERLAY_ROOT}/patches/072-cockpit-packages_client_src_components_layout_AppSidebar.vue.patch`),
    'utf8',
  )
}

describe('AppSidebar IDE 一级入口（patch 072 守门，M2 后 = 移除）', () => {
  const src = readPatch()

  it('IDE 一级入口零残留：无 ide.shell RouteLinkItem、无 isIdeArea 高亮', () => {
    expect(src).not.toContain(`:to="{ name: 'ide.shell' }"`)
    expect(src).not.toContain('isIdeArea')
    // 移除说明留在注释行（overlay[ide] 注释标记仍可出现于注释，但不得有入口实体）
    expect(src).not.toMatch(/RouteLinkItem[^<]*ide\.shell/)
  })

  it('驾驶舱仍为唯一一级入口（ia2.collab），其后系统折叠组', () => {
    expect(src).toContain(`:to="{ name: 'ia2.collab' }"`)
    expect(src).toContain('sidebar-system-toggle')
    const ia2Idx = src.indexOf(`:to="{ name: 'ia2.collab' }"`)
    const sysIdx = src.indexOf('sidebar-system-toggle')
    const logsIdx = src.indexOf(`:to="{ name: 'hermes.logs' }"`)
    expect(sysIdx).toBeGreaterThan(ia2Idx)
    expect(logsIdx).toBeGreaterThan(sysIdx)
  })

  it('旧一级入口与底部返回 hack 零残留（patch 299 守门延续；断言新增行无残留）', () => {
    // patch 文件含 '-' 移除行属正常（本 patch 即退役载体）；断言 '+' 新增行零残留
    expect(src).not.toMatch(/^\+.*name: 'hermes\.cockpit'/m)
    expect(src).not.toMatch(/^\+.*name: 'hermes\.loop'/m)
    expect(src).not.toMatch(/^\+.*sidebar-return-tab/m)
  })

  it('系统分组：折叠容器 display:contents + 命中系统页默认展开', () => {
    expect(src).toMatch(/^\+\s*\.sidebar-system-items\s*\{/m)
    expect(src).toMatch(/^\+\s*display:\s*contents;/m)
    expect(src).toMatch(/^\+const systemOpen = ref\(/m)
  })
})
