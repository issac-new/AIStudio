// overlay/custom/client/matrix-teams/i18n-admission.ts
// 准入五问词条（4A 治理层 ⑤）。模块内小事实源——不动 patch 473 的 locale
// 单一事实源面（对齐 custom/governance/i18n.ts 增量先例，键直接引用不经 t()）。
export const admissionMessages = {
  zh: {
    formTitle: '准入五问（首宣必填，缺一问不签）',
    q1: '问 1 真实场景：谁的真实工作在协作？',
    q2: '问 2 口径一致：关键概念双方定义对齐了吗？',
    q3: '问 3 用途边界：允许怎么用？禁止怎么用？衍生物呢？',
    q4: '问 4 越界可证：越界能发现吗？能证明吗？证不了谁认账？',
    q5: '问 5 责任落地：谁负责？风险谁接受？谁长期运营？',
    placeholder: '一句话可验证的回答',
    passed: '已过五问',
    missing: '未过五问',
    missingHint: '该账号首宣时未提交完整五问答卷',
    dispatchWarn: '目标账号未过准入五问——建议先补答卷再派发',
    required: '五答全填才能提交',
  },
  en: {
    formTitle: 'Admission five questions (required on first declare)',
    q1: 'Q1 Real scenario: whose real work is this collaboration?',
    q2: 'Q2 Semantics aligned: do both sides define key terms identically?',
    q3: 'Q3 Usage boundary: what is allowed, forbidden, and derived?',
    q4: 'Q4 Provable violation: can violations be detected and proven?',
    q5: 'Q5 Accountability: who owns, who accepts residual risk, who operates?',
    placeholder: 'One verifiable sentence',
    passed: 'admitted',
    missing: 'not admitted',
    missingHint: 'This account declared without a complete five-question form',
    dispatchWarn: 'Target account has not passed admission — ask for the form before dispatch',
    required: 'All five answers are required',
  },
} as const
