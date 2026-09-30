// overlay/custom/client/ia2/i18n-run-surface.ts
// 运行面新词条（循环×工作流融合 Phase 1 + 看板全链路追踪页签，2026-10-01）。
// 独立小事实源 + locale 切换（同 governance/i18n.ts 先例）——不动 patch 473 的
// locale 单一事实源面：当前注入链处漂移态（upstream 0.7.26 pull 冲掉 473 段，
// 全量重放被 499 堵死），patch 路线在本树不可验证；待漂移治理轮恢复 473 后
// 三键收编入 473（届时本模块退役）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const RUN_SURFACE_TEXT = {
  zh: {
    tabWorkflows: '工作流',
    ctaWorkflows: '查看工作流运行',
    tabObservatory: '全链路追踪',
    tabGovernance: '治理中心',
  },
  en: {
    tabWorkflows: 'Workflows',
    ctaWorkflows: 'View workflow runs',
    tabObservatory: 'Observatory',
    tabGovernance: 'Governance',
  },
} as const

// 值放宽为 string：as const 下 zh/en 字面量类型互斥，computed<typeof zh> 会拒收 en 分支
// （TS2322）；键完整性仍由 Record 强制——任一字典缺键在类型面即红（24h 审查 P3）。
export type RunSurfaceText = Record<keyof typeof RUN_SURFACE_TEXT.zh, string>

/** 运行面词条（locale 响应式跟随；t('runcenter.tab.workflows') 等键位语义对齐 473 命名空间） */
export function useRunSurfaceText() {
  const i18nCtx = useI18n()
  return computed<RunSurfaceText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? RUN_SURFACE_TEXT.zh : RUN_SURFACE_TEXT.en
  })
}
