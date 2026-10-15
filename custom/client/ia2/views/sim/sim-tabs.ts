// overlay/custom/client/ia2/views/sim/sim-tabs.ts
// 推演中心（/app/sim，B1 壳）六签文案单一事实源。
// 模式照 i18n-tasks-tabs.ts（模块内小事实源 + locale 跟随，不依赖 473 locale 树
// ——词条不随上游 pull 漂移），但独立成文不改该文件：13 键拆分归 A0 三中心
// 导航工单，届时两处文案模块再评估合流。六签定义（轮次总览/监督面板/运行观测/
// 证据库/交付健康/需求追溯）冻结自 2026-10-16-sim-center-detailed-design.md。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const SIM_TABS_TEXT = {
  zh: {
    shellTitle: '推演中心',
    tabOverview: '轮次总览',
    tabSupervision: '监督面板',
    tabOps: '运行观测',
    tabEvidence: '证据库',
    tabDelivery: '交付健康',
    tabTrace: '需求追溯',
    pendingBadge: '待实现',
    pendingLead: '本签内容（数据面）由推演中心波 2 后续工单 B2-B7 逐签实装，当前仅壳层占位。',
    endpointsLead: 'X1 端点已就绪（本签将消费）：',
  },
  en: {
    shellTitle: 'Simulation Center',
    tabOverview: 'Round Overview',
    tabSupervision: 'Supervision',
    tabOps: 'Run Ops',
    tabEvidence: 'Evidence Library',
    tabDelivery: 'Delivery Health',
    tabTrace: 'Requirements Trace',
    pendingBadge: 'Pending',
    pendingLead: 'Tab content (data plane) lands in follow-up tickets B2-B7; this is a shell placeholder.',
    endpointsLead: 'X1 endpoints ready (to be consumed by this tab):',
  },
} as const

export type SimTabsText = typeof SIM_TABS_TEXT.zh

/** 页签词条（locale 响应式跟随；不读 473 locale 树） */
export function useSimTabsText() {
  const i18nCtx = useI18n()
  return computed<SimTabsText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? SIM_TABS_TEXT.zh : SIM_TABS_TEXT.en
  })
}

/** 原始字典出口：仅供守门测试做 zh/en 键成对断言，组件一律走 useSimTabsText */
export { SIM_TABS_TEXT }
