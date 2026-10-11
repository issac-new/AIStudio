// 进度跨机联邦测试（三步件①②）：事件契约往返、注册表摄入与有界、消息页摄取
// 坏行免疫、机器视图本机保底、D8 见 clusterinspector 测试组。
import { describe, expect, it, beforeEach } from 'vitest'
import {
  serializeEvent, parseEvent, ingestEvent, ingestFromMessagesPage,
  registrySnapshot, resetRegistryForTests, type FederationEvent,
} from '../federation'

const ev = (over: Partial<FederationEvent>): FederationEvent =>
  ({ v: 1, machine: 'mac-a', ts: 1_000, type: 'heartbeat', ...over })

describe('联邦事件契约', () => {
  it('序列化→解析往返一致；坏行/旧版/无前缀跳过', () => {
    const e = ev({ type: 'tasks', tasks: [{ taskId: 't_1', active: true, sessionKnown: true }] })
    expect(parseEvent(serializeEvent(e))).toEqual(e)
    expect(parseEvent('普通消息')).toBeNull()
    expect(parseEvent('[progress:event] {not json')).toBeNull()
    expect(parseEvent('[progress:event] {"v":2,"machine":"x","ts":1,"type":"heartbeat"}')).toBeNull()
  })
})

describe('机器注册表', () => {
  beforeEach(() => resetRegistryForTests())
  it('摄取更新 lastSeen；按机器去重；快照按最近排序', () => {
    ingestEvent(ev({ machine: 'a', ts: 100 }))
    ingestEvent(ev({ machine: 'b', ts: 200 }))
    ingestEvent(ev({ machine: 'a', ts: 300 }))
    const snap = registrySnapshot()
    expect(snap.map((m) => m.machineId)).toEqual(['a', 'b'])
    expect(snap[0]!.lastSeenMs).toBe(300)
  })
  it('消息页摄取：只认 m.room.message 的联邦事件行；坏行不混入', () => {
    const n = ingestFromMessagesPage([
      { type: 'm.room.message', content: { body: serializeEvent(ev({ machine: 'c', ts: 5 })) } },
      { type: 'm.reaction', content: {} },
      { type: 'm.room.message', content: { body: '聊天噪音' } },
    ])
    expect(n).toBe(1)
    expect(registrySnapshot().map((m) => m.machineId)).toEqual(['c'])
  })
})
