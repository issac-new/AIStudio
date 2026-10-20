// overlay/custom/server/harness/__tests__/sim-launch.test.ts
// 受控 harness 启动器守门：默认关闭、super_admin 闸、runId 校验、固定脚本起停。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'

let dir: string
let root: string
let server: import('node:http').Server
let port: number
let app: import('koa').default
let user: { role: string; username: string } | null = null

async function boot(envEnabled: boolean): Promise<void> {
  process.env.SIM_HARNESS_LAUNCH = envEnabled ? '1' : '0'
  process.env.SIM_HARNESS_DIR = join(dir, 'simharness')
  process.env.SIM_ROOT = root
  vi.resetModules()
  const Koa = (await import('koa')).default
  const { simLaunchRoutes } = await import('../sim-launch')
  app = new Koa()
  app.use(async (ctx: any, next) => {
    if (ctx.method === 'POST' || ctx.method === 'PUT' || ctx.method === 'PATCH') {
      const chunks: Buffer[] = []
      for await (const chunk of ctx.req) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString('utf8')
      ctx.request.body = raw ? JSON.parse(raw) : {}
    }
    if (user) ctx.state.user = user
    await next()
  })
  app.use(simLaunchRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sim-launch-'))
  root = join(dir, 'sim-root')
  mkdirSync(join(dir, 'simharness'), { recursive: true })
  mkdirSync(join(root, 'logs'), { recursive: true })
  writeFileSync(join(dir, 'simharness', 'aipay-scenario.sh'), '#!/bin/bash\necho started\nsleep 5\n')
  user = { role: 'super_admin', username: 'tester' }
})

afterEach(async () => {
  await new Promise<void>((r) => server?.close(() => r()) ?? r())
  delete process.env.SIM_HARNESS_LAUNCH
  delete process.env.SIM_HARNESS_DIR
  delete process.env.SIM_ROOT
  rmSync(dir, { recursive: true, force: true })
})

const get = async (p: string) => {
  const res = await fetch(`http://127.0.0.1:${port}${p}`)
  return { status: res.status, body: await res.json() }
}
const post = async (p: string, body: unknown) => {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

describe('受控 harness 启动器', () => {
  it('默认关闭：status enabled=false，start 403 且给人话', async () => {
    await boot(false)
    const st = await get('/status')
    expect(st.status).toBe(200)
    expect(st.body.enabled).toBe(false)
    const start = await post('/start', { runId: 'r1' })
    expect(start.status).toBe(403)
    expect(String(start.body.error)).toContain('SIM_HARNESS_LAUNCH=1')
  })

  it('启用后：非 super_admin 403；非法 runId 400', async () => {
    await boot(true)
    user = { role: 'admin', username: 'ops' }
    const denied = await post('/start', { runId: 'r1' })
    expect(denied.status).toBe(403)
    user = { role: 'super_admin', username: 'tester' }
    const bad = await post('/start', { runId: 'bad name!' })
    expect(bad.status).toBe(400)
    expect(String(bad.body.error)).toContain('runId')
  })

  it('启用后：固定脚本起跑、status running、stop 终止', async () => {
    await boot(true)
    const start = await post('/start', { runId: 'run-test-1' })
    expect(start.status).toBe(200)
    expect(start.body.running).toBe(true)
    expect(start.body.process?.runId).toBe('run-test-1')
    const st = await get('/status')
    expect(st.body.running).toBe(true)
    expect(st.body.process?.pid).toBeGreaterThan(0)
    const stop = await post('/stop', {})
    expect(stop.status).toBe(200)
    await new Promise((r) => setTimeout(r, 1200))
    const after = await get('/status')
    expect(after.body.running).toBe(false)
  })

  it('已有驱动锁：拒绝双开 409', async () => {
    await boot(true)
    mkdirSync(join(root, '.driver.lock.d'))
    const start = await post('/start', { runId: 'run-test-2' })
    expect(start.status).toBe(409)
    expect(String(start.body.error)).toContain('驱动锁')
  })
})
