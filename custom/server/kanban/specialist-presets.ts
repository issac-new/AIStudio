// overlay/custom/server/kanban/specialist-presets.ts
// routa 列 specialist 契约库入库（2026-10-02 吸收二期 #19-1）：
// workflows/kanban 九件套 + review 三层拆分 —— 六闸"每列一个命名守门员"的
// 现成 prompt 契约资产。来源锚点（逐字对照上游 yaml 的 id/name/description/
// role_reminder 四字段，system_prompt 全文不搬——studio 派单文本有自己的组装层）：
//   upstream/routa/resources/specialists/workflows/kanban/{agent,backlog-refiner,
//   todo-orchestrator,dev-executor,qa-frontend,review-guard,blocked-resolver,
//   done-reporter,pr-publisher,flow-analyst}.yaml
//   upstream/routa/resources/specialists/review/{pr-reviewer,security-reviewer,
//   pr-analyzer}.yaml（三层评审：采集→专项→汇总判）
//
// 消费方式（零模型变更）：column-automation 配置的 steps[].specialist 与
// requiredArtifacts 可引用 preset id——GET /api/column-automation/presets 输出
// 本表供编排编辑器做预置下拉（UI 接线随编辑器升级轮）。
export interface SpecialistPreset {
  /** routa 原生 id（引用键，稳定不改名） */
  id: string
  name: string
  /** 一句话职责 */
  summary: string
  /** routa role_reminder 逐字（派单文本的角色提醒段可直接引用） */
  reminder: string
  /** routa role（ROUTA/CRAFTER/GATE/DEVELOPER——治理角色词表） */
  role: string
  /** 适配的看板列（studio 列语义；多 preset 可同列） */
  column: string
  /** 证据要求（与 requiredArtifacts 契约对齐的建议件；空=无硬证据） */
  suggestedArtifacts: string[]
}

export const SPECIALIST_PRESETS: readonly SpecialistPreset[] = [
  // ── 看板流转九件套（backlog → todo → dev → review → done + blocked/pr/flow）──
  {
    id: 'kanban-backlog-refiner', name: 'Backlog Refiner',
    summary: '粗卡打磨为就绪故事，推进到 Todo',
    reminder: 'Backlog is for clarification and shaping. Do not implement code here. When the story is ready, move it forward yourself.',
    role: 'CRAFTER', column: 'backlog', suggestedArtifacts: ['story'],
  },
  {
    id: 'kanban-todo-orchestrator', name: 'Todo Orchestrator',
    summary: '就绪故事的最后规划检查点，验证后推进 Dev',
    reminder: 'Todo is the last planning checkpoint before implementation. You do NOT trust that Backlog did a good job. Verify before advancing.',
    role: 'CRAFTER', column: 'todo', suggestedArtifacts: ['brief'],
  },
  {
    id: 'kanban-dev-executor', name: 'Dev Crafter',
    summary: 'Dev 列实现+记录进度，送 Review',
    reminder: 'Dev is for implementation. You do NOT trust that upstream planning was thorough. Verify the story is executable before coding. If not, send it back.',
    role: 'CRAFTER', column: 'dev', suggestedArtifacts: ['dev-evidence'],
  },
  {
    id: 'kanban-qa-frontend', name: 'QA Frontend',
    summary: 'Review 列前端视觉回归（Playwright+快照证据先行）',
    reminder: 'Review lane QA is evidence-first. Verify visual behavior with Playwright and snapshots before Review Guard decides approval.',
    role: 'GATE', column: 'review', suggestedArtifacts: ['qa-snapshots'],
  },
  {
    id: 'kanban-review-guard', name: 'Review Guard',
    summary: '质量闸：独立核验每条声明，不合格打回',
    reminder: 'Review is the quality gate. You do NOT trust Dev\'s self-assessment. Independently verify every claim. Reject aggressively — letting bad work through is worse than sending it back.',
    role: 'GATE', column: 'review', suggestedArtifacts: ['review-verdict'],
  },
  {
    id: 'kanban-blocked-resolver', name: 'Blocked Resolver',
    summary: 'Blocked 卡疏通：澄清阻碍、有具体下一步才放行',
    reminder: 'Blocked is a recovery lane. Clarify the blocker, reduce ambiguity, and only move the card out when a concrete next step exists.',
    role: 'CRAFTER', column: 'blocked', suggestedArtifacts: [],
  },
  {
    id: 'kanban-done-reporter', name: 'Done Reporter',
    summary: 'Done 列写完成摘要（发了什么+验了什么）',
    reminder: 'Done is the terminal lane. Do not move the card further. Leave behind a crisp completion summary for future readers.',
    role: 'GATE', column: 'done', suggestedArtifacts: ['completion-summary'],
  },
  {
    id: 'kanban-pr-publisher', name: 'PR Publisher',
    summary: '用任务 worktree/分支准备并发布 PR/MR',
    reminder: 'Use the task worktree and current branch. If the repo is on GitHub or GitLab and auth is available, push and open the PR/MR directly.',
    role: 'DEVELOPER', column: 'done', suggestedArtifacts: ['pr-url'],
  },
  {
    id: 'kanban-flow-analyst', name: 'Flow Analyst',
    summary: '全板流动模式分析，找系统性反模式',
    reminder: 'Analyze flow across the whole board, not single cards. Surface systemic anti-patterns with concrete evidence from the lanes.',
    role: 'CRAFTER', column: '*', suggestedArtifacts: ['flow-report'],
  },
  // ── review 三层拆分（G4 独立验证的机制化——评审域专项轮接多层评审单）──
  {
    id: 'review-pr-reviewer', name: 'PR Reviewer（采集层）',
    summary: '多阶段评审的原始上下文采集与发现挖掘',
    reminder: 'Collect the review context first: diff, related tests, and change intent. Surface findings with file:line anchors — do not judge mergeability here.',
    role: 'CRAFTER', column: 'review', suggestedArtifacts: ['findings'],
  },
  {
    id: 'review-security-reviewer', name: 'Security Reviewer（专项层）',
    summary: '高风险面专项安全评审（认证/注入/SSRF 分单）',
    reminder: 'One security domain per pass. Anchor every finding to an exploit path or policy violation; speculative findings go to notes, not blockers.',
    role: 'GATE', column: 'review', suggestedArtifacts: ['security-findings'],
  },
  {
    id: 'review-pr-analyzer', name: 'PR Analyzer（汇总判层）',
    summary: '汇总已验证 findings 判定可合并性',
    reminder: 'Only weigh verified findings from the collection and specialist passes. Your verdict must cite each finding id it rests on.',
    role: 'GATE', column: 'review', suggestedArtifacts: ['merge-verdict'],
  },
]

/** 按 id 取预置（编排配置引用校验用） */
export function getPreset(id: string): SpecialistPreset | undefined {
  return SPECIALIST_PRESETS.find(p => p.id === id)
}
