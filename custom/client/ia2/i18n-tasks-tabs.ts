// overlay/custom/client/ia2/i18n-tasks-tabs.ts
// 工作台页签（/app/board）文案单一事实源 —— A0 三中心拆分（2026-10-16）后
// 收敛为工作台 3 键：看板 / 任务协同 / 协作与知识。
// 沿革：
// · 2026-10-01 单层页签重构（用户裁定：不要二级页签）——治理中心 5 分区拆平；
// · 2026-10-04 说人话轮（用户裁定：除看板外页签全看不懂）——行业通用术语重命名；
// · 2026-10-16 A0 三中心拆分（R8：导航按关注面归位）——原 13 键拆三中心各自
//   模块内事实源，本文件只留工作台 3 键（tabBoard/tabOrchestra/tabGovOrg）。
// 迁出 10 键逐键去向（旧深链 ?tab=<key> 重定向见 TasksView.legacyTabRedirect）：
// · tabTrace       → sim-tabs.ts tabTrace（推演中心签 6 需求追溯 /app/sim/trace）
// · tabAccounts    → sim-tabs.ts tabDelivery（推演中心签 5 交付健康 /app/sim/delivery；
//                    原「交付健康」语义并入推演中心同名签）
// · tabObservatory → sim-tabs.ts tabOps（推演中心签 3 运行观测 /app/sim/ops）
// · tabGovRegistry / tabGovAudit / tabGovDocs / tabGovHarness / tabGovCluster /
//   tabGovOntology / tabGovSessionHealth（7 键）→ i18n-gov-tabs.ts（治理中心
//   /app/gov 页签文案过渡事实源，C1 七签壳消费；gov 域四视图标题已切至该模块）
// 模块内小事实源 + locale 跟随（同 i18n-run-surface 先例）：不依赖 473 locale
// 树，页签词条不随上游 pull 漂移（patch 473 曾冲掉 locale 段的教训）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const TASKS_TABS_TEXT = {
  zh: {
    tabBoard: '看板',
    tabOrchestra: '任务协同',
    tabGovOrg: '协作与知识',
  },
  en: {
    tabBoard: 'Board',
    tabOrchestra: 'Orchestration',
    tabGovOrg: 'Team & Knowledge',
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

/** 原始字典出口：仅供守门测试做 zh/en 键成对断言（同 sim-tabs.ts 先例） */
export { TASKS_TABS_TEXT }
