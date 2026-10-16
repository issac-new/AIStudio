// overlay/custom/client/ia2/views/gov/gov-tabs.ts
// 治理中心（/app/gov，C1 壳）七签文案单一事实源。模式照 sim-tabs.ts
// （模块内小事实源+locale 跟随）。七签定义冻结自设计正本 §二 治理关注面
// （2026-10-16-design-derived-from-requirements.md）：关卡与流程/组织与资产/
// 清偿门/问题单对账/审计与变更/文档评审/度量体检。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const GOV_TABS_TEXT = {
  zh: {
    shellTitle: '治理中心',
    tabProcess: '关卡与流程',
    tabOrgAssets: '组织与资产',
    tabClearance: '清偿门',
    tabIssues: '问题单对账',
    tabAudit: '审计与变更',
    tabDocs: '文档评审',
    tabMetrics: '度量体检',
    pendingBadge: '待实装',
    pendingLead: '本签内容由 C 波后续工单（C3-C9）逐签实装，当前壳层占位；将迁入的既有组件：',
  },
  en: {
    shellTitle: 'Governance Center',
    tabProcess: 'Gates & Process',
    tabOrgAssets: 'Org & Assets',
    tabClearance: 'Clearance Gate',
    tabIssues: 'Issue Ledger',
    tabAudit: 'Audit & Change',
    tabDocs: 'Doc Review',
    tabMetrics: 'Metrics Checkup',
    pendingBadge: 'Pending',
    pendingLead: 'Tab content lands in follow-up tickets C3-C9; components to be migrated:',
  },
} as const

export type GovTabsText = typeof GOV_TABS_TEXT.zh

export function useGovTabsText() {
  const i18nCtx = useI18n()
  return computed<GovTabsText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? GOV_TABS_TEXT.zh : GOV_TABS_TEXT.en
  })
}

export { GOV_TABS_TEXT }
