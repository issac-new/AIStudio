// overlay/custom/client/__tests__/s2-hermes-config-retire.test.ts
// S2（补遗⑤ §13.4 C 档）守门：HermesConfigSidebar 九运维页路由退役（patch 513）。
// 源码级断言（脱离共享注入树）：patch 在 series、九路由记录零残留（新增态）、
// 两处消费点 hasRoute 守卫就位；视图组件文件不动（摘面不摘库）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../..')

function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

const NINE = [
  '/hermes/jobs', '/hermes/kanban', '/hermes/journey', '/hermes/skills',
  '/hermes/plugins', '/hermes/memory', '/hermes/config/settings',
  '/hermes/channels', '/hermes/mcp',
] as const

describe('S2 运维页族路由退役（patch 513）', () => {
  const patch = readOverlay('patches/521-client-router-hermes-config-retire.patch')

  it('series 已登记 513', () => {
    expect(readOverlay('patches/series')).toContain('521-client-router-hermes-config-retire.patch')
  })

  it('九路由记录整族移除（patch 中各 path 均为移除行，无新增态残留）', () => {
    for (const path of NINE) {
      // 移除行：`-      path: '<path>',`
      expect(patch).toContain(`-      path: '${path}',`)
      // 新增态零残留（不得把路由记录加回来）
      expect(patch).not.toContain(`+      path: '${path}',`)
    }
    // C 档注释标记（superadmin 恢复指引）
    expect(patch).toContain('overlay[s2]')
  })

  it('组件/视图文件不动（摘面不摘库）', () => {
    // patch 只碰 router/index.ts、useKeyboard.ts、AgentManagerView.vue 三文件
    const files = patch.match(/^diff --git a\/(.+) b\/\1$/gm) ?? []
    expect(files.sort()).toEqual([
      'diff --git a/packages/client/src/composables/useKeyboard.ts b/packages/client/src/composables/useKeyboard.ts',
      'diff --git a/packages/client/src/router/index.ts b/packages/client/src/router/index.ts',
      'diff --git a/packages/client/src/views/hermes/AgentManagerView.vue b/packages/client/src/views/hermes/AgentManagerView.vue',
    ].sort())
    // 九个 View 组件 import 行只删不增（视图本体在上游仓库，不受影响）
    expect(patch).not.toMatch(/^\+.*import\('@/m)
  })

  it('两处消费点 hasRoute 守卫（⌘J 快捷键 / AgentManager 设置按钮）', () => {
    expect(patch).toContain("router.hasRoute('hermes.jobs')")
    expect(patch).toContain("router.hasRoute('hermes.configSettings')")
  })
})
