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

/** 去掉尾随句号：'@zcode.' 是句尾标点不是名字的一部分（'@zcode.' → 'zcode'）。 */
const TRAILING_DOTS = /\.+$/

/**
 * 解析 @mention：@word / @word-word / @squad/name（按出现顺序去重）。裸 @ 不匹配。
 * 词中/邮箱形态不当 mention：@ 前一字符是 [A-Za-z0-9._%+-] 时跳过（'a@b.com'、'x@y'）。
 */
export function parseMentions(text: string): MentionToken[] {
  const out: MentionToken[] = []
  const seen = new Set<string>()
  const re = /@squad\/([A-Za-z0-9][A-Za-z0-9._-]*)|@([A-Za-z0-9][A-Za-z0-9._-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    // 邮箱/词中形态过滤：'联系 a@b.com' 的 '@b.com' 不是 mention
    const prev = m.index > 0 ? text[m.index - 1] : ''
    if (/[A-Za-z0-9._%+-]/.test(prev)) continue
    if (m[1] !== undefined) {
      const target = m[1].replace(TRAILING_DOTS, '')
      const key = `squad/${target}`
      if (!seen.has(key)) { seen.add(key); out.push({ raw: m[0].replace(TRAILING_DOTS, ''), target, kind: 'squad' }) }
    } else if (m[2] !== undefined) {
      const target = m[2].replace(TRAILING_DOTS, '')
      if (!seen.has(target)) { seen.add(target); out.push({ raw: m[0].replace(TRAILING_DOTS, ''), target, kind: 'agent' }) }
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
  /** 派单发起者（@squad 自触发抑制判定用；缺省视为系统发起不禁停）。 */
  mentionAuthor?: string
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
  private readonly mentionAuthor: string | undefined
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
    this.mentionAuthor = opts.mentionAuthor
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

  /**
   * 释放 pending 槽（管理面/测试用）。幂等。
   * 现状：暂无生产调用方，pending 槽只靠 TTL（默认 30 分钟）到期释放。没有接会话
   * 生命周期自动释放的依据：投影事件面（session-projection.ts ProjectionEvent）只有
   * session.upserted / session.removed / conversation.frame / projection.status，没有
   * run 完成或 phase 信号——session.removed 表示会话消失而非 run 结束，接上去会在 run
   * 进行中误放槽（后续 @mention 会另起 run 并发写同一工作区）。等会话生命周期暴露
   * 明确的 run 完成事件再接线，不臆造事件名。
   */
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
      // squad leader 协议（multica P0 吸收，squad-protocol.ts）：选人是 leader 职责，
      // 派单只发 leader；自触发抑制；派单即记一条 no_action 评估占位（leader 轮必录
      // verdict 覆盖它——"每轮必录"从派单侧就有账）。
      const { resolveSquad, isSelfTrigger, buildSquadBriefing, recordEvaluation } = await import('./squad-protocol')
      const squad = resolveSquad(token.target)
      if (!squad) {
        return emit({ type: 'mention.outcome', ...base, reason: 'target_unavailable', detail: `未知 squad：${token.target}` })
      }
      if (this.mentionAuthor && isSelfTrigger(squad, this.mentionAuthor)) {
        return emit({ type: 'mention.outcome', ...base, reason: 'self_trigger_suppressed', detail: `leader ${squad.leader} @ 自己的 squad，不再触发` })
      }
      // leader 直派：同实例走 dispatchOne（token 直传不重解析文本——简报里的
      // @成员名 是给 leader 的指引不是触发）；known/deferred 档对 leader 同样生效
      // （非 zcode leader 如实回 deferred 走旧链）；单 pending 槽与 @leader 同实例共享。
      const briefing = buildSquadBriefing(token.target, squad, params.text)
      recordEvaluation({ squad: token.target, leader: squad.leader, verdict: 'no_action', reason: '派单占位：待 leader 首轮 verdict 覆盖', at: this.now() })
      try {
        const leaderOutcome = await this.dispatchOne(
          { workspacePath: params.workspacePath, text: briefing.prompt },
          { raw: `@${squad.leader}`, target: squad.leader, kind: 'agent' },
        )
        return { ...leaderOutcome, target: `${token.target}(leader:${squad.leader})`, detail: `[squad] ${leaderOutcome.detail ?? ''}` }
      } catch (err) {
        return emit({ type: 'mention.outcome', ...base, reason: 'engine_unreachable', detail: `[squad] leader 派发失败：${err instanceof Error ? err.message : String(err)}` })
      }
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
      // 并入活跃 run：文本必须真的投递给既有会话（sendText 信封），否则用户以为送达实际丢失。
      // 投递失败如实标注未送达，不计入追加条数。
      const commandId = uuidV7Like()
      let undelivered: string | null = null
      try {
        const result = await this.engine.sendCommand({
          workspacePath: params.workspacePath,
          envelope: {
            commandId,
            clientId: this.clientId,
            sessionId: existing.sessionId,
            type: 'sendText',
            payload: { text: params.text, requestedDelivery: 'startNow' },
            issuedAt: this.now(),
          },
        })
        if (result.status && result.status !== 'accepted' && result.status !== 'ok') {
          undelivered = `status=${result.status}${result.reasonCode ? ` reasonCode=${result.reasonCode}` : ''}`
        }
      } catch (err) {
        undelivered = err instanceof Error ? err.message : String(err)
      }
      if (undelivered === null) existing.coalesced.push(params.text)
      return emit({
        type: 'mention.outcome', ...base, reason: 'coalesced', sessionId: existing.sessionId, commandId,
        detail: undelivered === null
          ? `并入活跃 run（已投递，追加 ${existing.coalesced.length} 条）`
          : `并入活跃 run 但文本未送达（${undelivered}）`,
      })
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
