// overlay/custom/client/cockpit/i18n-approvals.ts
// 收件箱抽检区词条（V4.1 §七）。独立小事实源：approvals.* 主键族（title/choice/
// risk 等）在 patch 473 locale 单一事实源里健在，但 spotcheck.* 子键族随某轮
// 折叠重放丢失（series 496 缺号、注入态 zh.ts 无此块；旧 dist 残影仍显示中文，
// 重建即静默回退 key 字符串——ia2-i18n-coverage 只扫 ia2.* 接不住此域）。
// 沿 governance/i18n.ts 本地字典先例：不动 473（并行会话在改），custom 模块内
// 自持；legacy i18n 无 mergeLocaleMessage，消费方 computed 直取不走 t()。
export const approvalsSpotcheckMessages = {
  zh: {
    title: '抽检 · 自动放行回看',
    hint: '低风险只读命令已自动放行，抽样送人复核',
    empty: '暂无待抽检 · 已处置 {n} 条',
    autoPassedAt: '自动放行于',
    confirm: '认可放行',
    veto: '误放行',
    resolvedTitle: '已处置回看',
    verdictConfirmed: '认可放行',
    verdictVetoed: '误放行',
    verdictAt: '处置于',
    suggToggle: '放行建议（从历史审批提炼可入白名单的模式）',
    suggScanning: '正在扫描历史审批生成建议（冷启约 1 分钟，之后 10 分钟内直接命中缓存）…',
    suggEmpty: '近期无可提炼的放行模式。',
    suggAdoptHint: '采纳：在 agent 会话执行 /approvals 或 CLI approvals suggest --apply N（本面板只读不落盘）。',
  },
  en: {
    title: 'Spot check · Auto-pass review',
    hint: 'Low-risk read-only commands auto-passed; sampled for human review',
    empty: 'Nothing pending · {n} resolved',
    autoPassedAt: 'Auto-passed at',
    confirm: 'Confirm',
    veto: 'Veto',
    resolvedTitle: 'Resolved review',
    verdictConfirmed: 'Confirmed',
    verdictVetoed: 'Vetoed',
    verdictAt: 'Resolved at',
    suggToggle: 'Pass suggestions (patterns mined from approval history)',
    suggScanning: 'Scanning approval history (cold start ~1 min; cached hits within 10 min after)…',
    suggEmpty: 'No pass patterns to mine recently.',
    suggAdoptHint: 'Adopt: run /approvals in the agent session, or CLI approvals suggest --apply N (this panel is read-only).',
  },
}
