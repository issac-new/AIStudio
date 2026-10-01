// overlay/custom/client/ia2/__tests__/upstream-selfserve.test.ts
// 上游自用批守门（2026-10-01，吸收二期 A 批）：hermes-studio 上游"有而没用起来"
// 的四件接线各自就位——Web 终端收编三段链（收编路由+视图装载+侧栏条目）、
// Spotlight 会话全文深搜升级行、页头 changelog 弹窗、petdex/agentManager
// 门控一致性。源码级静态断言（与 s3-feature-gates 同模式，脱离共享注入树）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

describe('A1 Web 终端收编三段链（routes → VIEW_LOADERS → 侧栏条目）', () => {
  it('ANNEXED_LEGACY 收编 hermes.terminal（superadmin 门控随上游 meta）', () => {
    const routes = readOverlay('custom/client/ia2/routes.ts')
    expect(routes).toContain("annex('/hermes/terminal', 'hermes.terminal', { superAdmin: true })")
  })

  it('IaLegacyShell VIEW_LOADERS 装载 TerminalView', () => {
    const shell = readOverlay('custom/client/ia2/views/IaLegacyShell.vue')
    expect(shell).toContain("'hermes.terminal': () => import('@/views/hermes/TerminalView.vue')")
  })

  it('IaSettingsSidebar 系统组含 terminal 条目（superadmin）', () => {
    const sidebar = readOverlay('custom/client/ia2/components/IaSettingsSidebar.vue')
    expect(sidebar).toContain("{ name: 'hermes.terminal', icon: 'terminal', labelKey: 'sidebar.terminal', superAdmin: true }")
  })
})

describe('A2 Spotlight 会话全文深搜升级行（上游 SessionSearchModal 接线）', () => {
  it('SpotlightPanel 调 openSessionSearch 且带升级行 testid', () => {
    const panel = readOverlay('custom/client/ia2/components/SpotlightPanel.vue')
    expect(panel).toContain("import { useSessionSearch } from '@/composables/useSessionSearch'")
    expect(panel).toContain('openSessionSearch()')
    expect(panel).toContain('data-testid="spotlight-deep-search"')
  })

  it('深搜词条入消息面本地字典（zh/en 双键）', () => {
    const dict = readOverlay('custom/client/ia2/i18n-msg-surface.ts')
    expect(dict).toContain('deepSearchSessions')
  })
})

describe('A3 页头 changelog 弹窗（上游 11 语言 changelog 数据接线）', () => {
  it('IaShellHeader 引 changelog 数据 + NModal + 版本号入口', () => {
    const header = readOverlay('custom/client/ia2/components/IaShellHeader.vue')
    expect(header).toContain("import { changelog } from '@/data/changelog'")
    expect(header).toContain('showChangelog')
    expect(header).toContain('data-testid="ia-header-changelog"')
    expect(header).toContain("t('sidebar.changelog')")
  })
})

describe('A4 门控一致性（S3 既定语义补消费方）', () => {
  it('petdex/agentManager 侧栏条目随 features 门控', () => {
    const sidebar = readOverlay('custom/client/ia2/components/IaSettingsSidebar.vue')
    expect(sidebar).toContain("e.name === 'hermes.petdex' && !features.pet")
    expect(sidebar).toContain("e.name === 'hermes.agentManager' && !features.agentManager")
  })

  it('agentManager 收编路由随 features.agentManager 条件进树', () => {
    const routes = readOverlay('custom/client/ia2/routes.ts')
    expect(routes).toContain('features.agentManager')
  })

  it('features.ts 单一事实源无重复键（ekko/agentManager/externalLinks 各一处）', () => {
    const src = readOverlay('config/features.ts')
    for (const key of ['ekko: boolean', 'agentManager: boolean', 'externalLinks: boolean']) {
      expect(src.split(key).length - 1, `${key} 重复定义`).toBe(1)
    }
    // 读取侧只数实现行（接口注释中的同名环境变量文案不计）
    for (const key of ['import.meta.env.VITE_CUSTOM_EKKO', 'import.meta.env.VITE_CUSTOM_AGENT_MANAGER', 'import.meta.env.VITE_CUSTOM_EXTERNAL_LINKS']) {
      expect(src.split(key).length - 1, `${key} 重复读取`).toBe(1)
    }
  })
})
