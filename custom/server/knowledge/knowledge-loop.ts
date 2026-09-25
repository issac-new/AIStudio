// overlay/knowledge 域：知识库闭环（antigravity §三差距表 P2 吸收，矩阵 §3.1 antigravity P2）。
//
// antigravity 语义（Knowledge 知识库"代理自动检索/贡献"闭环）：agent 不只查知识库
// ——**双向**：检索（任务相关知识自动拉）+ 贡献（学到的知识回写）。回写判定：
// 通用性（跨任务有用才入库——避免会话垃圾入知识库）。衔接 /learn 沉淀（learn-distill
// 三归宿）与 memory-taxonomy：本层=知识条目生命周期判定。
export interface KnowledgeEntry {
  entryId: string
  text: string
  /** 通用性分（跨任务有用度 0-1——antigravity 自动贡献的准入线）。 */
  reusability: number
  at: number
}

export interface ContributeDecision {
  contribute: boolean
  reason: string
}

const REUSABILITY_THRESHOLD = 0.6

/** 贡献判定（antigravity：通用性达线才入库——防会话垃圾污染知识库）。 */
export function shouldContribute(text: string, reusability: number): ContributeDecision {
  if (!text.trim()) {
    return { contribute: false, reason: '空知识条目' }
  }
  if (reusability < REUSABILITY_THRESHOLD) {
    return { contribute: false, reason: `通用性 ${reusability.toFixed(2)} < ${REUSABILITY_THRESHOLD}——会话专用不入库` }
  }
  return { contribute: true, reason: '通用性达线——入库（跨任务复用）' }
}

/** 检索过滤（任务相关性：关键词命中+通用性降权——antigravity 自动检索语义）。 */
export function searchKnowledge(entries: readonly KnowledgeEntry[], keywords: readonly string[], top = 5): KnowledgeEntry[] {
  return entries
    .map((e) => {
      const hits = keywords.reduce((s, k) => s + (e.text.toLowerCase().includes(k.toLowerCase()) ? 1 : 0), 0)
      return { e, hits, score: hits * 10 + e.reusability }
    })
    .filter((x) => x.hits > 0)  // 命中才入选；通用性只做同命中加权（防零命中混过）
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .map((x) => x.e)
}
