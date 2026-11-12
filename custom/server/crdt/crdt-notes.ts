// overlay/crdt 域：共写笔记合并（routa §七#14 P2 吸收，矩阵 §3.6 P2）。
//
// routa 语义（Yjs CRDT 共享笔记：人和多个 agent 并发编辑自动合并）：并发编辑不丢
// 不覆盖——**操作变换合并**（LWW 元素级+seq 升序）。Yjs 完整 CRDT 引入过重（P2
// 记档"需引 Yjs 依赖"），本模块=轻量合并语义（per-段落 LWW + 全文拼接），CRDT
// 引擎后可替换（接口不变）。
export interface NoteEdit {
  /** 段落 id（并发编辑单元——段落级 LWW）。 */
  paraId: string
  text: string
  /** 编辑者（人/agent 标识）。 */
  by: string
  /** 逻辑时序（越大越新；同 seq 按 by 字典序决胜——确定性）。 */
  seq: number
}

export interface NoteState {
  paragraphs: Map<string, NoteEdit>
}

export function mergeEdits(base: NoteState, edits: readonly NoteEdit[]): NoteState {
  const paragraphs = new Map(base.paragraphs)
  for (const e of edits) {
    const cur = paragraphs.get(e.paraId)
    if (!cur || e.seq > cur.seq || (e.seq === cur.seq && e.by > cur.by)) {
      paragraphs.set(e.paraId, e)
    }
  }
  return { paragraphs }
}

/** 全文拼接（段落按 paraId 排序——转录展示面）。 */
export function renderNote(state: NoteState): string {
  return [...state.paragraphs.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, e]) => e.text)
    .join('\n\n')
}

/** 并发合并审计（人机同权：谁写的段落统计）。 */
export function editAttribution(state: NoteState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of state.paragraphs.values()) out[e.by] = (out[e.by] ?? 0) + 1
  return out
}
