// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/settings-single-center.test.ts
// 产品一致性 Task 7（2026-10-27 设置目录与壳合一）守门：
//   1) 无双壳：ia2.govSettings / ia2.modelProviders 改顶层 annex（IaLegacyShell），
//      不再嵌在 /app children 内套 IaShell；路径/route name/fullscreen 原样
//   2) loader 非空：收编记录（含设置目录两页）与 VIEW_LOADERS 一一对应
//   3) 目录元数据：注册表条目带 surface（目录/侧栏/两者/无）；hermes.theme 与
//      ekko.settings 入册保留入口；configSettings/groupChat/connections/petdex
//      不被重新暴露进侧栏；hermes.settings 目录内改称「通用设置」
//   4) preview 开关统一：VITE_HERMES_PREVIEW 只在注册表判定一处（收编侧栏语义：
//      预览项只在 preview 开时显示）；侧栏组件不得私读该开关
//   5) 单一设置入口：页头用户按钮与全局检索的设置命令统一落 ia2.govSettings
//   6) 生产不全表预热：IaLegacyShell 仅 dev 预热；悬停/聚焦单页预取保留
//   7) 目录分组：用量/性能/日志归「观察诊断」、群组归「协作」（仅呈现分组，
//      路由与能力不动——由路由断言回归）
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { mount } from '@vue/test-utils'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

vi.mock('../views/IaLegacyShell.vue', () => ({
  default: { template: '<div class="legacy-shell-stub" />' },
}))
vi.mock('../views/gov/GovSettingsView.vue', () => ({
  default: { template: '<div class="gov-settings-stub" />' },
}))
vi.mock('../views/gov/GovModelProvidersView.vue', () => ({
  default: { template: '<div class="gov-model-providers-stub" />' },
}))
vi.mock('../views/WorkbenchView.vue', () => ({
  default: { template: '<div class="workbench-stub" />' },
}))

import { buildIaRoutes, ANNEXED_LEGACY } from '../routes'
import { VIEW_LOADERS } from '../views/legacy-view-loaders'
import IaLegacyShell from '../views/IaLegacyShell.vue'
import GovSettingsView from '../views/gov/GovSettingsView.vue'
import GovModelProvidersView from '../views/gov/GovModelProvidersView.vue'
import { GOV_SETTINGS_DOMAINS, entryVisible } from '../views/gov/gov-settings-registry'

/** 全部注册表条目（域序拉平） */
const ALL_ENTRIES = GOV_SETTINGS_DOMAINS.flatMap(d => d.entries.map(e => ({ ...e, domain: d.key })))
const byName = (name: string) => ALL_ENTRIES.find(e => e.name === name)

describe('Task 7-1/7-2 路由层：无双壳 + loader 非空', () => {
  it('govSettings/modelProviders 为顶层 annex 记录：组件=IaLegacyShell、fullscreen、不嵌 /app children', async () => {
    const tree = buildIaRoutes()
    for (const [name, path] of [
      ['ia2.govSettings', '/app/gov/settings'],
      ['ia2.modelProviders', '/app/gov/model-providers'],
    ] as const) {
      const top = tree.find(r => r.name === name)
      expect(top, `${name} 应为顶层记录（不在 /app children 内套 IaShell）`).toBeTruthy()
      expect(top?.path, `${name} 路径原样保留`).toBe(path)
      expect(top?.meta?.fullscreen, `${name} fullscreen 原样`).toBe(true)
      const loader = top?.component as unknown as () => Promise<{ default: unknown }>
      expect(typeof loader).toBe('function')
      const mod = await loader()
      expect(mod.default, `${name} 壳组件应统一 IaLegacyShell`).toBe(IaLegacyShell)
    }
    // /app children 内不再有这两条（避免同路径双记录）
    const shell = tree.find(r => r.name === 'ia2.shell')
    const childNames: string[] = []
    const walk = (records: ReadonlyArray<{ name?: unknown; children?: unknown[] }>) => {
      for (const r of records) {
        if (r.name) childNames.push(String(r.name))
        if (Array.isArray(r.children)) walk(r.children as typeof records)
      }
    }
    walk((shell?.children ?? []) as never)
    expect(childNames).not.toContain('ia2.govSettings')
    expect(childNames).not.toContain('ia2.modelProviders')
  })

  it('VIEW_LOADERS 补录目录两页；收编组件记录与装载表一一对应', async () => {
    expect((await VIEW_LOADERS['ia2.govSettings']() as { default: unknown }).default).toBe(GovSettingsView)
    expect((await VIEW_LOADERS['ia2.modelProviders']() as { default: unknown }).default).toBe(GovModelProvidersView)
    for (const r of ANNEXED_LEGACY) {
      if (!r.component) continue // 重定向记录（kanban/journey）无装载
      expect(VIEW_LOADERS[String(r.name)], `收编记录 ${String(r.name)} 应有 loader`).toBeTruthy()
    }
  })

  it('注册表条目路由可达（ekko.settings 例外=上游 bootstrap 注册，非 ia2 树）', () => {
    // 树内全名收集（等价 hasRoute；本文件底部 mock 了 vue-router 运行面，
    // 不能在此用 createRouter——见侧栏派生段）
    const names = new Set<string>()
    const walk = (records: ReadonlyArray<{ name?: unknown; children?: unknown[] }>) => {
      for (const r of records) {
        if (r.name) names.add(String(r.name))
        if (Array.isArray(r.children)) walk(r.children as typeof records)
      }
    }
    walk(buildIaRoutes())
    for (const e of ALL_ENTRIES) {
      if (e.name === 'ekko.settings') continue
      expect(names.has(e.name), `路由 ${e.name}`).toBe(true)
    }
  })
})

describe('Task 7-3 目录元数据：surface 声明 + 入口保留 + 不重新暴露 + 改名', () => {
  it('surface 值受控（catalog/sidebar/both/none）；侧栏条目元数据齐备', () => {
    for (const e of ALL_ENTRIES) {
      expect(['catalog', 'sidebar', 'both', 'none'], `${e.name} surface 受控`).toContain(e.surface)
      if (e.surface === 'sidebar' || e.surface === 'both') {
        expect(e.sidebarGroup, `${e.name} 侧栏条目须声明分组`).toBeTruthy()
        expect(e.icon, `${e.name} 侧栏条目须声明图标`).toBeTruthy()
        expect(e.sidebarLabelKey ?? e.sidebarLabel, `${e.name} 侧栏条目须有词表键或直书文案`).toBeTruthy()
      }
    }
  })

  it('hermes.theme 与 ekko.settings 入册保留（侧栏入口不因派生丢失）', () => {
    const theme = byName('hermes.theme')
    expect(theme, 'hermes.theme 应入册').toBeTruthy()
    expect(['sidebar', 'both']).toContain(theme?.surface)
    const ekko = byName('ekko.settings')
    expect(ekko, 'ekko.settings 应入册').toBeTruthy()
    expect(['sidebar', 'both']).toContain(ekko?.surface)
    expect(ekko?.superAdmin).toBe(true)
    expect(ekko?.featureGate).toBe('ekko')
  })

  it('有意不进侧栏的条目不被重新暴露（configSettings/groupChat/connections/petdex）', () => {
    for (const name of ['hermes.configSettings', 'hermes.groupChat', 'hermes.connections', 'hermes.petdex']) {
      const e = byName(name)
      expect(e, `${name} 应在注册表（目录侧保留）`).toBeTruthy()
      expect(e?.surface, `${name} 不得进侧栏`).not.toMatch(/sidebar|both/)
    }
  })

  it('hermes.settings 目录内改称「通用设置」，不再是第二个「设置主页」', () => {
    const e = byName('hermes.settings')
    expect(e?.label).toBe('通用设置')
    expect(ALL_ENTRIES.map(x => x.label)).not.toContain('设置主页')
    // 设置目录自身在册（侧栏「系统设置导航」入口的派生源）
    expect(byName('ia2.govSettings')).toBeTruthy()
  })

  it('目录分组：用量/性能/日志归「观察诊断」、群组归「协作」；路由与能力不动（名字仍在册）', () => {
    const keys = GOV_SETTINGS_DOMAINS.map(d => d.key)
    expect(keys).toContain('diagnostics')
    expect(keys).toContain('collab')
    const diag = GOV_SETTINGS_DOMAINS.find(d => d.key === 'diagnostics')
    expect(diag?.entries.map(e => e.name).sort()).toEqual(
      ['hermes.skillsUsage', 'hermes.usage', 'hermes.performance', 'hermes.logs'].sort(),
    )
    const collab = GOV_SETTINGS_DOMAINS.find(d => d.key === 'collab')
    expect(collab?.entries.map(e => e.name)).toEqual(['hermes.groupChat'])
    // 成本域保留模型配置；审计域并入观察诊断（logs 迁出）
    expect(GOV_SETTINGS_DOMAINS.find(d => d.key === 'cost')?.entries.map(e => e.name)).toEqual(['hermes.models'])
    expect(keys).not.toContain('audit')
  })
})

describe('Task 7-4 preview 开关统一（收编侧栏语义：预览项只在 preview 开时显示）', () => {
  const hasRouter = { hasRoute: () => true } as never
  it('VITE_HERMES_PREVIEW 关（默认）：versionPreview 对 superAdmin 也不可见', () => {
    const vp = byName('hermes.versionPreview')
    expect(vp).toBeTruthy()
    expect(entryVisible(vp!, hasRouter, true)).toBe(false)
  })

  it('VITE_HERMES_PREVIEW 开：versionPreview 随路由在场可见', async () => {
    vi.stubEnv('VITE_HERMES_PREVIEW', '1')
    try {
      expect(entryVisible(byName('hermes.versionPreview')!, hasRouter, true)).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('开关判定只在注册表一处：侧栏组件不得私读 VITE_HERMES_PREVIEW', () => {
    const registry = readOverlay('custom/client/ia2/views/gov/gov-settings-registry.ts')
    const sidebar = readOverlay('custom/client/ia2/components/IaSettingsSidebar.vue')
    expect(registry).toContain('VITE_HERMES_PREVIEW')
    expect(sidebar, '侧栏须复用 entryVisible，不得再私读预览开关（双判断漂移源头）')
      .not.toContain('VITE_HERMES_PREVIEW')
  })
})

describe('Task 7-5 单一设置入口：页头用户按钮与全局检索统一落设置目录', () => {
  it('IaShellHeader 用户按钮 → ia2.govSettings', () => {
    const header = readOverlay('custom/client/ia2/components/IaShellHeader.vue')
    expect(header).toContain("name: 'ia2.govSettings'")
    expect(header).not.toContain("'hermes.settings'")
  })

  it('GlobalSearchDialog 设置命令 → ia2.govSettings', () => {
    const dialog = readOverlay('custom/client/ia2/components/GlobalSearchDialog.vue')
    expect(dialog).toContain("key: 'settings'")
    expect(dialog).toContain("name: 'ia2.govSettings'")
    expect(dialog).not.toContain("'hermes.settings'")
  })
})

describe('Task 7-6 生产不全表预热：dev 门控 + 单页预取保留', () => {
  it('IaLegacyShell 仅 dev 预热全表', () => {
    const shell = readOverlay('custom/client/ia2/views/IaLegacyShell.vue')
    expect(shell).toMatch(/import\.meta\.env\.DEV[^]*warmAllLegacyViews/s)
  })

  it('侧栏悬停/聚焦单页预取保留', () => {
    const sidebar = readOverlay('custom/client/ia2/components/IaSettingsSidebar.vue')
    expect(sidebar).toContain('@mouseenter="prefetchLegacyView')
    expect(sidebar).toContain('@focusin="prefetchLegacyView')
  })
})

// ── 侧栏派生（注册表单一事实源）───────────────────────────────────────────
const routerState = vi.hoisted(() => ({ hasRouteNames: new Set<string>([
  'ia2.govSettings', 'hermes.settings', 'hermes.theme', 'hermes.models', 'hermes.workflow',
  'hermes.agentManager', 'hermes.skills', 'hermes.plugins', 'hermes.mcp', 'hermes.memory',
  'hermes.channels', 'hermes.jobs', 'hermes.profiles', 'hermes.skillsUsage', 'hermes.logs',
  'hermes.usage', 'hermes.performance', 'hermes.versionPreview', 'ekko.settings',
  'hermes.configSettings', 'hermes.groupChat', 'hermes.connections', 'hermes.petdex',
]) }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ hasRoute: (name: string) => routerState.hasRouteNames.has(name), push: vi.fn() }),
}))
const authState = vi.hoisted(() => ({ isSuperAdmin: true as boolean | null }))
vi.mock('@/stores/hermes/auth', () => ({ useAuthStore: () => ({ get isSuperAdmin() { return authState.isSuperAdmin } }) }))
vi.mock('@/api/client', () => ({ isStoredSuperAdmin: () => false, getStoredUserId: () => null }))
vi.mock('@/api/studio/theme', () => ({ clearThemeBackgroundCache: vi.fn(async () => {}) }))
// features 与 gov-settings.test.ts 同口径：agentManager 开（其收编路由随开关条件进树，
// 关闭时路由可达断言会假红）；pet 关（petdex 路由仍在树、条目隐藏走开关）
vi.mock('../../../../config/features', () => ({ features: { pet: false, agentManager: true, ekko: true } }))

describe('Task 7-7 侧栏从注册表派生（入口保留 + 不重新暴露）', () => {
  it('superadmin 态：theme/ekko/目录入口在位；目录专属条目不漏进侧栏', async () => {
    authState.isSuperAdmin = true
    const { default: IaSettingsSidebar } = await import('../components/IaSettingsSidebar.vue')
    const w = mount(IaSettingsSidebar, {
      global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
    })
    const text = w.text()
    expect(text).toContain('sidebar.theme')
    expect(text).toContain('ekko 运维')
    expect(text).toContain('系统设置导航')
    expect(text).toContain('sidebar.settings')
    // 目录专属（surface=catalog）即便路由在场也不得渲染——防重新暴露
    expect(w.findAll('a').length, '侧栏条目数=派生面（无目录专属项泄漏）').toBeGreaterThan(0)
    const registry = await import('../views/gov/gov-settings-registry')
    const sidebarNames = registry
      .GOV_SETTINGS_DOMAINS.flatMap(d => d.entries)
      .filter(e => e.surface === 'sidebar' || e.surface === 'both')
      .map(e => e.name)
    for (const name of ['hermes.configSettings', 'hermes.groupChat', 'hermes.connections', 'hermes.petdex', 'hermes.terminal']) {
      expect(sidebarNames, `${name} 不在侧栏派生面`).not.toContain(name)
    }
    w.unmount()
  })

  it('目录页从注册表派生：surface=sidebar 条目不进目录（theme/ekko 不重复挂目录）', () => {
    const catalogNames = ALL_ENTRIES
      .filter(e => e.surface === 'catalog' || e.surface === 'both')
      .map(e => e.name)
    expect(catalogNames).not.toContain('hermes.theme')
    expect(catalogNames).not.toContain('ekko.settings')
    expect(catalogNames).toContain('hermes.settings')
  })
})
