// overlay/custom/client/loop/__tests__/appsidebar-loop-entry.test.ts
// 守门：主侧边栏（上游 AppSidebar.vue，经 patch 246 注入）必须有循环工程图
// 一级菜单入口。
//
// 背景：Loop 的侧边栏导航条目原为 patch 133，v0.7.12 上游侧栏重构后锚点消失
// 被摘除，此后 /hermes/loop 仅剩 cockpit 顶栏 "Swarm Studio" 字样入口
// （cockpit-topbar-loop-entry.test.ts 守门）。本测试守住恢复的一级菜单入口。
//
// 断言对象是注入态上游文件（与 matrix-login-session.test.ts 同模式）：
// 测试跑在 inject 之后，patch 丢失/漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 自本文件 5 级到 ncwk 根，再进 upstream/hermes-studio。
const UPSTREAM_CLIENT = '../../../../../upstream/hermes-studio/packages/client/src'

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, `${UPSTREAM_CLIENT}/${rel}`), 'utf8')
}

describe('AppSidebar 循环工程图一级入口（patch 246 守门）', () => {
  const src = readUpstream('components/layout/AppSidebar.vue')

  it('存在 overlay[loop] RouteLinkItem，导航目标为 hermes.loop', () => {
    expect(src).toContain('overlay[loop]')
    expect(src).toContain(`:to="{ name: 'hermes.loop' }"`)
  })

  it('整个 hermes.loop* 路由家族高亮（isLoopArea computed）', () => {
    expect(src).toMatch(
      /const isLoopArea = computed\(\(\) => String\(route\.name \?\? ""\)\.startsWith\("hermes\.loop"\)\)/,
    )
    expect(src).toContain(':active="isLoopArea"')
  })

  it('标签使用 sidebar.loopGraph（i18n 键，zh/en 均须存在）', () => {
    expect(src).toContain('t("sidebar.loopGraph")')
    const zh = readUpstream('i18n/locales/zh.ts')
    const en = readUpstream('i18n/locales/en.ts')
    expect(zh).toMatch(/loopGraph:\s*'循环工程图'/)
    expect(en).toMatch(/loopGraph:\s*'Loop Graph'/)
  })

  it('与 cockpit 入口并列（入口位于 cockpit 块之后、hermes.logs 之前）', () => {
    const cockpitIdx = src.indexOf(`:to="{ name: 'hermes.cockpit' }"`)
    const loopIdx = src.indexOf(`:to="{ name: 'hermes.loop' }"`)
    const logsIdx = src.indexOf(`:to="{ name: 'hermes.logs' }"`)
    expect(cockpitIdx).toBeGreaterThan(-1)
    expect(loopIdx).toBeGreaterThan(cockpitIdx)
    expect(logsIdx).toBeGreaterThan(loopIdx)
  })

  it('顶栏 "Swarm Studio" 字样已改指总览页——Loop 入口唯一事实源=本菜单项', () => {
    const topbar = readFileSync(
      resolve(__dirname, '../../cockpit/components/CockpitTopBar.vue'),
      'utf8',
    )
    // 2026-09-14 用户指定：顶栏字样改指 ia2.overview，不再承担 loop 入口
    expect(topbar).toContain(`router.push({ name: 'ia2.overview' })`)
    expect(topbar).not.toContain(`router.push({ name: 'hermes.loop' })`)
  })
})
