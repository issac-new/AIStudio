// /api/evidence REST 守门（S-C：verdict 三态必填、at 可信面、actor；S-D：写失败 5xx 只透传 code）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { evidenceRoutes } from '../evidence-controller'
import { loadEvidence } from '../evidence-store'

type Handler = (ctx: Record<string, unknown>) => Promise<void>

/** 从 @koa/router 的 layer 栈取裸 handler（不经 HTTP，直接喂 fake ctx）。 */
function handlerFor(method: string, path: string): Handler {
  const layers = (evidenceRoutes as unknown as {
    stack: Array<{ path: string; methods: string[]; stack: Array<(...a: unknown[]) => unknown> }>
  }).stack
  const layer = layers.find((l) => l.path.endsWith(path) && l.methods.includes(method))
  if (!layer) throw new Error(`route not found: ${method} ${path}`)
  return layer.stack[layer.stack.length - 1] as Handler
}

function fakeCtx(params: Record<string, string>, body: Record<string, unknown>, state: Record<string, unknown> = {}) {
  return { params, request: { body }, query: {}, state, status: 200, body: undefined }
}

const post = () => handlerFor('POST', '/:taskId')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'evidence-api-'))
  process.env.HERMES_EVIDENCE_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_EVIDENCE_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('kind × verdict 强绑定（S-C：缺裁决残条会渲染 "undefined" 遮蔽真实裁决）', () => {
  it('verification 必带三态裁决；其余 kind 禁带 verdict', async () => {
    const ctx = fakeCtx({ taskId: 't1' }, { evidenceId: 'v1', kind: 'verification', ref: 'x' })
    await post()(ctx)
    expect(ctx.status).toBe(400)
    expect((ctx.body as { detail: string }).detail).toContain('verdict')

    const ok = fakeCtx({ taskId: 't1' }, { evidenceId: 'v1', kind: 'verification', ref: 'x', verdict: 'pass' })
    await post()(ok)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ ok: true, added: true })

    const stray = fakeCtx({ taskId: 't1' }, { evidenceId: 'a1', kind: 'artifact', ref: 'x', verdict: 'pass' })
    await post()(stray)
    expect(stray.status).toBe(400)
    expect((stray.body as { detail: string }).detail).toContain('仅 kind=verification')
    expect(loadEvidence('t1').records).toHaveLength(1)  // 违例未落账
  })
})

describe('at 可信面 + actor（S-C 3.2 轻改）', () => {
  it('at 服务端时间戳为准，client 自报值记 claimedAt；非法 at 拒收', async () => {
    const before = Date.now()
    const ctx = fakeCtx({ taskId: 't1' }, { evidenceId: 'a1', kind: 'artifact', ref: 'x', at: 123 })
    await post()(ctx)
    const saved = loadEvidence('t1').records[0]
    expect(saved.claimedAt).toBe(123)
    expect(saved.at).toBeGreaterThanOrEqual(before)  // 不是 client 自报的 123

    const bad = fakeCtx({ taskId: 't1' }, { evidenceId: 'a2', kind: 'artifact', ref: 'x', at: Number.NaN })
    await post()(bad)
    expect(bad.status).toBe(400)
    expect(loadEvidence('t1').records).toHaveLength(1)  // NaN 不落盘
  })

  it('actor 取 ctx.state.user（approval 域 callerOf 同源）；无鉴权部署留空', async () => {
    const named = fakeCtx({ taskId: 't1' }, { evidenceId: 'a1', kind: 'artifact', ref: 'x' }, { user: { id: 7, username: 'alice' } })
    await post()(named)
    expect(loadEvidence('t1').records[0].actor).toBe('alice')

    const byId = fakeCtx({ taskId: 't1' }, { evidenceId: 'a2', kind: 'artifact', ref: 'x' }, { user: { id: 7 } })
    await post()(byId)
    expect(loadEvidence('t1').records[1].actor).toBe('7')

    const anon = fakeCtx({ taskId: 't1' }, { evidenceId: 'a3', kind: 'artifact', ref: 'x' })
    await post()(anon)
    expect(loadEvidence('t1').records[2].actor).toBeUndefined()
  })
})

describe('写失败 5xx 只透传 code（S-D：不再 200 ok:true + spread err）', () => {
  it('落盘失败回 500，响应体只有 ok/code', async () => {
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'x', 'utf8')  // 占住目录位 → 落盘必失败
    process.env.HERMES_EVIDENCE_DIR = blocker
    const ctx = fakeCtx({ taskId: 't1' }, { evidenceId: 'a1', kind: 'artifact', ref: 'x' })
    await post()(ctx)
    expect(ctx.status).toBe(500)
    expect(ctx.body).toEqual({ ok: false, code: 'write_failed' })  // 无 syscall/errno/path
  })
})
