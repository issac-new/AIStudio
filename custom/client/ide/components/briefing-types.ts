// custom/client/ide/components/briefing-types.ts
// 任务简报面板（TaskBriefingPanel）的入参类型。<script setup> 不可 export，
// 类型集中在此供面板 / IdeShell / 测试共享。
/** P3.2 上下文文件（2026-09-28 §四）：任务简报的关键文档（需求/概设/排期等） */
export interface BriefingContextFile {
  /** workspace 相对路径 */
  path: string
  /** 展示标题（缺省用路径 basename） */
  title?: string
  /** 归类（需求/设计/排期/其他） */
  kind?: 'req' | 'design' | 'schedule' | 'doc'
}

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

/** 研发进度（引擎侧，进度可感知链·件 2c）：任务卡的编码引擎阶段时间线 */
export interface BriefingEngineProgress {
  /** 当前 workflow 站点（引擎 phase 名） */
  currentPhase?: string
  /** 站点时间线（pending/running/done/failed） */
  phases: { name: string; status: 'pending' | 'running' | 'done' | 'failed' }[]
  /** 引擎会话六态（running/completedSuccess/error…） */
  sessionPhase?: string
  /** 引擎目标状态（active/verifying/verified…） */
  goalStatus?: string
  active: boolean
  /** 会话面是否在位（冷窗=false：如实呈现「暂缺」不编造） */
  sessionKnown: boolean
  lastActivityAt?: number
  dispatchCount: number
  dispatchOkCount: number
  /** 技能侧里程碑时间线（引擎站点面缺席时的进度呈现） */
  milestones?: Array<{ ts: string; milestone: string; status?: string; note?: string }>
}

/** 任务会话块（关联轮，2026-10-18）：该任务会话的上下文信息（最新摘要+近期消息） */
export interface BriefingSessionBlock {
  sessionId: string | null
  source: string | null
  model: string | null
  startedAt: number | null
  endedAt: number | null
  summary: string | null
  messages: Array<{ role: string; content: string; timestamp: number | null }>
}

/** 任务 workspace 关联态（patch 658 端点解析结果的展示面子集） */
export interface BriefingWorkspaceInfo {
  kind: string | null
  path: string | null
  materialized: boolean
  branch: string | null
  note: 'ok' | 'predicted_scratch' | 'no_workspace' | 'escape_refused'
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
    // 成员形状归一（2026-09-28 演示轮实锤）：结构化 raci 存量数据有字符串形
    // （RFD 主卡 responsible:"fanfan"）——直接展开会把字符串逐字拆成
    // ['f','a','n',…]，简报 R 行渲染成 "f, a, n…"。此处统一收数为数组。
    const toMembers = (v: unknown): string[] =>
      typeof v === 'string' ? [v.trim()].filter(Boolean)
        : Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean)
          : []
    const out = {
      responsible: toMembers(r.responsible),
      approver: toMembers(r.approver),
      consulted: toMembers(r.consulted),
      informed: toMembers(r.informed),
    }
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

/**
 * 任务上下文一键进会话（关联轮，2026-10-18）：任务卡面 + workspace 根 + 最新
 * 摘要组装成一条独立上下文消息，经简报「任务会话」块按钮发往当前会话
 * （chat.sendMessage 无活跃会话时自动建）。不自动注入——发送是用户显式动作；
 * 也不写文件进 workspace——worktree 型任务树被弄脏会阻断完成时的 worktree 回收
 * （kanban _cleanup_worktree_workspace 对 dirty 树拒绝回收）。
 */
export function buildTaskContextMessage(
  task: BriefingTask | null | undefined,
  opts?: { workspacePath?: string | null; summary?: string | null; branch?: string | null },
): string {
  if (!task) return ''
  const lines = [
    `【任务上下文·${task.id}】${task.title}`,
    `状态: ${task.status}${task.assignee ? ` · 负责人: ${task.assignee}` : ''}`,
  ]
  if (opts?.branch) lines.push(`分支: ${opts.branch}`)
  if (opts?.workspacePath) lines.push(`工作区根目录: ${opts.workspacePath}`)
  if (opts?.summary?.trim()) lines.push(`最新摘要: ${opts.summary.trim()}`)
  lines.push('——以上为该任务会话的背景信息，请基于此继续。')
  return lines.join('\n')
}

/** 任务工作区关联态 → i18n 键（关联轮）：物化=已关联；预测/无/异常如实分级 */
export function workspaceStateKey(info: BriefingWorkspaceInfo | null | undefined): string {
  if (!info) return ''
  if (info.materialized) return 'ide.briefing.workspaceLinked'
  if (info.note === 'predicted_scratch') return 'ide.briefing.workspacePredicted'
  if (info.note === 'no_workspace') return 'ide.briefing.workspaceNone'
  return 'ide.briefing.workspaceAbnormal'
}
