// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-settings-sidebar.test.ts
// 设置页侧栏守门（2026-09-30 用户裁定：注意力条下方 + 原三侧栏功能面恢复）：
// 双入口 + 工具/Hermes/系统三组全量渲染；hasRoute 门控（退役/桌面专属路由
// 自动隐——浏览器 dev 无 hermes.browser）；superadmin 项随权限显隐；
// 版本预览随 VITE_HERMES_PREVIEW。i18n 沿全局 setup mock（t 直返 key）。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const routerState = vi.hoisted(() => ({ hasRouteNames: new Set<string>([
  'ia2.collab', 'ide.shell', 'hermes.models', 'hermes.workflow', 'hermes.connections',
  'hermes.files', 'hermes.agentManager', 'hermes.skills', 'hermes.plugins', 'hermes.mcp',
  'hermes.memory', 'hermes.channels', 'hermes.jobs', 'hermes.kanban', 'hermes.journey',
  'hermes.settings', 'hermes.profiles', 'hermes.theme', 'hermes.petdex',
  'hermes.skillsUsage', 'hermes.logs', 'hermes.usage', 'hermes.performance',
  // hermes.browser 桌面专属：dev 不注册 → 应隐藏
  'hermes.versionPreview',
]) }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ hasRoute: (name: string) => routerState.hasRouteNames.has(name), push: vi.fn() }),
}))
const authState = vi.hoisted(() => ({ isSuperAdmin: true as boolean | null }))
vi.mock('@/stores/hermes/auth', () => ({ useAuthStore: () => ({ get isSuperAdmin() { return authState.isSuperAdmin } }) }))
vi.mock('@/api/client', () => ({ isStoredSuperAdmin: () => false }))

import IaSettingsSidebar from '../components/IaSettingsSidebar.vue'

function mountSidebar() {
  return mount(IaSettingsSidebar, {
    global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
  })
}

describe('IaSettingsSidebar — 设置页侧栏（功能面恢复）', () => {
  it('双入口 + 三组全量：工具/Hermes/系统（superadmin 态全显）', () => {
    authState.isSuperAdmin = true
    const w = mountSidebar()
    const text = w.text()
    // 双入口
    expect(text).toContain('ia2.brand')
    expect(text).toContain('sidebar.ideWorkspace')
    // 工具组（原 PageSidebarNav 面）
    for (const key of ['sidebar.models', 'sidebar.workflow', 'sidebar.connections', 'sidebar.files']) {
      expect(text, `工具组缺 ${key}`).toContain(key)
    }
    // Hermes 组（原 HermesConfigSidebar 面）
    for (const key of ['sidebar.agentManager', 'sidebar.skills', 'sidebar.plugins', 'sidebar.mcp', 'sidebar.memory', 'sidebar.channels', 'sidebar.jobs', 'sidebar.kanban', 'sidebar.journey']) {
      expect(text, `Hermes 组缺 ${key}`).toContain(key)
    }
    // 系统组（原 AppSidebar 系统组全集——收缩批摘除项恢复）
    for (const key of ['sidebar.settings', 'sidebar.profiles', 'sidebar.theme', 'sidebar.petdex', 'sidebar.skillsUsage', 'sidebar.logs', 'sidebar.usage', 'sidebar.performance']) {
      expect(text, `系统组缺 ${key}`).toContain(key)
    }
    // 分组标签（既有词表键，零新增 i18n）
    expect(text).toContain('sidebar.groupTools')
    expect(text).toContain('sidebar.groupSystem')
    w.unmount()
  })

  it('hasRoute 门控：桌面专属 hermes.browser（dev 未注册）自动隐', () => {
    authState.isSuperAdmin = true
    const w = mountSidebar()
    expect(w.text()).not.toContain('sidebar.browser')
    w.unmount()
  })

  it('版本预览随 VITE_HERMES_PREVIEW 门控（默认关）', () => {
    authState.isSuperAdmin = true
    const w = mountSidebar()
    expect(w.text()).not.toContain('sidebar.versionPreview')
    w.unmount()
  })

  it('superadmin 项随权限显隐：非管理员隐 profiles/performance/agentManager', () => {
    authState.isSuperAdmin = false
    const w = mountSidebar()
    expect(w.text()).not.toContain('sidebar.profiles')
    expect(w.text()).not.toContain('sidebar.performance')
    expect(w.text()).not.toContain('sidebar.agentManager')
    // 普通条目不受影响
    expect(w.text()).toContain('sidebar.settings')
    expect(w.text()).toContain('sidebar.skills')
    w.unmount()
  })
})
