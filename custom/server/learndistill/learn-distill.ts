// overlay/learndistill 域：/learn 沉淀闭环（antigravity §四 P1-9 吸收，矩阵 §3.1 antigravity P2）。
//
// antigravity 语义（/learn 沉淀闭环：会话反馈→Rules/Skills/记忆三归宿）：用户在会话里
// 说"以后都这样"——**归宿判定**：
// - **rules**（项目约定）："这个项目必须/不要…"→ 规则（convention）；
// - **skills**（可复用流程）："每次发布都做 X"→ 技能（procedure）；
// - **memory**（偏好/事实）："我喜欢/记住…"→ 记忆（memory-taxonomy）。
// 衔接 memory-taxonomy（四类型）与 skills-ledger：本层=归宿判定纯函数。
export type DistillTarget = 'rules' | 'skills' | 'memory'

export interface FeedbackFacts {
  text: string
  /** 是否项目范围（"这个项目"→rules；"总是"→skills）。 */
  projectScoped: boolean
  /** 是否流程化（多步骤可复用）。 */
  procedural: boolean
}

export interface DistillDecision {
  target: DistillTarget
  /** 归档建议类型（memory-taxonomy 四类型）。 */
  memoryType?: 'preference' | 'convention' | 'fact' | 'lesson'
  reason: string
}

/** 反馈→归宿判定（antigravity /learn 语义：流程化→skills；项目范围→rules；余→memory）。 */
export function distillTarget(facts: FeedbackFacts): DistillDecision {
  if (facts.procedural) {
    return { target: 'skills', reason: '可复用流程（多步骤）→ 技能沉淀' }
  }
  if (facts.projectScoped) {
    return { target: 'rules', memoryType: 'convention', reason: '项目范围约定 → 规则（convention）' }
  }
  return { target: 'memory', memoryType: 'preference', reason: '通用偏好/事实 → 记忆沉淀' }
}
