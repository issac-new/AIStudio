// overlay/custom/server/__tests__/zcode-mention-dispatch.test.ts
// R4-P3 守门：@mention 解析（顺序/去重/squad）+ 派单链（queued 可追溯 /
// coalesced 单 pending 槽 / runtime_offline / target_unavailable / deferred /
// command_rejected 透传 reasonCode）+ 控制器接线。multica 语义锚：
// docs/upstream-analysis/multica.md §3.1（逐 mention outcome + 单 pending 槽）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseMentions, MentionDispatchService, uuidV7Like, type DispatchEnginePort, type MentionOutcome } from '../zcode/mention-dispatch'

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

  it('单 pending 槽：活跃期间重派 → coalesced 并入，不另起 run', async () => {
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 任务A' })
    const second = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 补充B' })
    expect(second[0]).toMatchObject({ reason: 'coalesced', sessionId: 'sess-1' })
    expect(engine.sessions).toBe(1) // 未新建会话
    expect(svc.pendingSnapshot()[0]).toMatchObject({ coalescedCount: 1 })
    svc.releaseRun('/ws/p', 'zcode')
    const third = await svc.dispatch({ workspacePath: '/ws/p', text: '@zcode 新任务' })
    expect(third[0].reason).toBe('queued')
    expect(engine.sessions).toBe(2)
  })

  it('引擎离线 → runtime_offline；未知 agent → target_unavailable；squad → deferred；旧链 agent → deferred', async () => {
    const engine = fakeEngine()
    engine.online = false
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    expect((await svc.dispatch({ workspacePath: '/w', text: '@zcode 干活' }))[0].reason).toBe('runtime_offline')
    expect((await svc.dispatch({ workspacePath: '/w', text: '@ghost 干活' }))[0].reason).toBe('target_unavailable')
    engine.online = true
    const svc2 = new MentionDispatchService({ engine, clientId: 'c', deferredAgents: ['codex'] })
    const multi = await svc2.dispatch({ workspacePath: '/w', text: '@squad/core @codex @zcode 三路' })
    expect(multi.map((o) => o.reason)).toEqual(['deferred', 'deferred', 'queued'])
    expect(multi[0].detail).toContain('P4')
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
