// overlay/sections 域：会话内分节（codex §三差距表 P2 吸收，矩阵 §3.8 codex P2）。
//
// codex 语义（会话内分节 thread/section+手动 move）：长会话分节管理——
// **section 标记**（把会话切成带标题的节）、**手动 move**（把某轮移到另一节——
// 重组叙事顺序）。纯结构模型：分节/移动（转录展示层消费）。
export interface SessionSection {
  sectionId: string
  title: string
  /** 归属该节的轮序（按序列展示）。 */
  turnIndices: number[]
}

/** 建节（空节或带初始轮）；幂等 sectionId。 */
export function defineSection(
  sections: readonly SessionSection[],
  sectionId: string, title: string, turnIndices: number[] = [],
): SessionSection[] {
  const existing = sections.find((s) => s.sectionId === sectionId)
  if (existing) return sections.map((s) => (s.sectionId === sectionId ? { ...s, title } : s))
  return [...sections, { sectionId, title, turnIndices: [...turnIndices] }]
}

/** 手动 move：把某轮从原节移到目标节（codex 手动 move 语义）。 */
export function moveTurn(
  sections: readonly SessionSection[],
  fromSectionId: string, toSectionId: string, turnIndex: number,
): SessionSection[] {
  const hasFrom = sections.some((s) => s.sectionId === fromSectionId)
  const hasTo = sections.some((s) => s.sectionId === toSectionId)
  if (!hasFrom || !hasTo || fromSectionId === toSectionId) return [...sections]
  return sections.map((s) => {
    if (s.sectionId === fromSectionId) {
      return { ...s, turnIndices: s.turnIndices.filter((i) => i !== turnIndex) }
    }
    if (s.sectionId === toSectionId) {
      return { ...s, turnIndices: [...s.turnIndices, turnIndex].sort((a, b) => a - b) }
    }
    return s
  })
}

/** 分节视图汇总（每节轮数——转录导航行）。 */
export function sectionView(sections: readonly SessionSection[]): Array<{ sectionId: string; title: string; turnCount: number }> {
  return sections.map((s) => ({ sectionId: s.sectionId, title: s.title, turnCount: s.turnIndices.length }))
}
