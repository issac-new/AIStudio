// overlay/custom/client/ia2/i18n-gov-tabs.ts
// 治理中心页签文案过渡事实源（A0，2026-10-16 三中心拆分）：/app/gov 七签的
// 词条先落本模块，C1（治理中心壳升格工单）消费；gov 域四个视图（Registry/
// Audit/Docs/Harness）的标题词条自 A0 起切到本模块——原 i18n-tasks-tabs.ts
// 已收敛为工作台 3 键，继续引用迁出键会在运行时取到 undefined（vue-tsc 不
// 覆盖 custom client，类型缺口静默溜进运行时——同 tabGovernance 键缺失教训）。
// 文案值逐字承接 2026-10-04 说人话轮原值，不新造。
// 模块内小事实源 + locale 跟随（同 sim-tabs / i18n-tasks-tabs 先例）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const GOV_TABS_TEXT = {
  zh: {
    tabGovRegistry: '能力与规则',
    tabGovAudit: '审计与变更',
    tabGovDocs: '文档评审',
    tabGovHarness: '研发效能',
    tabGovCluster: '集群健康',
    tabGovOntology: '本体校验',
    tabGovSessionHealth: '会话健康',
  },
  en: {
    tabGovRegistry: 'Capabilities & Rules',
    tabGovAudit: 'Audit & Changes',
    tabGovDocs: 'Doc Review',
    tabGovHarness: 'Engineering Effectiveness',
    tabGovCluster: 'Cluster Health',
    tabGovOntology: 'Ontology Validation',
    tabGovSessionHealth: 'Session Health',
  },
} as const

export type GovTabsText = typeof GOV_TABS_TEXT.zh

/** 页签词条（locale 响应式跟随；不读 473 locale 树） */
export function useGovTabsText() {
  const i18nCtx = useI18n()
  return computed<GovTabsText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? GOV_TABS_TEXT.zh : GOV_TABS_TEXT.en
  })
}

/** 原始字典出口：仅供守门测试做 zh/en 键成对断言（同 sim-tabs.ts 先例） */
export { GOV_TABS_TEXT }
