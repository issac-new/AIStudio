// overlay/custom/client/ia2/i18n-term-overrides.ts
// Tier-2 术语覆盖（D18 术语标准化，2026-10-17 设计正本 §5.5 第二层）：
// 上游 locale 树（patch 473 注入）里的 ia2/approvals 键值本轮改不动——禁 inject
// 期改补丁不生效，只造成补丁与注入树漂移。改走运行时 mergeLocaleMessage，
// 入口挂 registries/client/entry.mts 的 i18nReady 钩子（A 类注册位）。
// 只收中文侧非标准词；英文侧本就是标准词（Approvals/Cockpit overview/Review
// gates）不动。键清单与裁决理由对账设计正本 §5.5 与 §5.9。
// 测试环境 mock 掉 vue-i18n（t 返回键本身），本模块不被测试加载，无一致性风险。

/** 覆盖字典（zh 单侧）。结构即 locale 子树，mergeLocaleMessage 深合并不动其余键 */
export const IA2_TERM_OVERRIDES_ZH = {
  approvals: {
    // 同一功能三个名字（title/pageTitle=审批收件箱、navLabel=待审收件箱）合一
    navLabel: '审批收件箱',
  },
  ia2: {
    overviewDash: {
      title: '工作台概览',
      waitingApproval: '待我审批',
      gateReview: '待审评审',
      recentVerdicts: '最近判定',
      noVerdicts: '暂无判定记录',
    },
    wm: { mergeBack: '合并回工作台' },
  },
} as const

/** 结构型入参：不 import vue-i18n 类型，避免与上游 i18n 模块的装载时序耦合 */
interface MergeableI18n {
  global: { mergeLocaleMessage(locale: string, messages: Record<string, unknown>): void }
}

export function applyIa2TermOverrides(i18n: MergeableI18n): void {
  i18n.global.mergeLocaleMessage('zh', IA2_TERM_OVERRIDES_ZH as unknown as Record<string, unknown>)
}
