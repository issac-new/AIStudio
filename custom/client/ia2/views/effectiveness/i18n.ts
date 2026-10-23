// overlay/custom/client/ia2/views/effectiveness/i18n.ts
// 交付效能页签文案单一事实源（模块内小字典，同 eval/i18n.ts 先例——不动 473
// locale 树，zh/en 成对导出供守门测试断言）。2026-10-23 天猫数字员工两文吸收轮。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const EFFECTIVENESS_TEXT = {
  zh: {
    title: '交付效能',
    subtitle: '日报 · C×L 效能画像 · 介入归因',
    refresh: '刷新',
    generatedAt: '生成于',
    unavailable: '数据源缺席',
    // 日报区
    digestTitle: '交付日报',
    trendCompleted: '完成',
    trendCreated: '新建',
    prevWindow: '上一窗',
    statuses: '状态盘点',
    listCompleted: '近 24h 完成',
    listBlockers: '卡点（负责人 · 停留时长）',
    listReview: '评审排队（按老化）',
    listStalled: '执行停滞候选',
    suggestions: '下一步建议',
    empty: '（空）',
    dwell: '停留',
    expand: '展开',
    collapse: '收起',
    boards: '看板',
    boardsAvailable: '可用',
    // 矩阵区
    matrixTitle: 'C×L 效能画像',
    matrixCount: '任务',
    matrixAvgInterventions: '平均介入',
    matrixTotals: '总账',
    matrixEvaluatedC: '有复杂度信号',
    // 介入区
    interventionsTitle: '介入归因账本',
    layerCollab: '协作层',
    layerDelivery: '交付层',
    scopeAll: '全部 run',
    runSelector: 'run 下钻',
    autoApprove: '系统代行（不计介入）',
    riskSignals: '风险信号',
    riskHit: '命中',
    riskMiss: '未命中',
    typeRaise: '提出需求',
    typeContext: '补充上下文',
    typeNudge: '催进度',
    typeUnblock: '解决卡点',
    typeConfirm: '拍板确认',
    typeRework: '纠错返工',
    topActors: '介入最多',
    anchor: '锚点',
    runsScanned: '扫描 run',
  },
  en: {
    title: 'Delivery Effectiveness',
    subtitle: 'Daily digest · C×L matrix · Intervention ledger',
    refresh: 'Refresh',
    generatedAt: 'Generated at',
    unavailable: 'Source unavailable',
    digestTitle: 'Daily Digest',
    trendCompleted: 'Completed',
    trendCreated: 'Created',
    prevWindow: 'prev window',
    statuses: 'Status overview',
    listCompleted: 'Completed in 24h',
    listBlockers: 'Blockers (owner · dwell)',
    listReview: 'Review queue (by aging)',
    listStalled: 'Stalled candidates',
    suggestions: 'Next actions',
    empty: '(empty)',
    dwell: 'dwell',
    expand: 'Expand',
    collapse: 'Collapse',
    boards: 'boards',
    boardsAvailable: 'available',
    matrixTitle: 'C×L Effectiveness Matrix',
    matrixCount: 'tasks',
    matrixAvgInterventions: 'avg interventions',
    matrixTotals: 'Totals',
    matrixEvaluatedC: 'with complexity signal',
    interventionsTitle: 'Intervention Ledger',
    layerCollab: 'Collab layer',
    layerDelivery: 'Delivery layer',
    scopeAll: 'All runs',
    runSelector: 'Run drill-down',
    autoApprove: 'Auto-approved (not counted)',
    riskSignals: 'Risk signals',
    riskHit: 'HIT',
    riskMiss: 'miss',
    typeRaise: 'Raise',
    typeContext: 'Context',
    typeNudge: 'Nudge',
    typeUnblock: 'Unblock',
    typeConfirm: 'Confirm',
    typeRework: 'Rework',
    topActors: 'Top actors',
    anchor: 'Anchor',
    runsScanned: 'runs scanned',
  },
} as const

export type EffectivenessText = typeof EFFECTIVENESS_TEXT.zh

export function useEffectivenessText() {
  const i18nCtx = useI18n()
  return computed<EffectivenessText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? EFFECTIVENESS_TEXT.zh : EFFECTIVENESS_TEXT.en
  })
}

/** 原始字典出口：仅供守门测试做 zh/en 键成对断言 */
export { EFFECTIVENESS_TEXT }
