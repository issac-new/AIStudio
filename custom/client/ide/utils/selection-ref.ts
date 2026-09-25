// overlay：选区引用入会话（codex-product 文件/选区引用吸收，矩阵 §3.8 行 245 @域合并）。
//
// codex-product 语义（文件/选区引用入会话）：文件引用已由 mention-resolution file
// 源覆盖；本层补**选区引用**——编辑器选区（path+L 区间+片段）作为 @ 引用入会话：
// - **形态**：@file:path:L{start}-L{end}（与 mention-resolution file 源同解析口径）；
// - **校验**：start>=1、end>=start、片段非空；
// - **渲染**：引用卡（路径+区间+首行摘要）。
export interface SelectionRef {
  path: string
  startLine: number
  endLine: number
  /** 选区文本片段（入会话随引用携带）。 */
  snippet: string
}

export interface SelectionRefValidation {
  ok: boolean
  problem?: string
}

/** 选区引用校验（codex-product 语义）。 */
export function validateSelectionRef(ref: SelectionRef): SelectionRefValidation {
  if (ref.startLine < 1) return { ok: false, problem: 'startLine < 1' }
  if (ref.endLine < ref.startLine) return { ok: false, problem: 'endLine < startLine' }
  if (!ref.snippet.trim()) return { ok: false, problem: 'empty snippet' }
  return { ok: true }
}

/** 选区引用→@ 形态文本（mention-resolution file 源可解析口径）。 */
export function formatSelectionRef(ref: SelectionRef): string {
  return `@file:${ref.path}:L${ref.startLine}-L${ref.endLine}`
}

/** 引用卡投影（路径+区间+首行摘要 60 字）。 */
export function renderSelectionCard(ref: SelectionRef): string {
  const firstLine = ref.snippet.split('\n')[0] ?? ''
  const summary = firstLine.length > 60 ? firstLine.slice(0, 59) + '…' : firstLine
  return `${ref.path} L${ref.startLine}-L${ref.endLine} · ${summary}`
}
