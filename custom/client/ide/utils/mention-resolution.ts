// overlay：@提及域合并数据面（zcode §七 #9 待排期项，zcode mentions 六源+#7 派单半边合并）。
//
// 语义（zcode ui/mentions/providers/ 六源 + Ycode mention-dispatch 派单）：
// ChatInput 的 @ 引用统一解析——**六源引用**（file/sessions/skills/plugins/subagents/
// whiteboard）与**派单目标**（agent/squad）同一解析口径，不再两套 @ 语法。
// 每条 @ 具带 kind+target+resolved 是否可解析；解析器纯函数，UI 提示/自动补全消费。
export type MentionKind = 'file' | 'session' | 'skill' | 'plugin' | 'subagent' | 'whiteboard' | 'agent' | 'squad'

export interface MentionRef {
  raw: string
  kind: MentionKind
  target: string
  /** 裸 @word 归派单 agent（向后兼容 #7 语法）；带前缀 @kind:target 归六源。 */
  resolved: boolean
}

/** 前缀→kind 映射（zcode 六源 + 派单）。 */
const PREFIX_KIND: Record<string, MentionKind> = {
  file: 'file', f: 'file',
  session: 'session', sess: 'session',
  skill: 'skill', s: 'skill',
  plugin: 'plugin',
  subagent: 'subagent', sub: 'subagent',
  whiteboard: 'whiteboard', wb: 'whiteboard',
  squad: 'squad',
}

/** @ 引用统一解析（前缀形式 @kind:target 或 @kind/target；裸 @word=派单 agent）。 */
export function resolveMentions(text: string): MentionRef[] {
  const out: MentionRef[] = []
  const seen = new Set<string>()
  const re = /@(?:([a-zA-Z][\w-]*)[/:])?([A-Za-z0-9][\w./-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const prefix = m[1]
    const target = m[2]
    const raw = m[0]
    if (seen.has(raw)) continue
    seen.add(raw)
    if (prefix && PREFIX_KIND[prefix]) {
      out.push({ raw, kind: PREFIX_KIND[prefix], target, resolved: true })
    } else if (prefix && !PREFIX_KIND[prefix]) {
      // 未知前缀按文件名路径尝试（@src/a.ts 形态——前缀段是路径首段）。
      out.push({ raw, kind: 'file', target: `${prefix}/${target}`, resolved: false })
    } else {
      // 裸 @word：派单 agent（#7 语法兼容）。
      out.push({ raw, kind: 'agent', target, resolved: false })
    }
  }
  return out
}

/** 合并口径汇总（六源引用数+派单目标数——UI 提示计数）。 */
export function mentionSummary(refs: readonly MentionRef[]): { sixSource: number; dispatch: number; unresolved: number } {
  return {
    sixSource: refs.filter((r) => r.kind !== 'agent' && r.kind !== 'squad').length,
    dispatch: refs.filter((r) => r.kind === 'agent' || r.kind === 'squad').length,
    unresolved: refs.filter((r) => !r.resolved).length,
  }
}
