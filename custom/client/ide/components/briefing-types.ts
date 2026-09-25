// custom/client/ide/components/briefing-types.ts
// 任务简报面板（TaskBriefingPanel）的入参类型。<script setup> 不可 export，
// 类型集中在此供面板 / IdeShell / 测试共享。
export interface BriefingTask {
  id: string
  title: string
  status: string
  priority?: number
  assignee?: string | null
  body?: string | null
  /** C3 结构化 RACI（kanban raci 字段/建卡写入）；缺失时回退正文解析 */
  raci?: Partial<BriefingRaci> | null
}

export interface BriefingRaci {
  responsible: string[]
  approver: string[]
  consulted: string[]
  informed: string[]
}

export interface BriefingGit {
  branch?: string | null
  worktreePath?: string | null
  commits: { hash: string; subject: string; at?: number }[]
}

export interface BriefingWorkflow {
  stage: string
  parentIds: string[]
  childIds: string[]
  blocked: boolean
  retryCount: number
}

export interface BriefingCollabMessage {
  sender: string
  excerpt: string
  at?: number
}

export interface BriefingRecap {
  summary: string
  decisions: string[]
  blockers: string[]
  todos: string[]
}

/** 辅助会话追问组装：带任务上下文前缀发往主会话（同 IdeTaskContextBar assistant 模式） */
export function buildAuxMessage(task: BriefingTask | null | undefined, text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const head = task ? `【任务简报·${task.id}】` : '【任务简报】'
  return `${head} ${trimmed}`
}

/**
 * RACI 回退解析：卡片无结构化 RACI 字段时，从 assignee 与正文行提取。
 * aipaydev 推演实卡两种形态（简报曾展示 R:—·A:— 而正文其实写明）：
 *   ① 排期卡正文「- 责任人：chen ｜ 类型：开发 ｜ …」
 *   ② 派单式正文「责任人: @lin:matrix.test 的 AI 助理（@lin-agent…），团队负责人 @wei:matrix.test…」
 * 解析保守：只认行首「责任人/团队负责人/咨询/通知/发起方」标签；取 @mention
 * （去域名）或紧随标签的英文短名；-agent 后缀保留（协作账号语义）。
 */
export function parseRaciFromTask(task: BriefingTask | null | undefined): BriefingRaci {
  const empty: BriefingRaci = { responsible: [], approver: [], consulted: [], informed: [] }
  if (!task) return empty
  // C3 结构化优先：① kanban raci 字段（根治，schema 落地后直读）② body-JSON raci（既有
  // parseRACIFields 约定，见 overlay/custom/server/services/kanban/raci-dispatch.ts）③ 正则兜底。
  const merge = (r: Partial<BriefingRaci> | null | undefined): BriefingRaci | null => {
    if (!r) return null
    const out = { responsible: [...(r.responsible ?? [])], approver: [...(r.approver ?? [])], consulted: [...(r.consulted ?? [])], informed: [...(r.informed ?? [])] }
    return (out.responsible.length || out.approver.length || out.consulted.length || out.informed.length) ? out : null
  }
  const structured = merge(task.raci)
  if (structured) return structured
  try {
    const parsed = JSON.parse(task.body ?? '')
    const bodyRaci = merge(parsed?.raci ?? parsed?.meta?.raci)
    if (bodyRaci) return bodyRaci
  } catch { /* body 非 JSON，走正则兜底 */ }
  const body = task.body ?? ''
  const pickWord = (seg: string): string | undefined => {
    const mention = seg.match(/@([A-Za-z][\w.-]*)/)
    return mention ? mention[1] : seg.trim().match(/^[A-Za-z][\w.-]*/)?.[0]
  }
  // 值段=标签后到首个分隔符（，,｜|换行）；派单式正文两类标签常同行，
  // 故不做行首锚定。label 前的 skipPrefix 用可选前缀捕获组排除复合标签
  // （「团队责任人」不算独立「责任人」），与原负向后顾 lookbehind（排除「团队」前缀，
  // 见 git 历史）同语义——lookbehind 在 Safari <16.4 构造 RegExp 会抛 SyntaxError，不能用。
  const labeled = (label: string, skipPrefix = ''): string[] => {
    const re = new RegExp(`(${skipPrefix})?${label}[：:]?\\s*([^，,｜|\\n]+)`, 'g')
    const out: string[] = []
    for (const m of body.matchAll(re)) {
      if (m[1]) continue
      const word = pickWord(m[2] ?? '')
      if (word) out.push(word)
    }
    return out
  }
  const responsible = task.assignee?.trim() ? [task.assignee.trim()] : labeled('责任人', '团队')
  const approver = labeled('团队负责人')
  const consulted = labeled('咨询')
  const informed = [...labeled('通知'), ...labeled('发起方')]
  return { responsible, approver, consulted, informed }
}
