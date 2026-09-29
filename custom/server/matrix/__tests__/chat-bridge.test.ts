// custom/server/matrix/__tests__/chat-bridge.test.ts
// v14 统一聊天 P2B/P2C/P2D 守门：ChatBridge——sync 解析/入向注入幂等/出向终态
// 投递与防重/assign 消费回执/审批远端通知/agent.profile 声明。fetch 全替身，
// GroupChatServer 用同构假体（publishBridgeMemberMessage/getStorage/bridgeEvents）。
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ChatBridge, matrixSync, matrixSend, parseBridgeMappings, extractText,
  type BridgeMatrixEnv, type BridgeMapping, type GroupChatServerLike, type BridgeGcMessage,
} from '../chat-bridge'

const ENV: BridgeMatrixEnv = { homeserverUrl: 'http://127.0.0.1:8008', accessToken: 'tok', userId: '@bridge:matrix.test' }
const MAP: BridgeMapping = { matrixRoomId: '!mx1:matrix.test', gcRoomId: 'g1' }

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
}

function makeGcs(agents: BridgeGcMessage[] = []) {
  const published: Array<{ roomId: string; senderId: string; senderName: string; content: string }> = []
  let roomExists = true
  const gcs: GroupChatServerLike = {
    publishBridgeMemberMessage(input) {
      if (!roomExists) return null
      published.push({ ...input })
      return { id: `gc-${published.length}`, timestamp: Date.now() }
    },
    getStorage: () => ({
      getRoom: () => (roomExists ? { id: 'g1' } : null),
      getMessagesForContext: () => agents,
    }),
    getRoomAgentViews: () => [{ agentId: 'a1', name: 'maker', agent: 'hermes' }],
    bridgeEvents: new EventEmitter() as unknown as GroupChatServerLike['bridgeEvents'],
  }
  return { gcs, published, setRoomExists: (v: boolean) => { roomExists = v }, events: gcs.bridgeEvents as unknown as EventEmitter }
}

describe('parseBridgeMappings / extractText', () => {
  it('映射表：逗号/换行分隔，=两侧 trim，坏段跳过', () => {
    const ms = parseBridgeMappings('!a:h=g1, !b:h = g2\n坏段, =x')
    expect(ms).toEqual([
      { matrixRoomId: '!a:h', gcRoomId: 'g1' },
      { matrixRoomId: '!b:h', gcRoomId: 'g2' },
    ])
    expect(parseBridgeMappings(undefined)).toEqual([])
  })
  it('extractText：纯文本原样；JSON content-block 拼 text', () => {
    expect(extractText('你好')).toBe('你好')
    expect(extractText(JSON.stringify([{ type: 'text', text: 'a' }, { type: 'tool_use', id: 'x' }, { type: 'text', text: 'b' }]))).toBe('a\nb')
  })
})

describe('matrixSync / matrixSend（REST 契约）', () => {
  it('sync：invite + m.text + 自定义事件 + 非 m.text 过滤', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({
      next_batch: 'S2',
      rooms: {
        invite: { '!inv:matrix.test': {} },
        join: {
          '!mx1:matrix.test': { timeline: { events: [
            { type: 'm.room.message', event_id: '$1', sender: '@far:matrix.test', content: { msgtype: 'm.text', body: 'hi' }, origin_server_ts: 10 },
            { type: 'm.room.message', event_id: '$2', sender: '@far:matrix.test', content: { msgtype: 'm.image', body: 'x.png' }, origin_server_ts: 11 },
            { type: 'com.swarmstudio.task.assign', event_id: '$3', sender: '@leader:matrix.test', content: { taskId: 't1' }, origin_server_ts: 12 },
          ] } },
        },
      },
    })) as unknown as typeof fetch
    const r = await matrixSync(ENV, 'S1', 25, fetchImpl)
    expect(r.nextBatch).toBe('S2')
    expect(r.invites).toEqual(['!inv:matrix.test'])
    expect(r.joined[0].messages).toEqual([{ eventId: '$1', sender: '@far:matrix.test', body: 'hi', ts: 10 }])
    expect(r.joined[0].customEvents[0]).toMatchObject({ type: 'com.swarmstudio.task.assign', content: { taskId: 't1' } })
    const url = (fetchImpl.mock.calls[0][0] as string)
    expect(url).toContain('/_matrix/client/v3/sync?')
    expect(url).toContain('since=S1')
  })
  it('send：PUT rooms/:id/send/:type/:txn + Bearer', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ event_id: '$e' })) as unknown as typeof fetch
    const id = await matrixSend(ENV, '!r:h', 'm.room.message', { body: 'x' }, fetchImpl, 'seed')
    expect(id).toBe('$e')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/_matrix/client/v3/rooms/!r%3Ah/send/m.room.message/seed-')
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })
})

describe('ChatBridge 入向（matrix → 本地群房注入）', () => {
  function makeBridge(agents: BridgeGcMessage[] = []) {
    const home = mkdtempSync(join(tmpdir(), 'v14-bridge-'))
    const fake = makeGcs(agents)
    const bridge = new ChatBridge({
      env: ENV, mappings: [MAP], gcs: fake.gcs,
      fetchImpl: (async () => jsonRes({ next_batch: 'S1' })) as unknown as typeof fetch,
      stateFile: join(home, 'state.json'),
    })
    return { bridge, fake, home }
  }

  it('远端 m.text 注入：mx: 前缀 sender + localpart 名；自己/重复/未映射跳过', async () => {
    const { bridge, fake } = makeBridge()
    await bridge.handleMatrixEvent(MAP, { eventId: '$a', sender: '@carol:matrix.test', body: '帮我看下部署', ts: 1 })
    expect(fake.published).toHaveLength(1)
    expect(fake.published[0]).toMatchObject({ roomId: 'g1', senderId: 'mx:@carol:matrix.test', senderName: 'carol', content: '帮我看下部署' })
    await bridge.handleMatrixEvent(MAP, { eventId: '$a', sender: '@carol:matrix.test', body: '帮我看下部署', ts: 1 })
    await bridge.handleMatrixEvent(MAP, { eventId: '$b', sender: '@bridge:matrix.test', body: '[maker] 回声', ts: 2 })
    await bridge.handleMatrixEvent(MAP, { eventId: '$c', sender: '@carol:matrix.test', body: '  ', ts: 3 })
    expect(fake.published).toHaveLength(1)
    bridge.stop()
  })

  it('P2C assign：注入本地编排 + receipt created；房不在 → receipt failed', async () => {
    const sends: Array<{ type: string; content: Record<string, unknown> }> = []
    const home = mkdtempSync(join(tmpdir(), 'v14-bridge-'))
    const fake = makeGcs()
    const bridge = new ChatBridge({
      env: ENV, mappings: [MAP], gcs: fake.gcs,
      fetchImpl: (async (_u: unknown, init?: RequestInit) => {
        const url = String(_u)
        const m = url.match(/\/send\/([^/]+)\//)
        sends.push({ type: m?.[1] ?? '', content: JSON.parse(String(init?.body ?? '{}')) })
        return jsonRes({ event_id: '$r' })
      }) as unknown as typeof fetch,
      stateFile: join(home, 'state.json'),
    })
    await bridge.handleAssignEvent(MAP, { eventId: '$t1', content: { taskId: 't1', title: '修复登录', issuedBy: '@leader:matrix.test' } })
    expect(fake.published[0]?.content).toContain('修复登录')
    expect(fake.published[0]?.senderName).toBe('派发-leader')
    expect(sends[0].type).toBe('com.swarmstudio.task.receipt')
    expect(sends[0].content).toMatchObject({ taskId: 't1', status: 'created' })
    // 同 taskId 防重入
    await bridge.handleAssignEvent(MAP, { eventId: '$t1', content: { taskId: 't1', title: '修复登录' } })
    expect(fake.published).toHaveLength(1)
    // 房不在 → failed
    fake.setRoomExists(false)
    await bridge.handleAssignEvent(MAP, { eventId: '$t2', content: { taskId: 't2', title: 'x' } })
    expect(sends[1].content).toMatchObject({ taskId: 't2', status: 'failed', reason: 'local-room-missing' })
    bridge.stop()
  })
})

describe('ChatBridge 出向（本地 agent 终态 → matrix）', () => {
  function makeOut(agents: BridgeGcMessage[], failSends = false) {
    const home = mkdtempSync(join(tmpdir(), 'v14-bridge-'))
    const fake = makeGcs(agents)
    const sends: Array<{ type: string; content: Record<string, unknown> }> = []
    const bridge = new ChatBridge({
      env: ENV, mappings: [MAP], gcs: fake.gcs,
      fetchImpl: (async (u: unknown) => {
        if (failSends) return new Response('boom', { status: 500 })
        const m = String(u).match(/\/send\/([^/]+)\//)
        sends.push({ type: m?.[1] ?? '', content: {} })
        return jsonRes({ event_id: '$o' })
      }) as unknown as typeof fetch,
      stateFile: join(home, 'state.json'),
    })
    return { bridge, sends, home }
  }
  const AGENTS: BridgeGcMessage[] = [
    { id: 'm1', timestamp: 100, senderType: 'member', role: 'user', senderName: 'carol', content: '问题' },
    { id: 'm2', timestamp: 200, senderType: 'agent', role: 'assistant', senderName: 'maker', senderAgentType: 'hermes', content: '已修复', run_id: 'r9' },
    { id: 'm3', timestamp: 300, senderType: 'agent', role: 'tool', senderName: 'maker', content: 'tool 噪声' },
  ]

  it('只投 agent 终态：m.text 带 [name] + agent.message 徽章；二轮 flush 零重发', async () => {
    const { bridge, sends } = makeOut(AGENTS)
    await bridge.flushOutbound(MAP)
    const text = sends.find(s => s.type === 'm.room.message')
    const badge = sends.find(s => s.type === 'com.swarmstudio.agent.message')
    expect(text).toBeTruthy()
    expect(badge).toBeTruthy()
    await bridge.flushOutbound(MAP)
    const sends2 = sends.length
    await bridge.flushOutbound(MAP)
    expect(sends.length).toBe(sends2)
    bridge.stop()
  })

  it('发送失败即停保序（下轮重试同批）', async () => {
    const { bridge } = makeOut(AGENTS, true)
    await expect(bridge.flushOutbound(MAP)).resolves.toBeUndefined()
    bridge.stop()
  })
})

describe('ChatBridge 审批远端通知 + profile 声明（P2C/P2D）', () => {
  it('bridgeEvents approval.requested → 映射房 m.text 通知（非映射房忽略）', async () => {
    const home = mkdtempSync(join(tmpdir(), 'v14-bridge-'))
    const fake = makeGcs()
    const bodies: string[] = []
    const bridge = new ChatBridge({
      env: ENV, mappings: [MAP], gcs: fake.gcs,
      fetchImpl: (async (u: unknown, init?: RequestInit) => {
        if (String(u).includes('/send/m.room.message/')) bodies.push(JSON.parse(String(init?.body ?? '{}')).body)
        return jsonRes({ event_id: '$n' })
      }) as unknown as typeof fetch,
      stateFile: join(home, 'state.json'),
    })
    // start() 会注册监听 + 发 profile 声明 + 起循环；立即停只留一轮
    await bridge.start()
    bridge.stop()
    ;(fake.events as EventEmitter).emit('approval.requested', {
      roomId: 'g1', agentName: 'maker', approvalId: 'ap1', command: 'rm -rf', choices: ['once', 'deny'],
    })
    ;(fake.events as EventEmitter).emit('approval.requested', { roomId: 'other-room' })
    await new Promise(r => setTimeout(r, 30))
    const approvalBody = bodies.find(b => b.includes('审批请求'))
    expect(approvalBody).toContain('maker')
    expect(approvalBody).toContain('once / deny')
    expect(bodies.filter(b => b.includes('审批请求'))).toHaveLength(1)
    rmSync(home, { recursive: true, force: true })
  })
})
