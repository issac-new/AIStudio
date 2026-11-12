// overlay[expdual] 控制器 HTTP 级测试：真实 Koa 路由 + 临时台账（不走 auth 中间件）。
//
// 覆盖路由前缀、响应形状、拒绝码与写后读一致——单测纯函数之外的接线风险。
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Koa from 'koa'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expDualRoutes } from '../dual-controller'

const dir = mkdtempSync(join(tmpdir(), 'expdual-http-'))
let server: ReturnType<Koa['listen']>
let base = ''

beforeAll(async () => {
  process.env.EXP_DUAL_STORE = dir
  const app = new Koa()
  // 极简 JSON 体解析（服务端生产用 studio bodyparser；此处只复现请求契约）
  app.use(async (ctx, next) => {
    if (ctx.method !== 'GET') {
      const chunks: Buffer[] = []
      for await (const chunk of ctx.req) chunks.push(chunk as Buffer)
      const raw = Buffer.concat(chunks).toString('utf8')
      ;(ctx.request as { body?: unknown }).body = raw ? JSON.parse(raw) : {}
    }
    await next()
  })
  app.use(expDualRoutes.routes()).use(expDualRoutes.allowedMethods())
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  rmSync(join(dir, 'dual-store.json'), { force: true })
})

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, body: await res.json() }
}

async function post(path: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { status: res.status, body: await res.json() }
}

describe('双轨台账 HTTP 面', () => {
  it('GET /api/expdual/banks 空库', async () => {
    const r = await get('/api/expdual/banks')
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.counts).toEqual({ facts: 0, tips: 0, retired: 0, removed: 0 })
    expect(r.body.chunk).toBe(1)
  })

  it('POST /induce 写入后 /banks 读回；非法 TIP 返回 400 且逐条原因', async () => {
    const add = await post('/api/expdual/induce', {
      ops: [{ op: 'ADD', channel: 'fact', text: 'workspace/input 目录是上游素材目录' }],
    })
    expect(add.status).toBe(200)
    expect(add.body.applied).toEqual(['ADD f-1'])

    const banks = await get('/api/expdual/banks')
    expect(banks.body.counts.facts).toBe(1)
    expect(banks.body.facts[0].text).toContain('workspace/input')

    const bad = await post('/api/expdual/induce', {
      ops: [{ op: 'ADD', channel: 'tip', text: '继续检查其他位置' }],
    })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('ops_rejected')
    expect(bad.body.problems[0]).toContain('缺条件')
  })

  it('POST /blame 缺步骤返回 400；合法归因退役规则', async () => {
    await post('/api/expdual/induce', {
      ops: [{ op: 'ADD', channel: 'tip', text: '', condition: '条件 A', action: '动作 A' }],
    })
    const bad = await post('/api/expdual/blame', { taskRef: 'task-1', ruleId: 't-1', note: '误导' })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('blame_rejected')

    const okRes = await post('/api/expdual/blame', {
      taskRef: 'task-1', step: 'step-2', ruleId: 't-1', note: '按规则先读模板导致格式错',
    })
    expect(okRes.status).toBe(200)
    expect(okRes.body.retired).toMatchObject({ id: 't-1', reason: 'blame' })
    const retired = await get('/api/expdual/retired')
    expect(retired.body.items).toHaveLength(1)
  })

  it('POST /synthesize/detect 空池返回空候选；/chunk/close 递增批次', async () => {
    const detect = await post('/api/expdual/synthesize/detect', {})
    expect(detect.status).toBe(200)
    expect(detect.body.candidates).toEqual([])

    const closed = await post('/api/expdual/chunk/close', {})
    expect(closed.status).toBe(200)
    expect(closed.body.snapshot.chunk).toBe(1)
    expect(closed.body.chunk).toBe(2)
  })

  it('POST /classify 返回初判与理由；空文本 400', async () => {
    const r = await post('/api/expdual/classify', { text: '使用 openpyxl 检查原始存储值' })
    expect(r.status).toBe(200)
    expect(r.body.classification.channel).toBe('tip')
    expect(r.body.classification.rationale).toContain('命令式')
    expect((await post('/api/expdual/classify', { text: '' })).status).toBe(400)
  })
})
