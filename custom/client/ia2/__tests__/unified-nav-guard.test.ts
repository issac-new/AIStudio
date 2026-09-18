// overlay/custom/client/ia2/__tests__/unified-nav-guard.test.ts
// 统一导航总守门（2026-09-18 收口）：六场景单一事实源、旧路由名零残留、
// catch-all 兜底、双壳互跳键、窗口管理挂载。patch/路由漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { IA_AREAS, buildIaRoutes, areaForPath } from '../routes'

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
]

describe('统一导航守门（六场景双壳）', () => {
  it('IA_AREAS 六场景与 buildIaRoutes 产物一一对应（路径可达）', () => {
    const routes = buildIaRoutes()
    const flat = JSON.stringify(routes)
    for (const area of IA_AREAS) {
      expect(routes.some(r => r.path === '/app')).toBe(true)
      expect(flat).toContain(`"name":"${area.name}"`)
    }
    expect(IA_AREAS.map(a => a.key)).toEqual(
      ['overview', 'collab', 'eng', 'ops', 'tasks', 'comms'],
    )
  })

  it('areaForPath：六场景全覆盖 + 未知 /app 子路径回退总览 + 非 /app 返回 null', () => {
    for (const area of IA_AREAS) expect(areaForPath(area.path)).toBe(area.key)
    expect(areaForPath('/app/ops/runs/r-1')).toBe('ops')
    expect(areaForPath('/app/unknown-deep')).toBe('overview')
    expect(areaForPath('/ide')).toBeNull()
    expect(areaForPath('/hermes/logs')).toBeNull()
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

  it('双壳互跳：ide.links.cockpitHome / ia2.shell.gotoIde 键 zh/en 双侧存在', () => {
    const zh = readUpstream('i18n/locales/zh.ts')
    const en = readUpstream('i18n/locales/en.ts')
    for (const locale of [zh, en]) {
      expect(locale).toMatch(/cockpitHome:/)
      expect(locale).toMatch(/gotoIde:/)
      // 六场景词表键齐
      for (const key of ['collab', 'eng', 'ops']) {
        expect(locale).toMatch(new RegExp(`^\\s+${key}:`, 'm'))
      }
    }
  })

  it('窗口管理守门：页头窗控簇挂载 + 独立窗口/最大化/最小化三态语义', () => {
    const header = readFileSync(
      resolve(__dirname, '../components/IaShellHeader.vue'),
      'utf8',
    )
    const shell = readFileSync(resolve(__dirname, '../views/IaShell.vue'), 'utf8')
    expect(header).toContain('<IaWindowControls />')
    // standalone 精简壳 / max 隐藏壳页 + Esc / 最小化 dock / 合并回流监听
    expect(shell).toContain('IaPopoutBar v-if="isStandalone"')
    expect(shell).toContain('v-if="!isMaximized"')
    expect(shell).toContain("event.key === 'Escape'")
    expect(shell).toContain('<IaMinimizedDock')
    expect(shell).toContain('listenMergeBack')
  })

  it('上游 AppSidebar：一级仅 双入口+系统分组，无旧返回 hack（patch 299 守门）', () => {
    const sidebar = readUpstream('components/layout/AppSidebar.vue')
    expect(sidebar).toContain(`:to="{ name: 'ide.shell' }"`)
    expect(sidebar).toContain(`:to="{ name: 'ia2.overview' }"`)
    expect(sidebar).toContain('sidebar-system-toggle')
    expect(sidebar).not.toContain(`:to="{ name: 'hermes.cockpit' }"`)
    expect(sidebar).not.toContain(`:to="{ name: 'hermes.loop' }"`)
  })
})
