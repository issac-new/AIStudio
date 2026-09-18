// overlay/custom/client/ide/__tests__/appsidebar-ide-entry.test.ts
// 守门：主侧边栏（上游 AppSidebar.vue，经 patch 278 注入）必须有 IDE 工作台
// 一级入口，且位于顶部（工作台 ia2 之前——IDE 为操作主页面）。
//
// 断言对象是注入态上游文件（与 appsidebar-loop-entry.test.ts 同模式）：
// 测试跑在 inject 之后，patch 丢失/漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 自本文件 5 级到 ncwk 根（worktree 内经 feat/upstream 符号链接同构解析），
// 再进 upstream/hermes-studio。
const UPSTREAM_CLIENT = '../../../../../upstream/hermes-studio/packages/client/src'

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, `${UPSTREAM_CLIENT}/${rel}`), 'utf8')
}

describe('AppSidebar IDE 工作台一级入口（patch 278 守门）', () => {
  const src = readUpstream('components/layout/AppSidebar.vue')

  it('存在 overlay[ide] RouteLinkItem，导航目标为 ide.shell', () => {
    expect(src).toContain('overlay[ide]')
    expect(src).toContain(`:to="{ name: 'ide.shell' }"`)
  })

  it('ide.* 路由家族高亮（isIdeArea computed）', () => {
    expect(src).toMatch(
      /const isIdeArea = computed\(\(\) => String\(route\.name \?\? ""\)\.startsWith\("ide\."\)\)/,
    )
    expect(src).toContain(':active="isIdeArea"')
  })

  it('标签使用 sidebar.ideWorkspace（i18n 键，zh/en 均须存在）', () => {
    expect(src).toContain('t("sidebar.ideWorkspace")')
    const zh = readUpstream('i18n/locales/zh.ts')
    const en = readUpstream('i18n/locales/en.ts')
    expect(zh).toMatch(/ideWorkspace:\s*'IDE 工作台'/)
    expect(en).toMatch(/ideWorkspace:\s*'IDE Workspace'/)
  })

  it('入口位于顶部：ide < 工作台(ia2) < 循环工程图(loop) < logs（AI协作中心入口随 cockpit 退役，Task 6 从上游侧栏移除）', () => {
    const ideIdx = src.indexOf(`:to="{ name: 'ide.shell' }"`)
    const ia2Idx = src.indexOf(`:to="{ name: 'ia2.overview' }"`)
    const loopIdx = src.indexOf(`:to="{ name: 'hermes.loop' }"`)
    const logsIdx = src.indexOf(`:to="{ name: 'hermes.logs' }"`)
    expect(ideIdx).toBeGreaterThan(-1)
    expect(ia2Idx).toBeGreaterThan(ideIdx)
    expect(loopIdx).toBeGreaterThan(ia2Idx)
    expect(logsIdx).toBeGreaterThan(loopIdx)
  })
})
