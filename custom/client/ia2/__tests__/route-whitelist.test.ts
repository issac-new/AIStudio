// overlay/custom/client/ia2/__tests__/route-whitelist.test.ts
// 路由白名单单测（补遗⑤ §13.6-2）：用户可达路由集合快照断言——新增可达路由须走补遗⑤评审
//（改本快照=显式变更点）。快照取自 2026-09-29 P9/P10 落地后实况；
// 2026-09-30 用户裁定变更（两批）：+hermes.settings（设置页并入）；
// +ANNEXED_LEGACY 全量并入 28 名（双栏根治：侧栏可达 /hermes-* 页同名替换进
// IaLegacyShell 壳，见 routes.ts ANNEXED_LEGACY 表——并入例外为唯一 hermes.*
// 来源，未并入的 hermes.browser/ekko.* 等仍归上游，不经本表）。
// 2026-10-01 上游自用批：+hermes.terminal（Web 终端并入，superadmin）；
// −hermes.agentManager（features.agentManager 默认关，S3 既定语义补上消费方；
// vitest 无 VITE_CUSTOM_AGENT_MANAGER → 并入记录默认不进树）。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildIaRoutes } from '../routes'
import { buildIdeRoutes } from '../../ide/routes'

function flatten(rs: any[], out: any[] = []): any[] {
  for (const r of rs ?? []) { out.push(r); if (r.children) flatten(r.children, out) }
  return out
}
const all = flatten([...buildIaRoutes(), ...buildIdeRoutes()])
const named = all.filter((r) => r.name).map((r) => r.name) as string[]
const compat = all.filter((r) => r.redirect)
const EXPECTED_NAMES = [
  'hermes.channels',
  'hermes.chat',
  'hermes.configSettings',
  'hermes.connections',
  'hermes.files',
  'hermes.globalAgent',
  'hermes.globalAgentSession',
  'hermes.groupChat',
  'hermes.groupChatRoom',
  'hermes.jobs',
  'hermes.journey',
  'hermes.kanban',
  'hermes.logs',
  'hermes.mcp',
  'hermes.memory',
  'hermes.models',
  'hermes.performance',
  'hermes.petdex',
  'hermes.plugins',
  'hermes.profiles',
  'hermes.session',
  'hermes.settings',
  'hermes.skills',
  'hermes.skillsUsage',
  'hermes.terminal',
  'hermes.theme',
  'hermes.usage',
  'hermes.versionPreview',
  'hermes.workflow',
  'ia2.accounts',
  'ia2.board',
  'ia2.collab',
  'ia2.collabChat',
  'ia2.collabGlobalAgent',
  'ia2.collabGlobalAgentSession',
  'ia2.collabHistory',
  'ia2.collabHistorySession',
  'ia2.collabSession',
  'ia2.commsRoom',
  'ia2.dash',
  'ia2.deliveryCases',
  'ia2.eng',
  'ia2.govAudit',
  'ia2.govClearance',
  'ia2.govDocs',
  'ia2.govIssues',
  'ia2.govMetrics',
  'ia2.govOrgAssets',
  'ia2.govSettings',
  'ia2.governance',
  'ia2.groupRoom',
  'ia2.inbox',
  'ia2.journey',
  'ia2.loopCanvas',
  'ia2.runDetail',
  'ia2.runs',
  'ia2.shell',
  // B1（2026-10-16 推演中心壳·三中心重构波 2 首件）：六签名入账（需求冻结+
  // 详设重审通过——本快照变更即该评审的显式变更点）；ia2.runs/ia2.runDetail
  // 保留在账（降为重定向记录，兼容期一个版本周期，A13 升格移除）
  'ia2.sim',
  'ia2.simDelivery',
  'ia2.simEvidence',
  'ia2.simOps',
  'ia2.simOrchestration',
  'ia2.simSettings',
  'ia2.simSupervision',
  'ia2.simTrace',
  'ia2.stage1',
  'ia2.stage2',
  'ia2.stage3',
  'ia2.stage4',
  'ia2.stage5',
  'ia2.stage6',
  'ide.shell',
]

describe('路由白名单单测（补遗⑤ §13.6-2：快照断言）', () => {
  it('路由名账本快照：ia2.* 与 ide.shell + 并入例外 hermes.*（2026-09-30 设置页+ANNEXED_LEGACY 全量进壳）——零其它 hermes.*/ekko.*/share.*/desktop.*/codingAgent.*', () => {
    expect([...new Set(named)].sort()).toEqual(EXPECTED_NAMES)
  })
  it('并入例外全部经 IaLegacyShell（双栏根治单测）：hermes.* 记录零裸视图', () => {
    const hermes = all.filter((r) => typeof r.name === 'string' && r.name.startsWith('hermes.'))
    expect(hermes.length).toBe(29)
    for (const r of hermes) {
      expect(r.meta?.fullscreen, `${r.name} 并入记录须 fullscreen=true`).toBe(true)
      expect(String(r.component), `${r.name} 并入记录组件须指向 IaLegacyShell`).toContain('IaLegacyShell')
    }
    // requiresSuperAdmin 随上游 meta 迁移（守卫语义保真；terminal 为 2026-10-01
    // 并入新增——上游 /hermes/terminal 本就 requiresSuperAdmin）
    for (const name of ['hermes.terminal', 'hermes.performance', 'hermes.profiles', 'hermes.versionPreview']) {
      const rec = hermes.find((r) => r.name === name)
      expect(rec?.meta?.requiresSuperAdmin, `${name} 须保留 requiresSuperAdmin`).toBe(true)
    }
    // 五次反馈（2026-09-30）：ChatView 族+工作流页自带会话/列表侧栏也要隐——
    // standaloneEmbed（ChatPanel standalone prop / patch 526 WorkflowView 默认收起）
    for (const name of ['hermes.chat', 'hermes.session', 'hermes.globalAgent', 'hermes.globalAgentSession', 'hermes.models', 'hermes.connections', 'hermes.workflow']) {
      const rec = hermes.find((r) => r.name === name)
      expect(rec?.meta?.standaloneEmbed, `${name} 须带 standaloneEmbed（隐自带侧栏）`).toBe(true)
    }
    // 群聊自带房间列是该页核心导航，不得隐
    for (const name of ['hermes.groupChat', 'hermes.groupChatRoom']) {
      const rec = hermes.find((r) => r.name === name)
      expect(rec?.meta?.standaloneEmbed, `${name} 不得带 standaloneEmbed`).toBeUndefined()
    }
  })
  it('兼容层全部为 redirect；退役名 ia2.eng / ia2.loopCanvas 不在可达名账本', () => {
    for (const c of compat) expect(['string','function']).toContain(typeof c.redirect)
    for (const gone of ['ia2.eng', 'ia2.loopCanvas']) {
      const rec = all.find((r) => r.name === gone)
      if (rec) expect(rec.redirect, `${gone} 只能以重定向残留`).toBeTruthy()
    }
  })
  it('M2：旧 /ide 壳重定向 → /app/ide（驾驶舱子路由）', () => {
    const legacy = buildIdeRoutes().find((r) => String(r.path) === '/ide')
    expect(legacy, '/ide 兼容记录在案').toBeTruthy()
    expect(String(legacy?.redirect)).toContain('/app/ide')
  })
})
