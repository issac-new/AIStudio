// overlay/custom/client/ia2/views/effectiveness/i18n.ts
// 交付效能页签文案单一事实源（模块内小字典，同 eval/i18n.ts 先例——不动 473
// locale 树，zh/en 成对导出供守门测试断言）。2026-10-23 天猫数字员工两文吸收轮。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const EFFECTIVENESS_TEXT = {
  zh: {
    title: '交付效能',
    subtitle: '今天干到哪了 · 活有多难干到哪步 · 人插了多少次手',
    refresh: '刷新',
    generatedAt: '生成于',
    unavailable: '数据源缺席',
    // 日报区
    digestTitle: '今天的情况',
    trendCompleted: '完成',
    trendCreated: '新建',
    prevWindow: '昨天同项',
    statuses: '各状态有多少活',
    listCompleted: '过去一天干完的',
    listBlockers: '卡住的活（谁负责 · 卡了多久）',
    listReview: '在等评审的（等最久的在前）',
    listStalled: '干着没动静的',
    suggestions: '下一步建议',
    empty: '（空）',
    dwell: '停留',
    expand: '展开',
    collapse: '收起',
    boards: '看板',
    boardsAvailable: '可用',
    // 矩阵区
    matrixTitle: '活的难度 × 干到的步骤',
    matrixCount: '任务',
    matrixAvgInterventions: '平均被插话',
    matrixTotals: '合计',
    matrixEvaluatedC: '标了难度的',
    // 介入区
    interventionsTitle: '人插手记录',
    layerCollab: '排活时插话',
    layerDelivery: '干活中插话',
    scopeAll: '全部推演轮次',
    runSelector: '按推演轮次下钻',
    autoApprove: '机器自动过审（不算人插手）',
    riskSignals: '风险信号',
    riskHit: '该注意',
    riskMiss: '正常',
    typeRaise: '提出需求',
    typeContext: '补充上下文',
    typeNudge: '催进度',
    typeUnblock: '解决卡点',
    typeConfirm: '拍板确认',
    typeRework: '纠错返工',
    topActors: '插手最多',
    anchor: '出处',
    runsScanned: '覆盖推演',
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

// 字典是 as const（值被收窄成字面量），en 与 zh 文案各异 → 直接取 typeof zh 会拒绝 en。
// 按键集合固定、值放宽为 string：键奇偶校验仍由守门测试兜住，取值处不依赖字面量。
export type EffectivenessText = { [K in keyof typeof EFFECTIVENESS_TEXT.zh]: string }

export function useEffectivenessText() {
  const i18nCtx = useI18n()
  return computed<EffectivenessText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? EFFECTIVENESS_TEXT.zh : EFFECTIVENESS_TEXT.en
  })
}

/** 原始字典出口：仅供守门测试做 zh/en 键成对断言 */
export { EFFECTIVENESS_TEXT }
