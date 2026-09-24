// overlay[zcode] R4-P3 · 第一批吸收 #7：@mention A2A 派单总线（最小面）。
//
// 吸收自 multica @mention 总线语义（docs/upstream-analysis/multica.md §3.1：
// 逐 mention 解析目标→鉴权→运行时就绪→pending 去重→每 mention 一条 dispatch
// outcome 带 reason code；评论即总线全程留痕）：
//   @<agent>   = 派发一次 zcode 引擎 run（createSession + sendText 命令）
//   @squad/<名> = P4 看板门禁轮接（现回答 deferred）
//   单 pending 槽：(workspace,agent) 活跃期间后续派单 → coalesced（文本并入，
//   不另起 run）——multica 单 pending 槽语义。
// outcome reason 全部走 dispatch-reasons.ts 词表；run 可追溯 = outcome 携带
// sessionId + commandId，并联动会话投影（watchSession）。
//
// 命令信封契约：upstream/zcode packages/shared/src/zcode-protocol-v4/command.ts:323
// commandEnvelopeSchema（commandId uuid v7 风格客户端生成、createSession 时
// sessionId=null、sendText payload={text,...}）。
import { randomUUID } from 'crypto'
import { coerceDispatchReasonCode, type DispatchReasonCode } from './dispatch-reasons'

export interface MentionToken {
  raw: string
  target: string
  kind: 'agent' | 'squad'
}

/** 解析 @mention：@word / @word-word / @squad/name（按出现顺序去重）。裸 @ 不匹配。 */
export function parseMentions(text: string): MentionToken[] {
  const out: MentionToken[] = []
  const seen = new Set<string>()
  const re = /@squad\/([A-Za-z0-9][A-Za-z0-9._-]*)|@([A-Za-z0-9][A-Za-z0-9._-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) {
      const key = `squad/${m[1]}`
      if (!seen.has(key)) { seen.add(key); out.push({ raw: m[0], target: m[1], kind: 'squad' }) }
    } else if (m[2] !== undefined) {
      if (!seen.has(m[2])) { seen.add(m[2]); out.push({ raw: m[0], target: m[2], kind: 'agent' }) }
    }
  }
  return out
}

export interface DispatchEnginePort {
  probe(): Promise<boolean>
  createSession(params: { workspacePath: string }): Promise<{ session: { sessionId: string } }>
  sendCommand(params: { workspacePath: string; envelope: Record<string, unknown> }): Promise<{ status: string; reasonCode?: string }>
}

export interface MentionOutcome {
  type: 'mention.outcome'
  workspaceId: string
  target: string
  mentionKind: 'agent' | 'squad'
  reason: DispatchReasonCode
  detail?: string
  sessionId?: string
  commandId?: string
  at: number
}

export interface MentionDispatchOptions {
  engine: DispatchEnginePort
  clientId: string
  /** 可派发 agent 名单（默认 ['zcode']；非名单内 → target_unavailable）。 */
  knownAgents?: string[]
  /** 已知名单内但非 zcode 引擎的 agent → deferred（P5 吸收后并入本总线）。 */
  deferredAgents?: string[]
  /** pending 槽 TTL ms（默认 30 分钟；到点释放允许重新派发）。 */
  pendingTtlMs?: number
  now?: () => number
  onOutcome?: (outcome: MentionOutcome) => void
}

interface PendingRun {
  sessionId: string
  since: number
  coalesced: string[]
}

export class MentionDispatchService {
  private readonly engine: DispatchEnginePort
  private readonly clientId: string
  private readonly known: Set<string>
  private readonly deferred: Set<string>
  private readonly pendingTtlMs: number
  private readonly now: () => number
  private readonly onOutcome: (o: MentionOutcome) => void
  private readonly pending = new Map<string, PendingRun>()

  constructor(opts: MentionDispatchOptions) {
    this.engine = opts.engine
    this.clientId = opts.clientId
    this.known = new Set(opts.knownAgents ?? ['zcode'])
    this.deferred = new Set(opts.deferredAgents ?? [])
    // deferred = 「已知名单内但走旧链」——隐含已知，命中 deferred 分支而非 target_unavailable。
    for (const d of this.deferred) this.known.add(d)
    this.pendingTtlMs = opts.pendingTtlMs ?? 30 * 60_000
    this.now = opts.now ?? Date.now
    this.onOutcome = opts.onOutcome ?? (() => {})
  }

  /**
   * 派单入口：逐 mention 产出 outcome（multica 语义：每个 mention 一条，
   * 部分失败不影响其余）。无 mention 返回空数组。
   */
  async dispatch(params: { workspacePath: string; text: string }): Promise<MentionOutcome[]> {
    const tokens = parseMentions(params.text)
    const outcomes: MentionOutcome[] = []
    for (const token of tokens) {
      outcomes.push(await this.dispatchOne(params, token))
    }
    return outcomes
  }

  /** 释放 pending 槽（投影侧 sessionEnded/removed 联动或管理面）。幂等。 */
  releaseRun(workspacePath: string, agent: string): boolean {
    return this.pending.delete(this.slotKey(workspacePath, agent))
  }

  pendingSnapshot(): Array<{ workspacePath: string; agent: string; sessionId: string; since: number; coalescedCount: number }> {
    return [...this.pending.entries()].map(([key, run]) => {
      const [workspacePath, agent] = key.split('::')
      return { workspacePath, agent, sessionId: run.sessionId, since: run.since, coalescedCount: run.coalesced.length }
    })
  }

  private slotKey(workspacePath: string, agent: string): string {
    return `${workspacePath}::${agent}`
  }

  private async dispatchOne(params: { workspacePath: string; text: string }, token: MentionToken): Promise<MentionOutcome> {
    const base = { workspaceId: params.workspacePath, target: token.target, mentionKind: token.kind, at: this.now() }
    const emit = (o: MentionOutcome) => { this.onOutcome(o); return o }

    if (token.kind === 'squad') {
      return emit({ type: 'mention.outcome', ...base, reason: 'deferred', detail: '@squad 派单走看板门禁链（P4 接线）' })
    }
    if (!this.known.has(token.target)) {
      return emit({ type: 'mention.outcome', ...base, reason: 'target_unavailable', detail: `未知 agent：${token.target}` })
    }
    if (this.deferred.has(token.target)) {
      return emit({ type: 'mention.outcome', ...base, reason: 'deferred', detail: '非 zcode 引擎 agent 走 hermes 旧链（P5 后并入）' })
    }

    const key = this.slotKey(params.workspacePath, token.target)
    const existing = this.pending.get(key)
    if (existing && this.now() - existing.since < this.pendingTtlMs) {
      existing.coalesced.push(params.text)
      return emit({ type: 'mention.outcome', ...base, reason: 'coalesced', sessionId: existing.sessionId, detail: `并入活跃 run（追加 ${existing.coalesced.length} 条）` })
    }
    if (existing) this.pending.delete(key) // TTL 过期，重派

    let online: boolean
    try {
      online = await this.engine.probe()
    } catch {
      online = false
    }
    if (!online) {
      return emit({ type: 'mention.outcome', ...base, reason: 'runtime_offline', detail: 'zcode 引擎（:3030）不可达，稍后重派或先起引擎' })
    }

    let sessionId: string
    try {
      const created = await this.engine.createSession({ workspacePath: params.workspacePath })
      sessionId = created.session.sessionId
    } catch (err) {
      return emit({ type: 'mention.outcome', ...base, reason: 'engine_unreachable', detail: `createSession: ${err instanceof Error ? err.message : String(err)}` })
    }

    const commandId = uuidV7Like()
    try {
      const result = await this.engine.sendCommand({
        workspacePath: params.workspacePath,
        envelope: {
          commandId,
          clientId: this.clientId,
          sessionId,
          type: 'sendText',
          payload: { text: params.text, requestedDelivery: 'startNow' },
          issuedAt: this.now(),
        },
      })
      if (result.status && result.status !== 'accepted' && result.status !== 'ok') {
        return emit({
          type: 'mention.outcome', ...base, reason: 'command_rejected',
          sessionId, commandId,
          detail: `status=${result.status}${result.reasonCode ? ` reasonCode=${result.reasonCode}` : ''}`,
        })
      }
    } catch (err) {
      return emit({ type: 'mention.outcome', ...base, reason: 'command_rejected', sessionId, commandId, detail: err instanceof Error ? err.message : String(err) })
    }

    this.pending.set(key, { sessionId, since: this.now(), coalesced: [] })
    return emit({ type: 'mention.outcome', ...base, reason: 'queued', sessionId, commandId, detail: 'run 已派发（createSession+sendText）' })
  }
}

/** uuid v7 风格：时间戳前缀 + 随机尾（命令幂等键；客户端生成，重试不变由调用方保证）。 */
export function uuidV7Like(): string {
  const ts = Date.now().toString(16).padStart(12, '0')
  const rand = randomUUID().replace(/-/g, '').slice(0, 20)
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 20)}`
}
