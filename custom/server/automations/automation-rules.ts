// overlay/automations 域（A2，2026-09-29）：IDE Automations 事件触发纯核。
//
// 吸收自 Manus 2.0 Automations 语义（事件驱动自动化：描述「看住什么、出现什么
// 就做什么」；docs/2026-09-29-manus2-opencode2-ide-workbench-research.md §A2）：
// 规则 = 事件源过滤 + 去抖窗口 + 任务简报模板；事件源四类（file/kanban/git/webhook）。
// 本层纯函数：规则校验 / 事件匹配 / 简报渲染。状态面（去抖计时器、watcher、
// 派发）在 automation-engine.ts；REST 在 controllers/ide/automations.ts。
//
// 防注入边界（与 kanban column-dispatch 同一威胁模型）：
// - agent 限词表（仅 zcode——单机形态引擎族，防额外 mention 注入面）；
// - promptTemplate 是工作台内自作者配置（非外部输入），但仍限长；
// - 事件数据（路径/列名/commit subject/webhook detail）是外部输入：拼进简报前
//   全角化 @（mention 解析器不再识别）、限长、去控制字符。简报经 @mention 总线
//   派发（mention-dispatch.parseMentions 只认半角 @word）。
import { randomUUID } from 'crypto'

/** 事件源词表（Manus Automations 触发源收敛到本机可产的四面）。 */
export const AUTOMATION_SOURCE_TYPES = ['file', 'kanban', 'git', 'webhook'] as const
export type AutomationSourceType = (typeof AUTOMATION_SOURCE_TYPES)[number]

/** 派发目标词表：单机形态仅 zcode 引擎族（与 kanban AUTOMATION_PROVIDERS 同一收敛）。 */
export const AUTOMATION_AGENTS = ['zcode'] as const
export type AutomationAgent = (typeof AUTOMATION_AGENTS)[number]

export const RULE_NAME_MAX = 64
export const TEMPLATE_MAX = 2000
export const DEBOUNCE_MIN_MS = 200
export const DEBOUNCE_MAX_MS = 60_000
export const DEBOUNCE_DEFAULT_MS = 2_000
/** 事件数据字符串拼入简报前的限长（每条）。 */
const EVENT_STR_MAX = 200
/** 单次去抖窗口内合并的事件上限（超出丢弃并记 truncation 标记）。 */
export const EVENTS_PER_FLUSH_MAX = 50

export interface AutomationSourceFilter {
  type: AutomationSourceType
  /** file：通配模式（* 段内任意、** 跨段任意），如 'src/api/**.ts'；空=全匹配 */
  pathPattern?: string
  /** kanban：board 过滤；空=任意 */
  board?: string
  /** kanban：进入该列触发（to 列名）；空=任意列 */
  toColumn?: string
  /** git：ref 过滤（'main' 或 'refs/heads/main'，尾段匹配）；空=任意 */
  ref?: string
  /** webhook：source 过滤；空=任意 */
  source?: string
  /** webhook：eventType 过滤；空=任意 */
  eventType?: string
}

export interface AutomationRule {
  id: string
  name: string
  enabled: boolean
  workspacePath: string
  source: AutomationSourceFilter
  /** 去抖窗口（毫秒）：窗口内事件合并为一次派发（尾部边缘）。 */
  debounceMs: number
  agent: AutomationAgent
  /** 任务简报模板：占位符 {{paths}} {{events}} {{workspace}}。 */
  promptTemplate: string
  createdAt: string
}

export type AutomationEvent =
  | { type: 'file'; workspacePath: string; path: string }
  | { type: 'kanban'; workspacePath: string; board: string; taskId: string; from: string; to: string }
  | { type: 'git'; workspacePath: string; ref: string; commits: Array<{ sha: string; subject: string }> }
  | { type: 'webhook'; workspacePath: string; source: string; eventType: string; detail?: string }

export interface RuleValidationErrors { [field: string]: string }

/**
 * 规则校验（REST 400 依据）。返回 null=合法；否则字段级错误表。
 * workspacePath 必须绝对路径（watcher/poller 挂载与派发都以它为根）。
 */
export function validateRuleInput(input: unknown): { rule: AutomationRule } | { errors: RuleValidationErrors } {
  const errors: RuleValidationErrors = {}
  const raw = (input ?? {}) as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name || name.length > RULE_NAME_MAX) errors.name = `名称必填且 ≤${RULE_NAME_MAX} 字符`

  const workspacePath = typeof raw.workspacePath === 'string' ? raw.workspacePath.trim() : ''
  if (!workspacePath.startsWith('/')) errors.workspacePath = 'workspacePath 必须是绝对路径'

  const sourceRaw = (raw.source ?? {}) as Record<string, unknown>
  const type = sourceRaw.type
  if (typeof type !== 'string' || !(AUTOMATION_SOURCE_TYPES as readonly string[]).includes(type)) {
    errors.source = `source.type 必须是 ${AUTOMATION_SOURCE_TYPES.join(' / ')} 之一`
  }
  const pathPattern = typeof sourceRaw.pathPattern === 'string' ? sourceRaw.pathPattern.trim() : ''
  if (pathPattern.length > 500) errors.pathPattern = 'pathPattern ≤500 字符'

  const promptTemplate = typeof raw.promptTemplate === 'string' ? raw.promptTemplate.trim() : ''
  if (!promptTemplate || promptTemplate.length > TEMPLATE_MAX) {
    errors.promptTemplate = `任务模板必填且 ≤${TEMPLATE_MAX} 字符`
  }

  const debounceRaw = typeof raw.debounceMs === 'number' ? raw.debounceMs : DEBOUNCE_DEFAULT_MS
  if (!Number.isFinite(debounceRaw) || debounceRaw < DEBOUNCE_MIN_MS || debounceRaw > DEBOUNCE_MAX_MS) {
    errors.debounceMs = `去抖窗口须在 ${DEBOUNCE_MIN_MS}-${DEBOUNCE_MAX_MS}ms`
  }

  const agent = typeof raw.agent === 'string' && (AUTOMATION_AGENTS as readonly string[]).includes(raw.agent)
    ? raw.agent
    : null
  if (raw.agent != null && !agent) errors.agent = `agent 限词表 ${AUTOMATION_AGENTS.join(' / ')}`

  if (Object.keys(errors).length > 0) return { errors }

  const rule: AutomationRule = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : randomUUID(),
    name,
    enabled: raw.enabled !== false,
    workspacePath,
    source: {
      type: type as AutomationSourceType,
      ...(pathPattern ? { pathPattern } : {}),
      ...(typeof sourceRaw.board === 'string' && sourceRaw.board.trim() ? { board: sourceRaw.board.trim() } : {}),
      ...(typeof sourceRaw.toColumn === 'string' && sourceRaw.toColumn.trim() ? { toColumn: sourceRaw.toColumn.trim() } : {}),
      ...(typeof sourceRaw.ref === 'string' && sourceRaw.ref.trim() ? { ref: sourceRaw.ref.trim() } : {}),
      ...(typeof sourceRaw.source === 'string' && sourceRaw.source.trim() ? { source: sourceRaw.source.trim() } : {}),
      ...(typeof sourceRaw.eventType === 'string' && sourceRaw.eventType.trim() ? { eventType: sourceRaw.eventType.trim() } : {}),
    },
    debounceMs: Math.round(debounceRaw),
    agent: (agent ?? AUTOMATION_AGENTS[0]) as AutomationAgent,
    promptTemplate,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  }
  return { rule }
}

/** 简单通配：* 段内任意（不含 /）、** 跨段任意；其余按字面。空模式=全匹配。 */
export function matchPathPattern(pattern: string, path: string): boolean {
  if (!pattern) return true
  const re = new RegExp('^'
    + pattern
      .split(/(\*\*|\*)/)
      .map((seg) => {
        if (seg === '**') return '.*'
        if (seg === '*') return '[^/]*'
        return seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      })
      .join('')
    + '$')
  return re.test(path)
}

/** git ref 尾段匹配：规则 'main' 匹配事件 'refs/heads/main'；全字面也匹配。 */
function matchRef(ruleRef: string | undefined, eventRef: string): boolean {
  if (!ruleRef) return true
  return eventRef === ruleRef || eventRef.endsWith('/' + ruleRef)
}

/** 事件是否命中规则（源类型 + workspace + 各源过滤字段）。 */
export function matchEvent(rule: AutomationRule, event: AutomationEvent): boolean {
  if (!rule.enabled) return false
  if (rule.source.type !== event.type) return false
  if (rule.workspacePath !== event.workspacePath) return false
  switch (event.type) {
    case 'file':
      return matchPathPattern(rule.source.pathPattern ?? '', event.path)
    case 'kanban':
      return (!rule.source.board || rule.source.board === event.board)
        && (!rule.source.toColumn || rule.source.toColumn === event.to)
    case 'git':
      return matchRef(rule.source.ref, event.ref)
    case 'webhook':
      return (!rule.source.source || rule.source.source === event.source)
        && (!rule.source.eventType || rule.source.eventType === event.eventType)
  }
}

/** 外部事件数据清洗：全角化 @（mention 防注入）+ 限长 + 去控制字符。 */
export function sanitizeEventText(value: string): string {
  return value
    .replace(/@/g, '＠')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, EVENT_STR_MAX)
}

function describeEvent(event: AutomationEvent): string {
  switch (event.type) {
    case 'file':
      return `文件变更：${sanitizeEventText(event.path)}`
    case 'kanban':
      return `看板流转：${sanitizeEventText(event.board)} #${sanitizeEventText(event.taskId)} ${sanitizeEventText(event.from)} → ${sanitizeEventText(event.to)}`
    case 'git':
      return event.commits.slice(0, 10).map((c) => `提交 ${sanitizeEventText(c.sha.slice(0, 8))}：${sanitizeEventText(c.subject)}`).join('\n')
    case 'webhook':
      return `Webhook ${sanitizeEventText(event.source)}/${sanitizeEventText(event.eventType)}${event.detail ? '：' + sanitizeEventText(event.detail) : ''}`
  }
}

/** 事件摘要（file 类供 {{paths}} 占位）。 */
export function eventPaths(events: AutomationEvent[]): string {
  return events
    .filter((e): e is Extract<AutomationEvent, { type: 'file' }> => e.type === 'file')
    .map((e) => sanitizeEventText(e.path))
    .join('、')
}

export interface RenderedBriefing { text: string; truncated: boolean }

/**
 * 简报渲染：@agent 路由头（mention 总线派发）+ 模板占位符替换 + 事件数据块。
 * 事件超 EVENTS_PER_FLUSH_MAX 丢弃并置 truncated（引擎层在简报尾注记）。
 */
export function renderBriefing(rule: AutomationRule, events: AutomationEvent[]): RenderedBriefing {
  const bounded = events.slice(0, EVENTS_PER_FLUSH_MAX)
  const truncated = events.length > bounded.length
  const detail = bounded.map(describeEvent).join('\n')
  const body = rule.promptTemplate
    .replaceAll('{{paths}}', eventPaths(bounded) || '（无文件路径）')
    .replaceAll('{{events}}', detail)
    .replaceAll('{{workspace}}', sanitizeEventText(rule.workspacePath))
  const lines = [
    // 路由头半角 @：mention 总线派发依据。安全边界=目标来自封闭词表 AUTOMATION_AGENTS，
    // 全文其余位置（事件数据/规则名）已全角化 @，不会被解析成第二个 mention。
    `@${rule.agent} [自动化触发] ${sanitizeEventText(rule.name)}（${rule.source.type} 源，${bounded.length} 个事件合并）`,
    '',
    body,
    '',
    '事件数据：',
    detail,
  ]
  if (truncated) lines.push(`（事件过多，仅合并前 ${EVENTS_PER_FLUSH_MAX} 条）`)
  return { text: lines.join('\n'), truncated }
}
