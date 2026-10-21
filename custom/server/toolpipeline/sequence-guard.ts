// overlay/toolpipeline 域：会话级数据流护栏（2026-10-21 AGT 调研轮二）。
//
// 补微软 AGT 承认的头号空白「治理的是动作，不是推理」：单调用级执法看不见
// 链——读凭证合规、发消息合规，连起来就是外泄。本钩子在会话维度维护敏感污点：
// 触碰敏感内容即记账；窗口内外发面调用被拒（入参直含敏感内容同拒）。
//
// 挂载：ekkoToolExecuteHooks 链尾——瀑布首个 {allow:false} 短路（patch 565），
// 故只有真正会执行的调用才记账。总闸 HERMES_TOOL_SEQUENCE_GUARD=1 才生效
// （缺省 0=零行为变化，同执法门先例）；内部异常 fail-closed（执法链纪律）。
// 状态仅进程内（重启清零=窗口收紧，方向安全）；不落参数值，只落工具名+时刻。
import { toolCategoryOf } from './enforce-gate'
import { appendPolicyDecision } from './policy-decisions'

export type SequenceGuardRule = 'sequence-sensitive-send' | 'sequence-taint-deny'

export interface SequenceGuardVerdict {
  /** block=true 时钩子返回 {allow:false}。 */
  block: boolean
  rule?: SequenceGuardRule
  /** 敏感触碰记账（block=false 时可能同时记账）。 */
  marked?: boolean
  reason?: string
}

const DEFAULT_SENSITIVE = '(?:\\.ssh/|\\.aws/credentials|id_rsa|id_ed25519|\\.env(?:\\b|$)|\\.npmrc|\\.netrc|secrets?\\.(?:json|ya?ml|txt)|credentials?)'
const SINK_VERB_RE = /(?:send|publish|upload|post|commit|push|notify|webhook)/i

let sensitiveCache: { src: string; re: RegExp | null } | null = null

function sensitiveRegex(): RegExp | null {
  const src = process.env.HERMES_TOOL_SEQUENCE_SENSITIVE?.trim() || DEFAULT_SENSITIVE
  if (sensitiveCache?.src === src) return sensitiveCache.re
  let re: RegExp | null = null
  try {
    re = new RegExp(src, 'i')
  } catch {
    re = null // 配坏正则=敏感面判定不可信，护栏按无敏感面处理（总闸仍开着，如实拒外发直含敏感? 不——面不可判即不拦，见 fail 注释）
  }
  sensitiveCache = { src, re }
  return re
}

function extraSinks(): string[] {
  return (process.env.HERMES_TOOL_SEQUENCE_SINKS ?? '')
    .split(/[:,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function sinkPatternMatch(pattern: string, tool: string): boolean {
  return pattern.endsWith('*') ? tool.startsWith(pattern.slice(0, -1)) : tool === pattern
}

/** 外发面：network 类（浏览器交互/委托）∪ MCP 动态工具外发动词 ∪ env 追加模式。 */
export function isExternalSink(tool: string): boolean {
  if (toolCategoryOf(tool) === 'network') return true
  if (tool.startsWith('mcp__')) {
    const rest = tool.slice('mcp__'.length)
    if (SINK_VERB_RE.test(rest)) return true
  }
  return extraSinks().some((p) => sinkPatternMatch(p, tool))
}

/** 入参值文本（与 toolpolicy.policyArgText 同款口径：只取值不取键名）。 */
function argTextOf(input: Record<string, unknown>): string {
  const values: string[] = []
  const walk = (v: unknown, depth: number): void => {
    if (values.length >= 40) return
    if (typeof v === 'string') values.push(v.slice(0, 1000))
    else if (typeof v === 'number' || typeof v === 'boolean') values.push(String(v))
    else if (Array.isArray(v) && depth < 2) {
      for (const item of v.slice(0, 20)) walk(item, depth + 1)
    } else if (v && typeof v === 'object' && depth < 2) {
      for (const item of Object.values(v as Record<string, unknown>).slice(0, 20)) walk(item, depth + 1)
    }
  }
  walk(input, 0)
  return values.join(' ').slice(0, 2000)
}

export function isSensitiveContent(input: Record<string, unknown>): boolean {
  const re = sensitiveRegex()
  return !!re && re.test(argTextOf(input))
}

interface TaintRecord {
  at: number
  tool: string
}

const MAX_SESSIONS = 500

function ttlMs(): number {
  const v = Number(process.env.HERMES_TOOL_SEQUENCE_TTL_MS)
  return Number.isFinite(v) && v > 0 ? v : 30 * 60_000
}

/** 会话污点表（进程内）。测试注入 now。 */
export class SequenceTaintTable {
  private readonly sessions = new Map<string, TaintRecord>()

  mark(sessionKey: string, tool: string, now: number): void {
    this.sessions.set(sessionKey, { at: now, tool })
    if (this.sessions.size > MAX_SESSIONS) {
      let oldestKey = ''
      let oldestAt = Infinity
      for (const [key, rec] of this.sessions) {
        if (rec.at < oldestAt) { oldestAt = rec.at; oldestKey = key }
      }
      if (oldestKey) this.sessions.delete(oldestKey)
    }
  }

  /** 窗口内最近一次敏感触碰（过期/无记录返回 null，并顺手清过期）。 */
  activeTaint(sessionKey: string, now: number): TaintRecord | null {
    const rec = this.sessions.get(sessionKey)
    if (!rec) return null
    if (now - rec.at > ttlMs()) {
      this.sessions.delete(sessionKey)
      return null
    }
    return rec
  }

  size(): number {
    return this.sessions.size
  }
}

/** 判定核心（纯函数 + 注入表，测试面）。顺序：直发拒 → 污点拒 → 触碰记账放行。 */
export function evaluateSequence(
  table: SequenceTaintTable,
  sessionKey: string,
  tool: string,
  input: Record<string, unknown>,
  now: number,
): SequenceGuardVerdict {
  const sink = isExternalSink(tool)
  const sensitive = isSensitiveContent(input)
  if (sink && sensitive) {
    return {
      block: true,
      rule: 'sequence-sensitive-send',
      reason: `会话护栏：外发动作 ${tool} 的入参直接包含敏感内容（凭证/密钥面）——请人工确认可外发后移除敏感内容重试`,
    }
  }
  const taint = table.activeTaint(sessionKey, now)
  if (sink && taint) {
    const mins = Math.max(1, Math.round((now - taint.at) / 60_000))
    return {
      block: true,
      rule: 'sequence-taint-deny',
      reason: `会话护栏：本会话 ${mins} 分钟前触碰过敏感内容（来源工具 ${taint.tool}），本次外发动作 ${tool} 被拒——确认数据可外发后开新会话重试，或等窗口过期（${Math.round(ttlMs() / 60_000)} 分钟）`,
    }
  }
  if (!sink && sensitive) {
    table.mark(sessionKey, tool, now)
    return { block: false, marked: true }
  }
  return { block: false }
}

/** 会话键：sessionId 优先，回落 profileId；都缺席=无法定域，不执法（不猜会话边界）。 */
function sessionKeyOf(context?: { sessionId?: string; profileId?: string }): string | null {
  if (context?.sessionId) return `s:${context.sessionId}`
  if (context?.profileId) return `p:${context.profileId}`
  return null
}

const table = new SequenceTaintTable()

function emitGuardEvent(
  tool: string,
  sessionKey: string,
  rule: SequenceGuardRule,
  reason: string,
  context?: { profileId?: string; sessionId?: string; userId?: string },
): void {
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'security',
        severity: 'high',
        type: `tool.${rule}`,
        source: 'toolpipeline/sequence-guard',
        summary: `数据流护栏拦截 ${context?.profileId ? `profile ${context.profileId} 的 ` : ''}${tool}：${reason}`,
        refs: { ...(context?.profileId ? { profileId: context.profileId } : {}) },
        payload: { tool, rule, sessionKey },
      })
    })
    .catch(() => { /* fail-soft */ })
}

/** 护栏钩子（HERMES_TOOL_SEQUENCE_GUARD=1 生效；异常 fail-closed）。 */
export function sequenceGuardHook(): {
  preExecute: (name: string, input: Record<string, unknown>, context?: {
    profileId?: string; userId?: string; sessionId?: string; runId?: string
  }) => Promise<{ allow: false; error: string } | void>
} {
  return {
    async preExecute(name, input, context) {
      if (process.env.HERMES_TOOL_SEQUENCE_GUARD !== '1') return
      const sessionKey = sessionKeyOf(context)
      if (!sessionKey) return
      let verdict: SequenceGuardVerdict
      try {
        verdict = evaluateSequence(table, sessionKey, name, input, Date.now())
      } catch (e) {
        // 执法链 fail-closed：护栏自身故障不放行（总闸显式开启才走到这里）。
        const msg = e instanceof Error ? e.message : String(e)
        return { allow: false, error: `数据流护栏内部异常（fail-closed）：${msg}——可临时置 HERMES_TOOL_SEQUENCE_GUARD=0 排障` }
      }
      if (verdict.block && verdict.rule) {
        emitGuardEvent(name, sessionKey, verdict.rule, verdict.reason ?? '', context)
        appendPolicyDecision({
          tool: name,
          userId: context?.userId,
          profileId: context?.profileId,
          sessionId: context?.sessionId,
          runId: context?.runId,
          enforcing: true,
          allow: false,
          rule: verdict.rule,
          risk: 'high',
          reason: verdict.reason?.slice(0, 200),
        })
        return { allow: false, error: verdict.reason ?? '会话数据流护栏拒绝' }
      }
      return
    },
  }
}

/** 测试隔离：清空进程内污点表与正则缓存。 */
export function _resetSequenceGuardForTests(): void {
  (table as unknown as { sessions: Map<string, TaintRecord> }).sessions.clear()
  sensitiveCache = null
}
