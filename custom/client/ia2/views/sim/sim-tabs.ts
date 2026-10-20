// overlay/custom/client/ia2/views/sim/sim-tabs.ts
// 全流程推演（/app/sim）页签文案单一事实源。
// 2026-10-18 推演区批：原「仿真中心」改名「全流程推演」；页面只保留
// 运行总览/监督面板/运行监控/证据库四签；旧交付/追溯深链由 routes 直接
// 改道日常验收阶段页，推演词表不再携带死词条。
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
    endpointsLead: '端点：',
  },
  en: {
    shellTitle: 'Full-run Simulation',
    tabOverview: 'Director',
    tabSupervision: 'Supervision',
    tabOps: 'Run Monitoring',
    tabEvidence: 'Evidence Library',
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
