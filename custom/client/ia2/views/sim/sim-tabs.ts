// overlay/custom/client/ia2/views/sim/sim-tabs.ts
// 全流程推演（/app/sim）页签文案单一事实源。
// 2026-10-18 推演区批：原「仿真中心」改名「全流程推演」；页面只保留
// 运行总览/监督面板/运行监控/证据库四签；交付健康与需求追溯已迁⑤验收阶段页，
// 对应旧路由保留 redirect。tabDelivery/tabTrace 词条保留一版兼容（旧深链
// 重定向与既有 13 键拆分测试消费），页面不再渲染。
// D18 术语：轮次总览→运行总览、运行观测→运行监控（run 与 run-state 同名）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const SIM_TABS_TEXT = {
  zh: {
    shellTitle: '全流程推演',
    tabOverview: '导演台',
    tabSupervision: '监督面板',
    tabOps: '运行监控',
    tabEvidence: '证据库',
    tabDelivery: '交付健康',
    tabTrace: '需求追溯',
    pendingBadge: '待实现',
    pendingLead: '占位词条（页面已不再渲染；保留给后续新增签）。',
    endpointsLead: '端点：',
  },
  en: {
    shellTitle: 'Full-run Simulation',
    tabOverview: 'Director',
    tabSupervision: 'Supervision',
    tabOps: 'Run Monitoring',
    tabEvidence: 'Evidence Library',
    tabDelivery: 'Delivery Health',
    tabTrace: 'Requirements Traceability',
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
