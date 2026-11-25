// overlay/custom/server/__tests__/zcode-mention-dispatch.test.ts
// R4-P3 守门：@mention 解析（顺序/去重/squad）+ 派单链（queued 可追溯 /
// coalesced 单 pending 槽 / runtime_offline / target_unavailable / deferred /
// command_rejected 透传 reasonCode）+ 控制器接线。multica 语义锚：
// docs/upstream-analysis/multica.md §3.1（逐 mention outcome + 单 pending 槽）。
//
// 数字员工批一 Task 4：派单门段用例把 AGENT_IDENTITY_STORE 指到 mkdtemp 直写台账
// （不读开发机真实身份册）；门读数全部经真实 readUnitGateFacts/assessUnitDispatchGate，
// 只有任务能力快照与能力读数走 vi.mock（门本身不被 mock 掉）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseMentions, planDispatch, MentionDispatchService, uuidV7Like, type DispatchEnginePort, type MentionOutcome } from '../zcode/mention-dispatch'
import { assessUnitDispatchGate, readUnitGateFacts } from '../agentidentity/dispatch-gate'
import { fetchTaskTitleAndBodyByTaskId } from '../kanban/dispatch-readiness'
import { assessTaskCapabilityReadiness } from '../capabilitypool/readiness'

// 能力快照/能力读数只在这两个用例里被调用（带 taskId 且声明能力需求）；缺省实现
// 保证其余用例即便误触也走原 fail-soft 语义（快照 null / 读数 pass）。
vi.mock('../kanban/dispatch-readiness', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../kanban/dispatch-readiness')>()
  return { ...mod, fetchTaskTitleAndBodyByTaskId: vi.fn(async () => null) }
})
vi.mock('../capabilitypool/readiness', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../capabilitypool/readiness')>()
  return { ...mod, assessTaskCapabilityReadiness: vi.fn((): ReturnType<typeof assessTaskCapabilityReadiness> => ({ decision: 'pass', reasons: [], candidates: [], evidenceRefs: [] })) }
})

const OVERLAY_ROOT = resolve(__dirname, '../../..')

function fakeEngine(overrides: Partial<DispatchEnginePort> = {}): DispatchEnginePort & { sent: Array<Record<string, unknown>>; sessions: number } {
  const engine = {
    online: true,
    sessions: 0,
    sent: [] as Array<Record<string, unknown>>,
    sendStatus: 'accepted' as string,
    sendReasonCode: undefined as string | undefined,
    async probe() { return engine.online },
    async createSession() { engine.sessions += 1; return { session: { sessionId: `sess-${engine.sessions}` } } },
    async sendCommand(p: { workspacePath: string; envelope: Record<string, unknown> }) {
      engine.sent.push(p.envelope)
      if (engine.sendStatus === 'accepted') return { status: 'accepted' }
      return { status: engine.sendStatus, ...(engine.sendReasonCode ? { reasonCode: engine.sendReasonCode } : {}) }
    },
    ...overrides,
  } as never
  return engine
}

describe('@mention 解析', () => {
  it('agent 与 squad 按出现顺序去重；裸 @ 不匹配', () => {
    expect(parseMentions('看下 @zcode 再 @zcode，然后 @squad/leader 与 @codex-x'))
      .toEqual([
        { raw: '@zcode', target: 'zcode', kind: 'agent' },
        { raw: '@squad/leader', target: 'leader', kind: 'squad' },
        { raw: '@codex-x', target: 'codex-x', kind: 'agent' },
      ])
    expect(parseMentions('无 mention')).toEqual([])
    expect(parseMentsSafe('@')).toEqual([])
  })
  function parseMentsSafe(t: string) { return parseMentions(t) }

  it('邮箱/词中形态不当 mention；句尾句号剥掉不吞进 target', () => {
    // 'a@b.com' 是邮箱不是 mention；'@zcode.' 的句号是句尾标点
    expect(parseMentions('请 @zcode. 修一下，联系 a@b.com')).toEqual([
      { raw: '@zcode', target: 'zcode', kind: 'agent' },
    ])
    expect(parseMentions('写信给 dev@team.org 和 x@y，别 @zcode...')).toEqual([
      { raw: '@zcode', target: 'zcode', kind: 'agent' },
    ])
    expect(parseMentions('@squad/core. 收一下')).toEqual([
      { raw: '@squad/core', target: 'core', kind: 'squad' },
    ])
  })
})

describe('派单链（MentionDispatchService）', () => {
  it('happy path：queued + sessionId/commandId 可追溯，sendText 信封契约对', async () => {
    const engine = fakeEngine()
    const outcomes: MentionOutcome[] = []
    const svc = new MentionDispatchService({ engine, clientId: 'cli-1', onOutcome: (o) => outcomes.push(o) })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下登录页' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ reason: 'queued', sessionId: 'sess-1', target: 'zcode' })
    expect(result[0].commandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(uuidV7Like()).not.toBe(uuidV7Like())
    expect(outcomes).toEqual(result) // outcome 流与返回值一致（socket 扇出面）
    const envelope = engine.sent[0]
    expect(envelope).toMatchObject({
      clientId: 'cli-1', sessionId: 'sess-1', type: 'sendText',
      payload: { text: '@zcode 修一下登录页', requestedDelivery: 'startNow' },
    })
    expect(typeof envelope.commandId).toBe('string')
    expect(typeof envelope.issuedAt).toBe('number')
  })

  it('单 pending 槽：活跃期间重派 → coalesced 并入，不另起 run，但文本必须真的投递给既有会话', async () => {
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 任务A' })
    const second = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 补充B' })
    expect(second[0]).toMatchObject({ reason: 'coalesced', sessionId: 'sess-1' })
    expect(second[0].detail).toContain('已投递')
    expect(engine.sessions).toBe(1) // 未新建会话
    expect(svc.pendingSnapshot()[0]).toMatchObject({ coalescedCount: 1 })
    // coalesced 不是只记账：sendText 信封真的发给了既有 run 的 sessionId
    expect(engine.sent).toHaveLength(2)
    expect(engine.sent[1]).toMatchObject({
      sessionId: 'sess-1', type: 'sendText',
      payload: { text: '@zcode 补充B', requestedDelivery: 'startNow' },
    })
    svc.releaseRun('/ws/p', 'zcode')
    const third = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 新任务' })
    expect(third[0].reason).toBe('queued')
    expect(engine.sessions).toBe(2)
  })

  it('coalesced 投递失败：outcome 如实注明未送达，不计入追加条数', async () => {
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 任务A' })
    engine.sendStatus = 'rejected'
    engine.sendReasonCode = 'session_busy'
    const second = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 补充B' })
    expect(second[0].reason).toBe('coalesced')
    expect(second[0].detail).toContain('未送达')
    expect(second[0].detail).toContain('reasonCode=session_busy')
    expect(svc.pendingSnapshot()[0]).toMatchObject({ coalescedCount: 0 })
  })

  it('引擎离线 → runtime_offline；未知 agent → target_unavailable；squad → deferred；旧链 agent → deferred', async () => {
    const engine = fakeEngine()
    engine.online = false
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    expect((await svc.dispatch({ workspacePath: '/w', text: '@zcode 干活' }))[0].reason).toBe('runtime_offline')
    expect((await svc.dispatch({ workspacePath: '/w', text: '@ghost 干活' }))[0].reason).toBe('target_unavailable')
    engine.online = true
    // squad 语义（multica P0 吸收后）：@squad/core → 直派 leader zcode（queued，
    // 且与 @zcode 共享单 pending 槽）；@codex 走旧链 deferred。
    const svc2 = new MentionDispatchService({ engine, clientId: 'c', deferredAgents: ['codex'] })
    const multi = await svc2.dispatch({ workspacePath: '/w', text: '@squad/core @codex @zcode 三路' })
    expect(multi.map((o) => o.reason)).toEqual(['queued', 'deferred', 'coalesced'])
    // P-D(b) 信封对称：target=squad 名，leader 独立字段（不再塞 'leader:zcode' 进 target）。
    expect(multi[0].target).toBe('core')
    expect(multi[0].mentionKind).toBe('squad')
    expect(multi[0].leader).toBe('zcode')
    expect(multi[0].detail).toContain('[squad]')
    expect(multi[1].detail).toContain('hermes 旧链')
  })

  it('sendText 被拒 → command_rejected 且透传引擎 reasonCode', async () => {
    const engine = fakeEngine()
    engine.sendStatus = 'rejected'
    engine.sendReasonCode = 'session_busy'
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const outcome = (await svc.dispatch({ workspacePath: '/w', text: '@zcode x' }))[0]
    expect(outcome.reason).toBe('command_rejected')
    expect(outcome.detail).toContain('status=rejected')
    expect(outcome.detail).toContain('reasonCode=session_busy')
    expect(svc.pendingSnapshot()).toHaveLength(0) // 拒绝不占 pending 槽
  })

  it('createSession 抛错 → engine_unreachable；TTL 过期后可重派', async () => {
    const engine = fakeEngine()
    let fail = true
    ;(engine as unknown as { createSession: unknown }).createSession = async () => {
      if (fail) throw new Error('WS closed')
      return { session: { sessionId: 'sess-x' } }
    }
    let tick = 1_000
    const svc = new MentionDispatchService({ engine, clientId: 'c', pendingTtlMs: 100, now: () => tick })
    expect((await svc.dispatch({ workspacePath: '/w', text: '@zcode a' }))[0].reason).toBe('engine_unreachable')
    fail = false
    ;(engine as unknown as { createSession: unknown }).createSession = async () => ({ session: { sessionId: 'sess-1' } })
    expect((await svc.dispatch({ workspacePath: '/w', text: '@zcode b' }))[0].reason).toBe('queued')
    tick += 200 // 过 TTL
    expect((await svc.dispatch({ workspacePath: '/w', text: '@zcode c' }))[0].reason).toBe('queued')
  })
})

// ── 数字员工批一 Task 4：派单门接入统一判定核 ──────────────────────────────
// 夹具：AGENT_IDENTITY_STORE 指向 mkdtemp，直写 identities.json/people.json（同目录约定）；
// 门读数经真实 readUnitGateFacts/assessUnitDispatchGate 采集，门本身不被 mock。
describe('派单门（数字员工批一）', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mention-gate-'))
    process.env.AGENT_IDENTITY_STORE = dir
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.AGENT_IDENTITY_STORE
    delete process.env.WORKUNIT_DISPATCH_GATE
  })

  // 与 dispatch-gate.test.ts 同源的责任卡夹具：卡面要素齐备 + 责任人 alice/bob 在岗 → 门 pass
  const VALID_CARD = {
    deliveryStandard: '可复现', riskTier: 'medium', primaryOwner: 'alice', escalation: ['e'],
    pauseConditions: ['p'], takerOver: 'bob', testCaseVersion: 'tc-1',
    costBudget: { limit: 1, unit: 'CNY' }, maintainer: 'alice', deploymentLocation: 'x',
  }
  const personRow = (id: string) => ({ id, name: id, emails: [], active: true, source: 'manual', createdAt: 1 })
  const unitRow = (over: Record<string, unknown> = {}) => ({
    id: 'aid-001', name: 'u-1', kind: 'agent', owner: 'alice', toolAllowlist: [],
    credentials: [], delegations: [], createdAt: 1, updatedAt: 1,
    runtimeBindings: { agents: ['zcode'] },
    responsibilityCard: VALID_CARD,
    lifecycle: { stage: 'running', history: [] },
    ...over,
  })
  const seedLedger = (identities: unknown[], people: unknown[] = [personRow('alice'), personRow('bob')]) => {
    writeFileSync(join(dir, 'identities.json'), JSON.stringify({ identities, nextSeq: identities.length + 1, nextDelegationSeq: 1 }))
    writeFileSync(join(dir, 'people.json'), JSON.stringify({ people, nextSeq: people.length + 1 }))
  }
  const gateFacts = (over: Record<string, unknown> = {}) => ({
    knownAgents: new Set(['zcode']),
    deferredAgents: new Set() as Set<string>,
    pendingSince: new Map() as Map<string, number>,
    pendingTtlMs: 1000,
    now: 0,
    ...over,
  })

  it('已绑定单元阶段 running → 照常起跑；读数 pass 随结果可见', async () => {
    seedLedger([unitRow()])
    // 读数 pass 随结果可见：真实门读数并入判定核后仍判 start（queued）
    const verdict = assessUnitDispatchGate(readUnitGateFacts('zcode', 'agent'))
    expect(verdict.decision).toBe('pass')
    const plan = planDispatch(
      { token: { target: 'zcode', kind: 'agent' }, workspacePath: '/ws/p', engineOnline: true },
      { ...gateFacts(), unitGate: new Map([['zcode', verdict]]) },
    )
    expect(plan).toMatchObject({ action: 'start', reason: 'queued' })
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下' })
    expect(result[0]).toMatchObject({ reason: 'queued', target: 'zcode' })
    expect(engine.sessions).toBe(1)
  })

  it('已绑定单元阶段 retired → reject unit_gate，引擎未被调用', async () => {
    seedLedger([unitRow({ lifecycle: { stage: 'retired', history: [] } })])
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下' })
    expect(result[0].reason).toBe('unit_gate')
    expect(result[0].detail).toContain('unit_retired')
    expect(engine.sessions).toBe(0)
  })

  it.each(['registered', 'changing'])('阶段 %s → reject unit_gate', async (stage) => {
    seedLedger([unitRow({ lifecycle: { stage, history: [] } })])
    const svc = new MentionDispatchService({ engine: fakeEngine(), clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下' })
    expect(result[0].reason).toBe('unit_gate')
    expect(result[0].detail).toContain(`unit_${stage}`)
  })

  it('未绑定目标 → 行为不变（queued）', async () => {
    seedLedger([]) // 身份册里没有任何绑定 zcode 的身份
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下' })
    expect(result[0].reason).toBe('queued')
    expect(engine.sessions).toBe(1)
  })

  it('门关闭（WORKUNIT_DISPATCH_GATE=off）→ retired 单元照常起跑', async () => {
    seedLedger([unitRow({ lifecycle: { stage: 'retired', history: [] } })])
    process.env.WORKUNIT_DISPATCH_GATE = 'off'
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下' })
    expect(result[0].reason).toBe('queued')
    expect(engine.sessions).toBe(1)
  })

  it('台账不可读 → 起跑且 unitGate 读数为 unknown', async () => {
    writeFileSync(join(dir, 'identities.json'), 'not-json{{{') // 台账内容非法 JSON
    const facts = readUnitGateFacts('zcode', 'agent')
    expect(facts.identities).toBeNull()
    expect(assessUnitDispatchGate(facts).decision).toBe('unknown')
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下' })
    expect(result[0].reason).toBe('queued')
    expect(engine.sessions).toBe(1)
  })

  it('多目标文本：一个被拦、其余照常起跑', async () => {
    seedLedger([
      unitRow({ id: 'aid-ret', name: 'u-ret', runtimeBindings: { agents: ['ret-x'] }, lifecycle: { stage: 'retired', history: [] } }),
      unitRow({ id: 'aid-002', name: 'u-zcode' }),
    ])
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c', knownAgents: ['ret-x', 'zcode'] })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@ret-x @zcode 修一下' })
    expect(result[0]).toMatchObject({ reason: 'unit_gate', target: 'ret-x' })
    expect(result[1]).toMatchObject({ reason: 'queued', target: 'zcode' })
    expect(engine.sessions).toBe(1) // 只有 zcode 起了 run
  })

  it('门通过但能力读数为 block → reject capability_block', async () => {
    seedLedger([unitRow()])
    vi.mocked(fetchTaskTitleAndBodyByTaskId).mockResolvedValue({ title: 't', body: null, assignee: null, skills: [], required_capabilities: ['cap:x'] })
    vi.mocked(assessTaskCapabilityReadiness).mockReturnValue({ decision: 'block', reasons: ['capability_not_supplied:x'], candidates: [], evidenceRefs: [] })
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下', taskId: 't_x' })
    expect(result[0].reason).toBe('capability_block')
    expect(result[0].detail).toContain('capability_not_supplied:x')
    expect(engine.sessions).toBe(0)
  })

  it('门通过、能力读数 warn → 起跑并带警告', async () => {
    seedLedger([unitRow()])
    vi.mocked(fetchTaskTitleAndBodyByTaskId).mockResolvedValue({ title: 't', body: null, assignee: null, skills: [], required_capabilities: ['cap:x'] })
    const warnReadiness = { decision: 'warn' as const, reasons: ['capability_thin:x'], candidates: [], evidenceRefs: [] }
    vi.mocked(assessTaskCapabilityReadiness).mockReturnValue(warnReadiness)
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下', taskId: 't_x' })
    expect(result[0].reason).toBe('queued')
    // 判定核面：warn 追加进 plan.warnings（告警而非拦截）
    const verdict = assessUnitDispatchGate(readUnitGateFacts('zcode', 'agent'))
    const plan = planDispatch(
      { token: { target: 'zcode', kind: 'agent' }, workspacePath: '/ws/p', engineOnline: true },
      { ...gateFacts(), unitGate: new Map([['zcode', verdict]]), capabilityReadiness: warnReadiness },
    )
    expect(plan.action).toBe('start')
    expect(plan.warnings?.join()).toContain('capability_thin:x')
  })

  it('能力 block 对未绑定目标不拦截（维持只警告）', async () => {
    seedLedger([]) // 未绑定：门读数 skipped，能力硬门只适用于已绑定单元
    vi.mocked(fetchTaskTitleAndBodyByTaskId).mockResolvedValue({ title: 't', body: null, assignee: null, skills: [], required_capabilities: ['cap:x'] })
    vi.mocked(assessTaskCapabilityReadiness).mockReturnValue({ decision: 'block', reasons: ['capability_not_supplied:x'], candidates: [], evidenceRefs: [] })
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 修一下', taskId: 't_x' })
    expect(result[0].reason).toBe('queued')
    expect(engine.sessions).toBe(1)
  })
})

describe('P3 接线守门', () => {
  it('engine-controller 挂 POST /api/zcode-engine/mention，outcome 走词表 reason', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/engine-controller.ts'), 'utf8')
    expect(src).toContain("router.post('/mention'")
    expect(src).toContain('MentionDispatchService')
    expect(src).toContain('watchSession') // 派发后挂投影 = run 可追溯
  })

  it('runtime 暴露 withAgent（派单引擎面经桥调用）', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/projection-runtime.ts'), 'utf8')
    expect(src).toContain('async withAgent')
  })

  it('socket 面承载 MentionOutcome（ZcodeSocketEvent 联合）', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/projection-socket.ts'), 'utf8')
    expect(src).toContain('MentionOutcome')
    expect(src).toContain('ZcodeSocketEvent')
  })
})
