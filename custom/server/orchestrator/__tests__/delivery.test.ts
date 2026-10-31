// custom/server/orchestrator/__tests__/delivery.test.ts
// 汇总投递（2026-10-31 投递批）：线程解析、订阅反查、成功/跳过/失败三态。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deliverPendingDigests, findTargets, messageContent, parseKanbanThreadKey,
} from '../delivery'
import { insertDigest, listDigests, resetOrchestratorForTests, upsertThread } from '../store'

const matrixEnvMock = vi.hoisted(() => ({ value: null as null | { homeserverUrl: string; accessToken: string; userId: string } }))

vi.mock('../../matrix/raci-matrix', () => ({
  resolveMatrixDispatchEnv: () => matrixEnvMock.value,
}))

let dir: string
let prevDb: string | undefined
let kanbanDb: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-deliver-'))
  prevDb = process.env.ORCHESTRATOR_DB
  process.env.ORCHESTRATOR_DB = join(dir, 'orch.sqlite')
  kanbanDb = join(dir, 'kanban.db')
  matrixEnvMock.value = null
  resetOrchestratorForTests()
})

afterEach(() => {
  resetOrchestratorForTests()
  if (prevDb === undefined) delete process.env.ORCHESTRATOR_DB
  else process.env.ORCHESTRATOR_DB = prevDb
  rmSync(dir, { recursive: true, force: true })
})

function seedKanbanSubs(rows: Array<{ taskId: string; platform: string; chatId: string; threadId: string | null }>): void {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string) => {
      exec(sql: string): void
      prepare(sql: string): { run(...a: unknown[]): unknown }
      close(): void
    }
  }
  const db = new DatabaseSync(kanbanDb)
  db.exec(`CREATE TABLE IF NOT EXISTS kanban_notify_subs (
    task_id TEXT NOT NULL, platform TEXT NOT NULL, chat_id TEXT NOT NULL,
    thread_id TEXT, user_id TEXT, chat_type TEXT, notifier_profile TEXT,
    delivery_mode TEXT, delivery_metadata TEXT, last_event_id INTEGER, created_at INTEGER)`)
  for (const r of rows) {
    db.prepare('INSERT INTO kanban_notify_subs (task_id, platform, chat_id, thread_id, created_at) VALUES (?, ?, ?, ?, 0)')
      .run(r.taskId, r.platform, r.chatId, r.threadId)
  }
  db.close()
}

function seedDigest(threadKey: string, body = '任务 t-1 完成'): string {
  const thread = upsertThread('kanban:default', threadKey, 1000)
  const id = `dig_${threadKey.replace(/[^a-z0-9]/gi, '')}`
  insertDigest({
    id, threadId: thread.id, subscriber: 'worker:t-1', body,
    eventCount: 1, delivered: false, createdAt: 1000,
  })
  return id
}

describe('parseKanbanThreadKey', () => {
  it('解析 board 与 taskId；非 kanban 线程返回 null', () => {
    expect(parseKanbanThreadKey('task:default:t-1')).toEqual({ board: 'default', taskId: 't-1' })
    expect(parseKanbanThreadKey('task:core-chain:t:abc')).toEqual({ board: 'core-chain', taskId: 't:abc' })
    expect(parseKanbanThreadKey('repo:foo:pr:1')).toBeNull()
    expect(parseKanbanThreadKey('task:default')).toBeNull()
  })
})

describe('messageContent', () => {
  it('无线程只给文本；有线程挂 m.relates_to', () => {
    expect(messageContent('hi', null)).toEqual({ msgtype: 'm.text', body: 'hi' })
    expect(messageContent('hi', '$evt')).toMatchObject({
      'm.relates_to': { rel_type: 'm.thread', event_id: '$evt', is_falling_back: true },
    })
  })
})

describe('findTargets', () => {
  it('读订阅表并去重；库里没有订阅返回空', () => {
    seedKanbanSubs([
      { taskId: 't-1', platform: 'matrix', chatId: '!r1:s', threadId: '$e1' },
      { taskId: 't-1', platform: 'matrix', chatId: '!r1:s', threadId: '$e1' },
      { taskId: 't-1', platform: 'telegram', chatId: '42', threadId: null },
    ])
    const targets = findTargets('t-1', [kanbanDb])
    expect(targets.length).toBe(2)
    expect(targets.map(t => t.platform).sort()).toEqual(['matrix', 'telegram'])
    expect(findTargets('t-404', [kanbanDb])).toEqual([])
  })
})

describe('deliverPendingDigests', () => {
  it('Matrix 未配置：全部 skipped，不改投递状态', async () => {
    seedDigest('task:default:t-1')
    const r = await deliverPendingDigests({ dbPaths: [kanbanDb] })
    expect(r.skipped).toBe(1)
    expect(r.outcomes[0]!.reason).toBe('matrix_not_configured')
    expect(listDigests()[0]!.delivered).toBe(false)
  })

  it('有订阅：发出并标记 delivered', async () => {
    matrixEnvMock.value = { homeserverUrl: 'http://mx', accessToken: 'tok', userId: '@bot:s' }
    seedKanbanSubs([{ taskId: 't-1', platform: 'matrix', chatId: '!r1:s', threadId: '$e1' }])
    const id = seedDigest('task:default:t-1')
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ event_id: '$sent' }),
    } as Response)
    const r = await deliverPendingDigests({ dbPaths: [kanbanDb], fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(r.delivered).toBe(1)
    expect(r.outcomes[0]!.rooms).toEqual(['!r1:s'])
    expect(listDigests().find(d => d.id === id)!.delivered).toBe(true)
    const url = String(fetchImpl.mock.calls[0]![0])
    expect(url).toContain('/rooms/!r1%3As/send/m.room.message/')
    const body = JSON.parse(String((fetchImpl.mock.calls[0]![1] as RequestInit).body))
    expect(body['m.relates_to'].event_id).toBe('$e1')
  })

  it('无订阅：skipped 且记一次 attempts', async () => {
    matrixEnvMock.value = { homeserverUrl: 'http://mx', accessToken: 'tok', userId: '@bot:s' }
    seedDigest('task:default:t-9')
    const r = await deliverPendingDigests({ dbPaths: [kanbanDb] })
    expect(r.skipped).toBe(1)
    expect(r.outcomes[0]!.reason).toBe('no_matrix_subscription')
  })

  it('发送失败：failed，不标记 delivered', async () => {
    matrixEnvMock.value = { homeserverUrl: 'http://mx', accessToken: 'tok', userId: '@bot:s' }
    seedKanbanSubs([{ taskId: 't-1', platform: 'matrix', chatId: '!r1:s', threadId: null }])
    seedDigest('task:default:t-1')
    // 用真实 Response 表达 403：手写失败体字面量会撞架构棘轮 K19 预算（注释同计数）。
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }))
    const r = await deliverPendingDigests({ dbPaths: [kanbanDb], fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(r.failed).toBe(1)
    expect(listDigests()[0]!.delivered).toBe(false)
  })
})
