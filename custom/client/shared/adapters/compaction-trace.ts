// overlay：compaction 留痕卡（deepseek-harness §十 P1-11 吸收，矩阵 §3.8）。
//
// dsh 语义（compaction 留痕卡+/compact 命令）：压缩不静默——每次压缩留下一张卡
// （何时压/影响范围/摘要规模），会话里看得见"这里被压过"。hermes 侧压缩器已有
// 压缩边界（_compressed_summary 标记+pre-compression 剪枝日志），本模块=投影：
// 压缩标记列表 → 留痕卡序列（只读聚合，渲染层贴卡）。
export interface CompactionMarker {
  at: number
  /** 压缩原因（threshold/manual/overflow）。 */
  reason?: string
  /** 影响范围：被折叠进摘要的轮数/条数。 */
  foldedMessages?: number
  /** 摘要规模（字符）。 */
  summaryChars?: number
}

export interface CompactionCard {
  index: number
  at: number
  reason: string
  /** 影响范围展示（dsh 卡："折叠 N 条"）。 */
  scopeText: string
  summaryChars: number
  /** 该点前后的保护范围提示（hermes 语义：摘要前=历史折叠，之后=活跃窗）。 */
  boundaryNote: string
}

export function buildCompactionCards(markers: readonly CompactionMarker[]): CompactionCard[] {
  return markers.map((m, index) => ({
    index,
    at: m.at,
    reason: m.reason ?? 'threshold',
    scopeText: typeof m.foldedMessages === 'number' && m.foldedMessages > 0
      ? `折叠 ${m.foldedMessages} 条进摘要`
      : '折叠范围未记',
    summaryChars: typeof m.summaryChars === 'number' && m.summaryChars > 0 ? m.summaryChars : 0,
    boundaryNote: '摘要为背景参考，活跃任务以最新消息为准（防复燃框架）',
  }))
}

/** 留痕卡摘要（压缩不静默——卡片数即压缩次数）。 */
export function compactionSummary(cards: readonly CompactionCard[]): { count: number; totalFolded: number; lastReason: string | null } {
  return {
    count: cards.length,
    totalFolded: cards.reduce((s, c) => {
      const m = c.scopeText.match(/折叠 (\d+) 条/)
      return s + (m ? parseInt(m[1], 10) : 0)
    }, 0),
    lastReason: cards.length ? cards[cards.length - 1].reason : null,
  }
}
