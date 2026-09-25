// overlay[zcode] R4-P3 · 第一批吸收 #7：@mention A2A 派单总线（最小面）。
//
// 吸收自 multica @mention 总线语义（docs/upstream-analysis/multica.md §3.1：
// 逐 mention 解析目标→鉴权→运行时就绪→pending 去重→每 mention 一条 dispatch
// outcome 带 reason code；评论即总线全程留痕）：
//   @<agent>   = 派发一次 zcode 引擎 run（createSession + sendText 命令）
//   @squad/<名> = squad leader 协议（squad-protocol.ts）：只派 leader，简报式委托
//   单 pending 槽：(workspace,agent) 活跃期间后续派单 → coalesced（文本并入，
//   不另起 run）——multica 单 pending 槽语义。槽占用按 (workspace,agent) 串行化，
//   并发派单不双跑（P-A(c)）。
// outcome reason 全部走 dispatch-reasons.ts 词表；run 可追溯 = outcome 携带
// sessionId + commandId，并联动会话投影（watchSession）。
//
// 判定同源（P-A(d)）：写路径 dispatchOne 与预演 will-enqueue.ts 共用 planDispatch
// 这一份纯判定核（目标解析→known/deferred→自触发→槽→可达性），预演不再与写路径
// 各判各的（曾实测漂移：leader 在 deferred 名单/引擎离线时预演说「将起跑」）。
//
// 命令信封契约：upstream/zcode packages/shared/src/zcode-protocol-v4/command.ts:323
// commandEnvelopeSchema（commandId uuid v7 风格客户端生成、createSession 时
// sessionId=null、sendText payload={text,...}）。
import { randomUUID } from 'crypto'
import { coerceDispatchReasonCode, type DispatchReasonCode } from './dispatch-reasons'
import {
  resolveSquad, isSelfTrigger, buildSquadBriefing, recordEvaluation,
  type SquadDefinition,
} from './squad-protocol'

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
  /** squad 委托的执行 leader（P-D(b) 信封对称：外层统一 mentionKind:'squad'、target=squad 名，leader 独立字段）。 */
  leader?: string
  reason: DispatchReasonCode
  detail?: string
  sessionId?: string
  commandId?: string
  at: number
}

export interface MentionDispatchOptions {
  engine: DispatchEnginePort
  clientId: string
  /** 【废弃，走 dispatch 参数】构造器级派单发起者：自触发抑制按请求取发起者
   * （engine-controller 从 ctx.state.user 取，per-request 生效）；此字段仅缺省回退兼容。 */
  mentionAuthor?: string
  /** 可派发 agent 名单（默认 ['zcode']；非名单内 → target_unavailable）。 */
  knownAgents?: string[]
  /** 已知名单内但非 zcode 引擎的 agent → deferred（P5 吸收后并入本总线）。 */
  deferredAgents?: string[]
  /**
   * pending 槽 TTL ms（默认 30 分钟）。TTL 语义（P-F(b) 如实说明）：到期即释放槽、
   * 允许重派新 run。投影事件面（session-projection.ts ProjectionEvent）没有 run 完成
   * 信号，无从探「旧 run 是否仍在跑」——长任务跑超 TTL 时重派会另起 run 并发写同一
   * 工作区（双写风险）。这是按时间兜底的已知局限：长任务请调大本值或用 releaseRun
   * 手动收口，等会话生命周期暴露 run 完成事件再接自动释放，不臆造事件名。
   */
  pendingTtlMs?: number
  now?: () => number
  onOutcome?: (outcome: MentionOutcome) => void
}

interface PendingRun {
  sessionId: string
  since: number
  coalesced: string[]
}

export interface DispatchParams {
  workspacePath: string
  text: string
  /** 派单发起者（自触发抑制判定；缺省回退构造器字段，再缺省视为系统发起不禁停）。 */
  mentionAuthor?: string
}

// ── 纯判定核（P-A(d)）────────────────────────────────────────────────────────
// 写路径（dispatchOne）与预演（will-enqueue.ts willEnqueueRun）共用这一份判定序，
// 单一事实源，杜绝两套判定漂移：目标解析（squad→leader）→ known/deferred 档 →
// 自触发抑制 → pending 槽 → 引擎可达性。纯函数零副作用，事实由 PlanFacts 注入。

export interface PlanFacts {
  knownAgents: ReadonlySet<string>
  deferredAgents: ReadonlySet<string>
  /** 当前 pending 槽（slotKey → since），过期槽不算活跃。 */
  pendingSince: ReadonlyMap<string, number>
  pendingTtlMs: number
  now: number
}

export interface PlanRequest {
  token: { target: string; kind: 'agent' | 'squad' }
  workspacePath: string
  mentionAuthor?: string
  /** 引擎可达性事实（写路径 probe 后传入；预演传探测结果）。 */
  engineOnline: boolean
}

export interface DispatchPlan {
  /** reject=不起跑；coalesce=并入活跃 run；start=起新 run。 */
  action: 'reject' | 'coalesce' | 'start'
  /** 判定命中 reason（reject 即 outcome reason；coalesce→coalesced；start 成功→queued）。 */
  reason: DispatchReasonCode
  /** 实际执行 agent（squad=leader；agent=自身）——pending 槽按它归位。 */
  runsFor: string
  squad?: { name: string; leader: string; members: string[] }
  detail: string
}

/** 派单落到的执行 agent（squad=leader）；槽锁键与预演 runsFor 同源，防两处漂移。 */
export function resolveRunsFor(token: { target: string; kind: 'agent' | 'squad' }): string {
  if (token.kind !== 'squad') return token.target
  return resolveSquad(token.target)?.leader ?? token.target
}

export function planDispatch(req: PlanRequest, facts: PlanFacts): DispatchPlan {
  const { token, workspacePath } = req
  let runsFor = token.target
  let squad: DispatchPlan['squad']
  if (token.kind === 'squad') {
    const def: SquadDefinition | null = resolveSquad(token.target)
    if (!def) {
      return { action: 'reject', reason: 'target_unavailable', runsFor: '-', detail: `未知 squad：${token.target}` }
    }
    squad = { name: token.target, leader: def.leader, members: def.members }
    runsFor = def.leader
  }
  const wrap = (plan: Omit<DispatchPlan, 'runsFor' | 'squad'>): DispatchPlan => ({ ...plan, runsFor, squad })

  // 1) known/deferred 档（与构造器同语义：deferred 隐含已知，先于未知判定）。
  const known = facts.deferredAgents.has(runsFor) || facts.knownAgents.has(runsFor)
  if (!known) return wrap({ action: 'reject', reason: 'target_unavailable', detail: `未知 agent：${runsFor}` })
  if (facts.deferredAgents.has(runsFor)) {
    return wrap({ action: 'reject', reason: 'deferred', detail: '非 zcode 引擎 agent 走 hermes 旧链（P5 后并入）' })
  }
  // 2) 自触发抑制（仅 squad 委托：leader @ 自己的 squad）。
  if (squad && req.mentionAuthor) {
    const def = resolveSquad(squad.name)
    if (def && isSelfTrigger(def, req.mentionAuthor)) {
      return wrap({ action: 'reject', reason: 'self_trigger_suppressed', detail: `leader ${squad.leader} @ 自己的 squad，不再触发` })
    }
  }
  // 3) pending 槽：活跃 → 并入；过期 → 放行重派（TTL 语义见 MentionDispatchOptions.pendingTtlMs）。
  const since = facts.pendingSince.get(`${workspacePath}::${runsFor}`)
  const slotActive = since !== undefined && facts.now - since < facts.pendingTtlMs
  if (slotActive) return wrap({ action: 'coalesce', reason: 'coalesced', detail: `并入 ${runsFor} 活跃 run（不另起）` })
  // 4) 引擎可达性。
  if (!req.engineOnline) {
    return wrap({ action: 'reject', reason: 'runtime_offline', detail: 'zcode 引擎（:3030）不可达，稍后重派或先起引擎' })
  }
  return wrap({ action: 'start', reason: 'queued', detail: `将起跑（${runsFor}）` })
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
  /** 槽锁（P-A(c)）：同 (workspace,agent) 的派单串行化，堵 check-and-set 之间的 await 窗口。 */
  private readonly slotLocks = new Map<string, Promise<unknown>>()

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
  async dispatch(params: DispatchParams): Promise<MentionOutcome[]> {
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

  /**
   * 只读判定快照（P-A(d)）：预演面（/mention/preview）共用判定核的事实输入。
   * 取代对私有字段的反射强转——新增字段在此收口，快照即契约。
   */
  planFacts(): PlanFacts {
    return {
      knownAgents: new Set(this.known),
      deferredAgents: new Set(this.deferred),
      pendingSince: new Map([...this.pending.entries()].map(([k, v]) => [k, v.since] as const)),
      pendingTtlMs: this.pendingTtlMs,
      now: this.now(),
    }
  }

  private slotKey(workspacePath: string, agent: string): string {
    return `${workspacePath}::${agent}`
  }

  /** 同槽串行化（P-A(c)）：前一个派单（含引擎往返 await）落定后下一个才进判定。 */
  private async withSlotLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.slotLocks.get(key) ?? Promise.resolve()
    const run = prev.then(() => fn())
    const tail = run.then(() => undefined, () => undefined)
    this.slotLocks.set(key, tail)
    try {
      return await run
    } finally {
      if (this.slotLocks.get(key) === tail) this.slotLocks.delete(key)
    }
  }

  private async dispatchOne(params: DispatchParams, token: MentionToken): Promise<MentionOutcome> {
    // 锁键 = (workspace, 实际执行 agent)：squad token 与 @leader 共享同一槽、同一把锁。
    return this.withSlotLock(this.slotKey(params.workspacePath, resolveRunsFor(token)), () => this.dispatchLocked(params, token))
  }

  private async dispatchLocked(params: DispatchParams, token: MentionToken): Promise<MentionOutcome> {
    const base = {
      type: 'mention.outcome' as const,
      workspaceId: params.workspacePath,
      target: token.target,
      mentionKind: token.kind,
      at: this.now(),
    }
    const emit = (o: MentionOutcome) => { this.onOutcome(o); return o }
    // squad 外层信封（P-D(b)）：mentionKind:'squad'、target=squad 名、leader 独立字段，
    // detail 统一 [squad] 前缀；成功/失败信封不再一个拼 target 一个不拼。
    const wrapDetail = (d: string) => (token.kind === 'squad' ? `[squad] ${d}` : d)

    // 可达性事实先取（只读探测无副作用）；判定次序仍由 planDispatch 保证（槽先于可达性）。
    let engineOnline = false
    try { engineOnline = await this.engine.probe() } catch { engineOnline = false }

    const plan = planDispatch({
      token,
      workspacePath: params.workspacePath,
      mentionAuthor: params.mentionAuthor ?? this.mentionAuthor,
      engineOnline,
    }, this.planFacts())
    const envelope = { ...base, ...(plan.squad ? { leader: plan.squad.leader } : {}) }

    if (plan.action === 'reject') {
      return emit({ ...envelope, reason: plan.reason, detail: wrapDetail(plan.detail) })
    }

    // squad 委托：发给 leader 的文本是简报（规则在前 + 任务数据栅栏，P-C(c)）；
    // 简报里的 @成员名 是给 leader 的指引，token 直传不再重解析文本。
    const sendText = plan.squad
      ? buildSquadBriefing(plan.squad.name, plan.squad, params.text).prompt
      : params.text

    const key = this.slotKey(params.workspacePath, plan.runsFor)
    const existing = this.pending.get(key)

    if (existing && plan.action === 'coalesce') {
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
            payload: { text: sendText, requestedDelivery: 'startNow' },
            issuedAt: this.now(),
          },
        })
        if (result.status && result.status !== 'accepted' && result.status !== 'ok') {
          undelivered = `status=${result.status}${result.reasonCode ? ` reasonCode=${result.reasonCode}` : ''}`
        }
      } catch (err) {
        undelivered = err instanceof Error ? err.message : String(err)
      }
      if (undelivered === null) existing.coalesced.push(sendText)
      // squad 占位（P-B(a)）：交付到 leader run 才记账（并入也算「起跑」）；未起跑不记。
      if (plan.squad && undelivered === null) this.recordSquadPlaceholder(plan.squad, params.workspacePath, existing.sessionId)
      return emit({
        ...envelope, reason: 'coalesced', sessionId: existing.sessionId, commandId,
        detail: wrapDetail(undelivered === null
          ? `并入活跃 run（已投递，追加 ${existing.coalesced.length} 条）`
          : `并入活跃 run 但文本未送达（${undelivered}）`),
      })
    }
    if (existing) {
      // TTL 过期的陈旧槽，重派前清掉。P-F(b) 如实：投影事件面无 run 完成信号，无法
      // 探「旧 run 是否仍在跑」——长任务跑超 TTL 时这里会另起 run，与旧 run 并发写同
      // 一工作区（双写）。TTL 是按时间兜底的已知局限（语义见 pendingTtlMs 文档）：
      // 长任务请调大 pendingTtlMs 或用 releaseRun 收口，不臆造引擎 run 存活探测 API。
      this.pending.delete(key)
    }

    let sessionId: string
    try {
      const created = await this.engine.createSession({ workspacePath: params.workspacePath })
      sessionId = created.session.sessionId
    } catch (err) {
      return emit({ ...envelope, reason: 'engine_unreachable', detail: wrapDetail(`createSession: ${err instanceof Error ? err.message : String(err)}`) })
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
          payload: { text: sendText, requestedDelivery: 'startNow' },
          issuedAt: this.now(),
        },
      })
      if (result.status && result.status !== 'accepted' && result.status !== 'ok') {
        return emit({
          ...envelope, reason: 'command_rejected',
          sessionId, commandId,
          detail: wrapDetail(`status=${result.status}${result.reasonCode ? ` reasonCode=${result.reasonCode}` : ''}`),
        })
      }
    } catch (err) {
      return emit({ ...envelope, reason: 'command_rejected', sessionId, commandId, detail: wrapDetail(err instanceof Error ? err.message : String(err)) })
    }

    this.pending.set(key, { sessionId, since: this.now(), coalesced: [] })
    if (plan.squad) this.recordSquadPlaceholder(plan.squad, params.workspacePath, sessionId)
    return emit({ ...envelope, reason: 'queued', sessionId, commandId, detail: wrapDetail('run 已派发（createSession+sendText）') })
  }

  /** squad 评估占位（P-B(a)）：verdict:'pending' 非实评；leader verdict 摄入链路待接（输入面未定）。 */
  private recordSquadPlaceholder(squad: { name: string; leader: string }, workspacePath: string, sessionId: string): void {
    recordEvaluation({
      squad: squad.name,
      leader: squad.leader,
      verdict: 'pending',
      reason: '派单占位：待 leader 首轮 verdict 摄入覆盖（摄入链路待接）',
      sessionId,
      workspacePath,
      at: this.now(),
    })
  }
}

/** uuid v7 风格：时间戳前缀 + 随机尾（命令幂等键；客户端生成，重试不变由调用方保证）。 */
export function uuidV7Like(): string {
  const ts = Date.now().toString(16).padStart(12, '0')
  const rand = randomUUID().replace(/-/g, '').slice(0, 20)
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 20)}`
}
