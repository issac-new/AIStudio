// overlay/custom/client/ia2/i18n-tasks-tabs.ts
// 工作项区（/app/board，swarm kanban 页）一级页签文案单一事实源。
// 2026-10-01 单层页签重构（用户裁定：不要二级页签）：治理中心 5 分区拆平——
// 总览（六闸卡+六域体检）并入「三账与体检」页签，其余 4 分区升平级页签。
// 模块内小事实源 + locale 跟随（同 i18n-run-surface 先例）：patch 473 处漂移态
// （0.7.26 pull 冲掉 locale 段），页签词条不依赖 473；顺带根治 tabGovernance
// 键缺失导致的 gov 页签空标签（rsText.tabGovernance 从未定义——vue-tsc 不覆盖
// custom client，类型缺口静默溜进运行时）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const TASKS_TABS_TEXT = {
  zh: {
    tabBoard: '看板',
    // 2026-10-04 说人话轮（用户裁定：除看板外页签全看不懂）——行业通用术语重命名+逐签导语
    tabTrace: '需求追溯',
    tabAccounts: '交付健康',
    tabObservatory: '运行观测',
    tabGovOrg: '协作与知识',
    tabGovRegistry: '能力与规则',
    tabGovAudit: '审计与变更',
    tabGovDocs: '文档评审',
    tabGovHarness: '工程效能',
    tabGovCluster: '集群健康',
  },
  en: {
    tabBoard: 'Board',
    tabTrace: 'Requirements Trace',
    tabAccounts: 'Delivery Health',
    tabObservatory: 'Run Observatory',
    tabGovOrg: 'Team & Knowledge',
    tabGovRegistry: 'Capabilities & Rules',
    tabGovAudit: 'Audit & Changes',
    tabGovDocs: 'Doc Review',
    tabGovHarness: 'Engineering Metrics',
    tabGovCluster: 'Cluster Health',
  },
} as const

export type TasksTabsText = typeof TASKS_TABS_TEXT.zh

/** 页签词条（locale 响应式跟随；不读 473 locale 树） */
export function useTasksTabsText() {
  const i18nCtx = useI18n()
  return computed<TasksTabsText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? TASKS_TABS_TEXT.zh : TASKS_TABS_TEXT.en
  })
}
