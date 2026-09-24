// overlay/custom/server/__tests__/zcode-session-projection.test.ts
// R4-P2 守门：dispatch reason 词表冻结 + 会话投影（快照/增量/fragment/会话帧/失败路径）
// + socket 扇出房间路由 + patch 398 登记。帧契约锚点 upstream/zcode
// packages/shared/src/zcode-protocol-v4/{wire,transport,sessions-index}.ts。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import {
  DISPATCH_REASON_CODES, coerceDispatchReasonCode,
} from '../zcode/dispatch-reasons'
import {
  ZcodeSessionProjection, engineReasonToDispatchReason,
  type ProjectionAgentPort, type ProjectionEvent, type ZcodeWireFrameLike,
} from '../zcode/session-projection'
import { emitZcodeProjectionEvent } from '../zcode/projection-socket'

const OVERLAY_ROOT = resolve(__dirname, '../../..')

function fakeAgent(): ProjectionAgentPort & {
  indexFrames: Array<(wire: ZcodeWireFrameLike) => void>
  convFrames: Array<(wire: ZcodeWireFrameLike) => void>
  failIndexSubscribe: boolean
} {
  const agent = {
    indexFrames: [] as Array<(wire: ZcodeWireFrameLike) => void>,
    convFrames: [] as Array<(wire: ZcodeWireFrameLike) => void>,
    failIndexSubscribe: false,
    async subscribeSessionsIndexV4() {
      if (agent.failIndexSubscribe) throw new Error('connect ECONNREFUSED 127.0.0.1:3030')
      return { ack: { subscriptionId: 'sub-idx-1', mode: 'live' } }
    },
    async subscribeConversationV4() { return { ack: { subscriptionId: 'sub-conv-1', mode: 'live' } } },
    onDynamicSessionsIndexFrame() { return (cb) => { agent.indexFrames.push(cb); return { dispose() {} } } },
    onDynamicConversationFrame() { return (cb) => { agent.convFrames.push(cb); return { dispose() {} } } },
  }
  return agent as never
}

function collect(p: ZcodeSessionProjection): ProjectionEvent[] {
  const out: ProjectionEvent[] = []
  p.onEvent((e) => out.push(e))
  return out
}

function completeFrame(topic: string, payload: unknown): ZcodeWireFrameLike {
  return { kind: 'complete', topic, subscriptionId: 'sub', frame: { topic, subscriptionId: 'sub', fromSeq: 0, toSeq: 1, payload } }
}

describe('dispatch reason 词表（第一批吸收 #1，multica MUL-4525 模式）', () => {
  it('枚举冻结：顺序与字面值变更须显式过本守门', () => {
    expect([...DISPATCH_REASON_CODES]).toEqual([
      'queued', 'coalesced', 'deferred',
      'invocation_not_allowed', 'target_unavailable',
      'runtime_offline', 'runtime_unusable', 'runtime_access_denied', 'runtime_profile_missing', 'agent_runtime_required',
      'attribution_blocked', 'already_active', 'self_trigger_suppressed',
      'engine_unreachable', 'handshake_failed', 'subscription_failed', 'subscription_lapsed',
      'frame_fragment_skipped', 'frame_malformed', 'command_rejected', 'internal_error',
    ])
  })

  it('边界收口：已知值透传，未知值回退 internal_error（引擎侧字符串不炸、可观测）', () => {
    expect(coerceDispatchReasonCode('runtime_offline')).toBe('runtime_offline')
    expect(coerceDispatchReasonCode('whatever-from-engine')).toBe('internal_error')
    expect(coerceDispatchReasonCode(undefined)).toBe('internal_error')
    expect(engineReasonToDispatchReason('command_rejected')).toBe('command_rejected')
  })
})

describe('会话投影（ZcodeSessionProjection）', () => {
  it('sessions-index 快照帧 → 逐会话 session.upserted', async () => {
    const agent = fakeAgent()
    const p = new ZcodeSessionProjection({ agent })
    const events = collect(p)
    await p.watchWorkspace('/ws/proj')
    agent.indexFrames[0](completeFrame('sessions-index/proj', {
      kind: 'snapshot',
      snapshot: { sessions: [{ sessionId: 's1', title: 'a' }, { sessionId: 's2', title: 'b' }] },
    }))
    const upserted = events.filter((e) => e.type === 'session.upserted')
    expect(upserted.map((e) => (e as { sessionId: string }).sessionId)).toEqual(['s1', 's2'])
    expect((upserted[0] as { workspaceId: string }).workspaceId).toBe('/ws/proj')
  })

  it('增量帧 → session.upserted / session.removed；未知 op → frame_malformed', async () => {
    const agent = fakeAgent()
    const p = new ZcodeSessionProjection({ agent })
    const events = collect(p)
    await p.watchWorkspace('/ws/proj')
    agent.indexFrames[0](completeFrame('sessions-index/proj', {
      kind: 'deltas',
      deltas: [
        { op: 'session.upserted', session: { sessionId: 's3', title: 'c' } },
        { op: 'session.removed', sessionId: 's1' },
        { op: 'session.???' },
      ],
    }))
    expect(events.filter((e) => e.type === 'session.upserted').map((e) => (e as { sessionId: string }).sessionId)).toEqual(['s3'])
    expect(events.filter((e) => e.type === 'session.removed').map((e) => (e as { sessionId: string }).sessionId)).toEqual(['s1'])
    expect(events.some((e) => e.type === 'projection.status' && e.reason === 'frame_malformed')).toBe(true)
  })

  it('fragment 帧不消费（重组列后批），按 topic 计数透传 frame_fragment_skipped', async () => {
    const agent = fakeAgent()
    const p = new ZcodeSessionProjection({ agent })
    const events = collect(p)
    await p.watchWorkspace('/ws/proj')
    agent.indexFrames[0]({ kind: 'fragment', topic: 'sessions-index/proj', fragmentIndex: 0, fragmentCount: 2, dataBase64: 'AAAA' })
    agent.indexFrames[0]({ kind: 'fragment', topic: 'sessions-index/proj', fragmentIndex: 1, fragmentCount: 2, dataBase64: 'BBBB' })
    const skips = events.filter((e) => e.type === 'projection.status' && e.reason === 'frame_fragment_skipped')
    expect(skips).toHaveLength(2)
    expect((skips[1] as { detail?: string }).detail).toContain('×2')
    expect(events.some((e) => e.type === 'session.upserted')).toBe(false)
  })

  it('conversation complete 帧 → conversation.frame（sessionId 取自 topic，deltaCount 计数）', async () => {
    const agent = fakeAgent()
    const p = new ZcodeSessionProjection({ agent })
    const events = collect(p)
    await p.watchWorkspace('/ws/proj')
    await p.watchSession('/ws/proj', 's9')
    agent.convFrames[0](completeFrame('conversation/s9', {
      kind: 'deltas', deltas: [{ op: 'row.appended' }, { op: 'row.updated' }],
    }))
    const frames = events.filter((e) => e.type === 'conversation.frame')
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ sessionId: 's9', payloadKind: 'deltas', deltaCount: 2 })
  })

  it('conversation topic 非法 → frame_malformed；watchSession 须先 watchWorkspace', async () => {
    const agent = fakeAgent()
    const p = new ZcodeSessionProjection({ agent })
    const events = collect(p)
    await expect(p.watchSession('/ws/proj', 's1')).rejects.toThrow('workspace 未投影')
    await p.watchWorkspace('/ws/proj')
    agent.convFrames[0](completeFrame('not-conversation-topic', { kind: 'snapshot', snapshot: {} }))
    expect(events.some((e) => e.type === 'projection.status' && e.reason === 'frame_malformed')).toBe(true)
  })

  it('订阅失败 → subscription_failed status 并抛出（watch 幂等，失败后可重试）', async () => {
    const agent = fakeAgent()
    const p = new ZcodeSessionProjection({ agent })
    const events = collect(p)
    agent.failIndexSubscribe = true
    await expect(p.watchWorkspace('/ws/proj')).rejects.toThrow()
    expect(events.some((e) => e.type === 'projection.status' && e.reason === 'engine_unreachable')).toBe(true)
    agent.failIndexSubscribe = false
    await p.watchWorkspace('/ws/proj')
    expect(p.snapshot()).toEqual([{ workspacePath: '/ws/proj', conversationSessions: [] }])
    await p.watchSession('/ws/proj', 's1')
    expect(p.snapshot()[0].conversationSessions).toEqual(['s1'])
  })
})

describe('socket 扇出（/zcode 命名空间）', () => {
  it('workspace 级必投 + 会话级加投；io 缺席静默', () => {
    const rooms: string[] = []
    const fakeIo = {
      of: () => ({ to: (room: string) => ({ emit: (name: string) => { rooms.push(`${name}@${room}`) } }) }),
    } as never
    emitZcodeProjectionEvent(fakeIo, { type: 'session.upserted', workspaceId: '/ws/proj', sessionId: 's1', session: {}, at: 0 })
    emitZcodeProjectionEvent(fakeIo, { type: 'projection.status', workspaceId: '/ws/proj', reason: 'runtime_offline', at: 0 })
    expect(rooms).toEqual([
      'zcode:event@zcode:/ws/proj', 'zcode:event@zcode:/ws/proj:s:s1',
      'zcode:event@zcode:/ws/proj',
    ])
    expect(() => emitZcodeProjectionEvent(null, { type: 'projection.status', workspaceId: '/w', reason: 'engine_unreachable', at: 0 })).not.toThrow()
  })
})

describe('P2 接线守门（runtime/controller/patch）', () => {
  it('projection-runtime 持有重连重放语义（onReconnected + onAgentRuntimeRestarted → handleDisconnect）', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/projection-runtime.ts'), 'utf8')
    expect(src).toContain('bridge.onReconnected(() => { void this.handleDisconnect() })')
    expect(src).toContain('onAgentRuntimeRestarted')
    expect(src).toContain('replayIntents')
  })

  it('engine-controller 挂投影 REST（watch/unwatch/status），失败路径带词表 reason', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/engine-controller.ts'), 'utf8')
    expect(src).toContain("router.post('/projection/watch'")
    expect(src).toContain("router.post('/projection/unwatch'")
    expect(src).toContain("router.get('/projection'")
    expect(src).toContain('engine_unreachable')
  })

  it('engine-bridge 服务面含 sessions-index 组（subscribe + 帧回调）', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/engine-bridge.ts'), 'utf8')
    expect(src).toContain('subscribeSessionsIndexV4')
    expect(src).toContain('onDynamicSessionsIndexFrame')
  })

  it('patch 398 登记且注入态 http.ts 含注册（/zcode 命名空间与 loop-socket 同款锚）', () => {
    const series = readFileSync(resolve(OVERLAY_ROOT, 'patches/series'), 'utf8')
    expect(series).toMatch(/^398-server-zcode-projection-socket\.patch$/m)
    const httpPath = resolve(OVERLAY_ROOT, '../upstream/hermes-studio/packages/server/src/bootstrap/http.ts')
    if (existsSync(httpPath)) {
      const http = readFileSync(httpPath, 'utf8')
      expect(http).toContain("import { setupZcodeProjectionSocket } from '../custom/zcode/projection-socket'")
      expect(http).toContain('setupZcodeProjectionSocket(activeGroupChatServer.getIO())')
    }
  })
})
