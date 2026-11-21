// overlay/custom/server/controllers/sim/__tests__/scenarios.test.ts
// P2 场景库投影契约：发现/摘要/fail-soft 空态/非法名 400（spec 2026-11-21-p2-p4）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Router from '@koa/router'
import type { Context } from 'koa'

// K19 规避：状态码命名常量
const OK_STATUS = 200, NOT_FOUND = 404, BAD_REQUEST = 400

async function makeRouter(): Promise<Router> {
  const mod = await import('../scenarios')
  return mod.createSimScenariosRouter()
}

function ctxOf(method: string, path: string): Context {
  return { method, path, params: {}, status: OK_STATUS, body: {} as Record<string, unknown> } as unknown as Context
}

async function dispatch(router: Router, ctx: Context): Promise<void> {
  for (const layer of router.stack) {
    if (!layer.methods.includes(ctx.method) || typeof layer.path !== 'string') continue
    const pat = layer.path.split('/'), req = ctx.path.split('/')
    if (pat.length !== req.length) continue
    const params: Record<string, string> = {}
    let hit = true
    for (let i = 0; i < pat.length; i++) {
      if (pat[i].startsWith(':')) params[pat[i].slice(1)] = decodeURIComponent(req[i])
      else if (pat[i] !== req[i]) { hit = false; break }
    }
    if (!hit) continue
    ;(ctx as { params?: Record<string, string> }).params = params
    await layer.stack[0](ctx, async () => {})
    return
  }
  throw new Error(`no route: ${ctx.method} ${ctx.path}`)
}

describe('sim scenarios 投影（P2）', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sim-scen-'))
    process.env.SIM_SCENARIOS_ROOT = root
  })
  afterEach(() => { rmSync(root, { recursive: true, force: true }); delete process.env.SIM_SCENARIOS_ROOT })

  it('fail-soft：库根缺席（P4 归档后语义）＝available:false 空列表', async () => {
    process.env.SIM_SCENARIOS_ROOT = join(root, 'nonexistent')
    const router = await makeRouter()
    const ctx = ctxOf('GET', '/api/sim/scenarios')
    await dispatch(router, ctx)
    expect(ctx.status).toBe(OK_STATUS)
    const body = ctx.body as { ok: boolean; available: boolean; scenarios: unknown[] }
    expect(body.ok).toBe(true)
    expect(body.available).toBe(false)
    expect(body.scenarios).toEqual([])
  })

  it('发现：目录扫描排除 _template，附 roster 数组摘要', async () => {
    mkdirSync(join(root, 'mixed-motive-bidding'), { recursive: true })
    writeFileSync(join(root, 'mixed-motive-bidding', 'roster.env'),
      '# 注释\nUSERS=(admin mediator unit_a)\nINSTANCED_USERS=(mediator)\nboards_of() { :; }\n')
    mkdirSync(join(root, '_template'), { recursive: true })
    const router = await makeRouter()
    const ctx = ctxOf('GET', '/api/sim/scenarios')
    await dispatch(router, ctx)
    const body = ctx.body as { available: boolean; scenarios: Array<{ name: string; roster: { users: string[]; instancedUsers: string[] } | null }> }
    expect(body.available).toBe(true)
    expect(body.scenarios.map((s) => s.name)).toEqual(['mixed-motive-bidding'])
    expect(body.scenarios[0].roster?.users).toEqual(['admin', 'mediator', 'unit_a'])
    expect(body.scenarios[0].roster?.instancedUsers).toEqual(['mediator'])
  })

  it('详情：roster 缺席场景 404；非法名 400', async () => {
    mkdirSync(join(root, 'bare'), { recursive: true })
    const router = await makeRouter()
    const missing = ctxOf('GET', '/api/sim/scenarios/bare')
    await dispatch(router, missing)
    expect(missing.status).toBe(NOT_FOUND)
    const bad = ctxOf('GET', '/api/sim/scenarios/..%2Fescape')
    await dispatch(router, bad)
    expect(bad.status).toBe(BAD_REQUEST)
  })
})
