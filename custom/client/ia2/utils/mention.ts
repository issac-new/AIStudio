// overlay/custom/client/ia2/utils/mention.ts
// @mention 总线解析（R6，multica comment.go:3100 语义）：
// 任务评论/会话输入里的 [@agent] / @agent / @squad 三类触发——
//   @agent / [@agent]      服务端为该 agent enqueue 一个 run（multica A2A 总线）
//   @squad / [@squad]      触发 leader 协调（squad_briefing 协议，R6 squad 项）
//   @member / @<人名>      进人的 inbox（不进 agent 队列）
// 解析是纯函数（UI 输入高亮与服务端分发共用单一事实源）。
export type MentionKind = 'agent' | 'squad' | 'member'

export interface Mention {
  kind: MentionKind
  /** 提及目标名（agent 名 / 人名 / 空=squad 全体） */
  name: string
  /** 原文起点（高亮/替换用） */
  start: number
  end: number
}

// multica 词表（agent/squad 关键字；member 由调用方按 agentRoster/团队名单二次判定）
const AGENT_KEYWORDS = new Set(['agent', 'squad'])

// 匹配 [@name]（方括号包裹）与 @name（裸词，字母数字_-，中文亦算）
const MENTION_RE = /\[@([^\]\s]+)\]|@([A-Za-z0-9_-]+|[一-龥][A-Za-z0-9_一-龥-]*)/g

/**
 * 解析文本中的 @mention。返回按起点排序的 Mention[]。
 * isAgent(name) 由调用方注入（按 agentRoster 判 agent 身份）；
 * 命中 agent 关键字或 isAgent 为真 → agent；'squad' → squad；其余 → member。
 */
export function parseMentions(text: string, isAgent: (name: string) => boolean): Mention[] {
  if (!text) return []
  const out: Mention[] = []
  let m: RegExpExecArray | null
  MENTION_RE.lastIndex = 0
  while ((m = MENTION_RE.exec(text))) {
    const name = (m[1] ?? m[2] ?? '').trim()
    if (!name) continue
    const lower = name.toLowerCase()
    const kind: MentionKind = lower === 'squad' ? 'squad' : AGENT_KEYWORDS.has(lower) || isAgent(name) ? 'agent' : 'member'
    out.push({ kind, name, start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** 是否含 agent/squad 触发（分发门：无则不 enqueue run） */
export function hasAgentTrigger(mentions: readonly Mention[]): boolean {
  return mentions.some((m) => m.kind === 'agent' || m.kind === 'squad')
}
