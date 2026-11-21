// overlay/custom/server/controllers/sim/__tests__/capture-plan.test.ts
// P3 拍摄位注册表投影契约：四态解析/fail-soft 空态（spec 2026-11-21-p2-p4）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseCapturePlan } from '../capture-plan'

describe('capture-plan 四态解析（P3）', () => {
  it('page/none/repo/file 四态与 action 第四列', () => {
    const entries = parseCapturePlan([
      '# 头注',
      'smoke|/app|fanfan',
      'analysis|/app/canvas|fanfan|click:#tab-analysis',
      'reqgate|none|真值在 state',
      'devimpl|repo|产物证据型',
      'report|file:runs/__RUN__/report.md',
      '',
    ].join('\n'))
    expect(entries).toEqual([
      { step: 'smoke', kind: 'page', url: '/app', user: 'fanfan' },
      { step: 'analysis', kind: 'page', url: '/app/canvas', user: 'fanfan', action: 'click:#tab-analysis' },
      { step: 'reqgate', kind: 'none', reason: '真值在 state' },
      { step: 'devimpl', kind: 'repo', reason: '产物证据型' },
      { step: 'report', kind: 'file', path: 'runs/__RUN__/report.md' },
    ])
  })

  it('none 缺理由补占位（不静默空）', () => {
    const [e] = parseCapturePlan('x|none')
    expect(e.reason).toContain('未注理由')
  })
})

describe('capture-plan 端点 fail-soft', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sim-cap-')); process.env.SIM_CAPTURE_PLAN_PATH = join(dir, 'capture-plan.env') })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.SIM_CAPTURE_PLAN_PATH })

  it('文件缺席＝available:false 空表（P4 归档后语义）', async () => {
    const { createSimCapturePlanRouter } = await import('../capture-plan')
    const router = createSimCapturePlanRouter()
    const ctx = { method: 'GET', path: '/api/sim/capture-plan', params: {}, status: 200, body: {} } as unknown as import('koa').Context
    await router.stack[0].stack[0](ctx, async () => {})
    const body = ctx.body as { ok: boolean; available: boolean; plan: unknown[] }
    expect(body.ok).toBe(true)
    expect(body.available).toBe(false)
    expect(body.plan).toEqual([])
  })

  it('真文件投影 available:true＋解析行数', async () => {
    writeFileSync(process.env.SIM_CAPTURE_PLAN_PATH!, 'a|/x\nb|none|r\n')
    const { createSimCapturePlanRouter } = await import('../capture-plan')
    const router = createSimCapturePlanRouter()
    const ctx = { method: 'GET', path: '/api/sim/capture-plan', params: {}, status: 200, body: {} } as unknown as import('koa').Context
    await router.stack[0].stack[0](ctx, async () => {})
    const body = ctx.body as { available: boolean; plan: unknown[] }
    expect(body.available).toBe(true)
    expect(body.plan).toHaveLength(2)
  })
})
