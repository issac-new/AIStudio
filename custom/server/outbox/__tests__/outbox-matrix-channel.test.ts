// outbox matrix 通道活体验证（Always-on Agents P2 补漏，2026-11-16）：
// 本地起一个假 Matrix homeserver（真 HTTP、真 fetch），配齐 gateway 凭据链
// （HERMES_HOME/profiles/<gw>/.env → readGatewayMatrixEnv → resolveMatrixDispatchEnv），
// 验证 dispatchDue 的 matrix 通道：真 PUT m.room.message（txn/鉴权头/正文）、
// 500→30s 退避→重试成功→终态 delivered。inbox 通道已在 outbox-dispatcher.test.ts 覆盖。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { enqueueOutbox, loadOutbox } from '../outbox-store'
import { dispatchDue } from '../outbox-dispatcher'

let dir: string
let srv: Server
let base: string
const received: Array<{ auth: string; url: string; body: any }> = []
let failNext = 0

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'outbox-matrix-'))
  process.env.OUTBOX_PATH = join(dir, 'outbox.json')
  process.env.HERMES_INBOX_DIR = join(dir, 'inbox')
  process.env.RUN_OUTCOME_LEDGER_PATH = join(dir, 'run-outcomes.jsonl')
  process.env.ATTENTION_PREFS_PATH = join(dir, 'attention.json')
  // 凭据链走真实解析：临时 HERMES_HOME + profiles/live-gw/.env
  process.env.HERMES_HOME = join(dir, 'home')
  process.env.LOOP_MATRIX_PROFILE = 'live-gw'
  const profDir = join(process.env.HERMES_HOME, 'profiles', 'live-gw')
  mkdirSync(profDir, { recursive: true })

  received.length = 0
  failNext = 0
  srv = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      received.push({
        auth: String(req.headers.authorization ?? ''),
        url: req.url ?? '',
        body: raw ? JSON.parse(raw) : null,
      })
      if (failNext > 0) {
        failNext -= 1
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end('{"errcode":"M_UNKNOWN","error":"boom"}')
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ event_id: `$ev-${received.length}` }))
    })
  })
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`
  writeFileSync(join(profDir, '.env'), [
    `MATRIX_HOMESERVER=${base}`,
    'MATRIX_ACCESS_TOKEN=syt_test_token',
    'MATRIX_USER_ID=@outbox-test:localhost',
  ].join('\n'), 'utf8')
  process.env.OUTBOX_MATRIX_ROOM = '!live-room:localhost'
})

afterEach(() => {
  for (const k of ['OUTBOX_PATH', 'HERMES_INBOX_DIR', 'RUN_OUTCOME_LEDGER_PATH', 'ATTENTION_PREFS_PATH', 'HERMES_HOME', 'LOOP_MATRIX_PROFILE', 'OUTBOX_MATRIX_ROOM']) delete process.env[k]
  srv.close()
  rmSync(dir, { recursive: true, force: true })
})

const msg = (over: Record<string, unknown> = {}) => ({
  recipient: { kind: 'member', name: 'owner' },
  body: 'matrix live check', source: 'test', channel: 'matrix' as const, ...over,
})

describe('outbox matrix 通道（假 homeserver 真发送）', () => {
  it('成功发送：真 PUT m.room.message 带鉴权头与 txn；消息终态 delivered', async () => {
    const now = new Date(2026, 0, 15, 15, 0, 0).getTime()
    const enq = enqueueOutbox(msg({ at: now }))
    expect(enq.enqueued).toBe(true)
    const r = await dispatchDue({ now })
    expect(r.delivered).toBe(1)
    expect(r.failed).toBe(0)
    expect(received).toHaveLength(1)
    const hit = received[0]
    expect(hit.auth).toBe('Bearer syt_test_token')
    expect(hit.url).toContain('/_matrix/client/v3/rooms/!live-room%3Alocalhost/send/m.room.message/')
    expect(hit.body.body).toBe('matrix live check')
    expect(hit.body.msgtype).toBe('m.text')
    const stored = loadOutbox()[0]
    expect(stored.status).toBe('delivered')
    expect(stored.deliveredAt).toBe(now)
  })

  it('发送失败退避：500→attempts=1 且 notBefore=+30s；重试轮成功转 delivered', async () => {
    const now = new Date(2026, 0, 15, 15, 0, 0).getTime()
    failNext = 1
    enqueueOutbox(msg({ at: now }))
    const r1 = await dispatchDue({ now })
    expect(r1.failed).toBe(1)
    const after1 = loadOutbox()[0]
    expect(after1).toMatchObject({ status: 'pending', attempts: 1 })
    expect(after1.notBefore).toBe(now + 30_000)
    // 未到退避时点：不出队
    const rMid = await dispatchDue({ now: now + 29_000 })
    expect(rMid.scanned).toBe(0)
    // 到点重试：假 homeserver 恢复 200（attempts=总尝试数：1 败 + 1 成 = 2）
    const r2 = await dispatchDue({ now: now + 30_001 })
    expect(r2.delivered).toBe(1)
    expect(loadOutbox()[0]).toMatchObject({ status: 'delivered', attempts: 2 })
    expect(received).toHaveLength(2)
  })

  it('OUTBOX_MATRIX_ROOM 未配置：失败并退避（不静默丢）', async () => {
    delete process.env.OUTBOX_MATRIX_ROOM
    const now = new Date(2026, 0, 15, 15, 0, 0).getTime()
    enqueueOutbox(msg({ at: now }))
    const r = await dispatchDue({ now })
    expect(r.failed).toBe(1)
    expect(loadOutbox()[0].lastError).toContain('matrix_not_configured')
    expect(received).toHaveLength(0)
  })
})
