// overlay/custom/client/ia2/__tests__/unified-nav-guard.test.ts
// v12 统一视图总守门（2026-09-19）：双视图单一事实源（/app collab + IDE 直链）、
// 旧深链迁移表实走、退役路由名零残留、catch-all 兜底、双壳互跳键、
// 窗口管理挂载。patch/路由漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createRouter, createMemoryHistory } from 'vue-router'
import { IA_AREAS, buildIaRoutes, areaForPath, IA_LEGACY_REDIRECTS } from '../routes'

// 自本文件 5 级到 ncwk 根（overlay/custom/client/ia2/__tests__），再进 upstream/hermes-studio
const UPSTREAM_CLIENT = '../../../../../upstream/hermes-studio/packages/client/src'

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, `${UPSTREAM_CLIENT}/${rel}`), 'utf8')
}

const RETIRED_NAMES = [
  'hermes.loop', 'hermes.loopRuns', 'hermes.loopRunDetail', 'hermes.loopDetail',
  'hermes.cockpit', 'hermes.chat', 'hermes.session', 'hermes.history',
  'hermes.globalAgent', 'hermes.globalAgentSession', 'hermes.swarmKanban',
  'hermes.matrixChat', 'hermes.matrixChatRoom',
  // v12 六场景退役名（2026-09-19）：overview/ops/tasks/comms 零残留
  'ia2.overview', 'ia2.ops', 'ia2.tasks', 'ia2.comms',
]

describe('v12 统一视图守门（双视图）', () => {
  it('IA_AREAS 单场景 collab 与 buildIaRoutes 产物一一对应', () => {
    const routes = buildIaRoutes()
    const flat = JSON.stringify(routes)
    for (const area of IA_AREAS) {
      expect(routes.some(r => r.path === '/app')).toBe(true)
      expect(flat).toContain(`"name":"${area.name}"`)
    }
    expect(IA_AREAS.map(a => a.key)).toEqual(['collab'])
  })

  it('areaForPath：/app 家族全投影 collab + 非 /app 返回 null', () => {
    for (const area of IA_AREAS) expect(areaForPath(area.path)).toBe(area.key)
    expect(areaForPath('/app/board')).toBe('collab')
    expect(areaForPath('/app/runs/run-1')).toBe('collab')
    expect(areaForPath('/app/eng')).toBe('collab')
    expect(areaForPath('/app/s/room/x')).toBe('collab')
    expect(areaForPath('/app/unknown-deep')).toBe('collab')
    expect(areaForPath('/ide')).toBeNull()
    expect(areaForPath('/hermes/logs')).toBeNull()
  })

  it('旧深链迁移表实走重定向（query 语义不丢关键路径）', async () => {
    // push 会解析目标记录的懒组件——替换为桩，避免拉起 RunCenterView/HistoryView
    // 等重型视图的导入链（其内 upstream api/client 顶层 createWebHashHistory 在
    // node 环境无 location 即炸；本守门只验重定向本身）
    const Stub = { template: '<div />' }
    const stubComponents = (records: ReturnType<typeof buildIaRoutes>): ReturnType<typeof buildIaRoutes> =>
      records.map(r => {
        const copy: Record<string, unknown> = { ...r }
        if (copy.component) copy.component = Stub
        if (Array.isArray(copy.children)) copy.children = stubComponents(copy.children as ReturnType<typeof buildIaRoutes>)
        return copy as unknown as ReturnType<typeof buildIaRoutes>[number]
      })
    const router = createRouter({ history: createMemoryHistory(), routes: stubComponents(buildIaRoutes()) })
    // 参数占位 → 具体样例（表驱动单一来源：迁移表本身）
    const sample = (p: string): string => p
      .replace(':runId', 'run-9')
      .replace(':roomId', '!x:host')
      .replaceAll(':sessionId', 's1')
    const cases = IA_LEGACY_REDIRECTS.map(({ from, to }) => [sample(from), sample(to)] as [string, string])
    for (const [from, to] of cases) {
      await router.push(from)
      expect(router.currentRoute.value.fullPath, `${from} 应重定向到 ${to}`)
        .toBe(to)
    }
  })

  it('退役路由名在 ia2 路由产物与注入态上游 router 中零出现', () => {
    const flat = JSON.stringify(buildIaRoutes())
    const router = readUpstream('router/index.ts')
    for (const name of RETIRED_NAMES) {
      expect(flat, `ia2 routes 不应含 ${name}`).not.toContain(`"${name}"`)
      expect(router, `上游 router 不应含 name: '${name}'`).not.toContain(`name: '${name}'`)
    }
    // 旧路径别名与 cockpit 子树零残留
    expect(router).not.toContain(`path: '/hermes/cockpit'`)
    expect(router).not.toContain(`path: '/hermes/chat'`)
    expect(router).not.toContain(`path: '/hermes/loop'`)
  })

  it('catch-all 兜底 → /app（旧深链不白屏）', () => {
    const router = readUpstream('router/index.ts')
    expect(router).toContain(`{ path: '/:pathMatch(.*)*', redirect: '/app' }`)
  })

  it('双壳互跳：ide.links.cockpitHome / ia2.shell.gotoIde / sidebar.systemGroup 键 zh/en 双侧存在', () => {
    const zh = readUpstream('i18n/locales/zh.ts')
    const en = readUpstream('i18n/locales/en.ts')
    for (const locale of [zh, en]) {
      expect(locale).toMatch(/cockpitHome:/)
      expect(locale).toMatch(/gotoIde:/)
      // AppSidebar 分组头消费；en 侧缺键曾致非中文语言渲染裸键名（2026-09-18 修复）
      expect(locale).toMatch(/^\s+systemGroup:/m)
      // 双视图场景词表键齐
      expect(locale).toMatch(/^\s+collab:/m)
    }
  })

  it('窗口管理守门：页头窗控簇挂载 + 独立窗口精简壳 + v12.3 max/dock 链路退役', () => {
    const header = readFileSync(
      resolve(__dirname, '../components/IaShellHeader.vue'),
      'utf8',
    )
    const shell = readFileSync(resolve(__dirname, '../views/IaShell.vue'), 'utf8')
    const ideShell = readFileSync(resolve(__dirname, '../../ide/views/IdeShell.vue'), 'utf8')
    const switcher = readFileSync(resolve(__dirname, '../components/IaViewSwitcher.vue'), 'utf8')
    expect(header).toContain('<IaWindowControls />')
    // standalone 精简壳 / Esc 收管理台 / 合并回流监听；
    // v12.3 窗控改三栏栏控——页级 max=1 最大化与最小化 dock 链路退役（守门防回潮）
    expect(shell).toContain('IaPopoutBar v-if="isStandalone"')
    expect(shell).toContain('<IaGlobalTop v-else />')
    expect(shell).toContain("event.key === 'Escape'")
    expect(shell).not.toContain('<IaMinimizedDock')
    expect(shell).not.toContain('isMaximized')
    expect(shell).not.toContain('ia-wm-restore-pill')
    expect(shell).toContain('listenMergeBack')
    // v12.2 全局顶区常驻双视图（用户裁定）：双壳均挂 IaGlobalTop；切换器嵌
    // 页头最右（IaShellHeader 内嵌 IaViewSwitcher，顶部右上角单入口），
    // 双入口 testid 保持守门兼容；全局顶区不再挂独立切换行
    expect(shell).toContain('<IaGlobalTop')
    expect(ideShell).toContain('<IaGlobalTop')
    expect(header).toContain('<IaViewSwitcher')
    expect(switcher).toContain('data-testid="ia-viewswitch-row"')
    expect(switcher).toContain('data-testid="ia-scene-collab"')
    expect(switcher).toContain('data-testid="ia-scene-ide"')
    expect(switcher).toContain(`:to="{ name: 'ia2.collab' }"`)
    expect(switcher).toContain(`:to="{ name: 'ide.shell' }"`)
  })

  it('上游 AppSidebar：一级仅 双入口+系统分组，无旧返回 hack（patch 299 守门）', () => {
    const sidebar = readUpstream('components/layout/AppSidebar.vue')
    expect(sidebar).toContain(`:to="{ name: 'ide.shell' }"`)
    expect(sidebar).toContain(`:to="{ name: 'ia2.collab' }"`)
    expect(sidebar).toContain('sidebar-system-toggle')
    expect(sidebar).not.toContain(`:to="{ name: 'hermes.cockpit' }"`)
    expect(sidebar).not.toContain(`:to="{ name: 'hermes.loop' }"`)
    expect(sidebar).not.toContain(`ia2.overview`)
  })
})
