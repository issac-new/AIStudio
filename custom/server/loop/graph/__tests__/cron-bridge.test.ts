// cron-bridge 守门（T3b，spec：2026-09-25-loop-cron-bridge-design.md）：
// 调度单写者=hermes cron。桥接开关/token fail-closed/loopback 限源/幂等注册。
import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CRON_BRIDGE_JOB_NAME, CRON_BRIDGE_TICK_PATH, buildTickScript,
  ensureLoopTickCronJob, isCronBridgeEnabled, registerLoopCronBridgeRoutes, setCronBridgeTick,
} from '../cron-bridge'

function fakeApp() {
  const middlewares: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = []
  return {
    app: { use: (mw: any) => middlewares.push(mw) },
    async run(ctx: any) {
      let ended = false
      for (const mw of middlewares) {
        await mw(ctx, async () => { ended = true })
        if (ctx.status !== undefined || ended) break
      }
      return ctx
    },
  }
}

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST', path: CRON_BRIDGE_TICK_PATH, ip: '127.0.0.1',
    request: { headers: { 'x-loop-bridge-token': 'tok-1' } },
    status: undefined as number | undefined, body: undefined as unknown,
    ...overrides,
  }
}

afterEach(() => { setCronBridgeTick(null) })

describe('桥接开关', () => {
  it('LOOP_SCHEDULER=cron 才启用，缺省关闭', () => {
    expect(isCronBridgeEnabled({})).toBe(false)
    expect(isCronBridgeEnabled({ LOOP_SCHEDULER: 'internal' })).toBe(false)
    expect(isCronBridgeEnabled({ LOOP_SCHEDULER: 'cron' })).toBe(true)
  })
})

describe('tick 脚本', () => {
  it('curl 指向本进程 tick 端点并携带 token', () => {
    const s = buildTickScript(8647, 'tok-1')
    expect(s).toContain('http://127.0.0.1:8647/api/loop/cron-bridge/tick')
    expect(s).toContain('x-loop-bridge-token: tok-1')
  })
})

describe('公开段路由守门', () => {
  const envOn = { LOOP_SCHEDULER: 'cron', LOOP_CRON_BRIDGE_TOKEN: 'tok-1' }

  it('未启用桥接 → 404（默认部署零新增面）', async () => {
    const { app, run } = fakeApp()
    registerLoopCronBridgeRoutes(app, {})
    const c = await run(ctx())
    expect(c.status).toBe(404)
  })

  it('token 未配置 → 401 fail-closed；token 错 → 401；非回环 → 403', async () => {
    const { app, run } = fakeApp()
    registerLoopCronBridgeRoutes(app, { LOOP_SCHEDULER: 'cron' })
    expect((await run(ctx())).status).toBe(401)
    registerLoopCronBridgeRoutes(app, envOn)
    expect((await run(ctx({ request: { headers: { 'x-loop-bridge-token': 'bad' } } }))).status).toBe(401)
    expect((await run(ctx({ ip: '192.168.1.5' }))).status).toBe(403)
  })

  it('token 正确且 tick 已注入 → 204 并执行 poll；tick 未就绪 → 503', async () => {
    const { app, run } = fakeApp()
    registerLoopCronBridgeRoutes(app, envOn)
    expect((await run(ctx())).status).toBe(503)
    let polled = 0
    setCronBridgeTick(async () => { polled += 1 })
    const c = await run(ctx())
    expect(c.status).toBe(204)
    expect(polled).toBe(1)
  })
})

describe('幂等注册', () => {
  it('同名任务已存在即跳过；不存在则写 600 脚本并 cron create', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cron-bridge-'))
    const calls: string[][] = []
    let listOutput = 'no jobs'
    const exec = async (args: string[]) => {
      calls.push(args)
      if (args[1] === 'list') return { stdout: listOutput, stderr: '' }
      listOutput = `1  ${CRON_BRIDGE_JOB_NAME}  1m` // 注册后 list 可见
      return { stdout: 'created', stderr: '' }
    }
    const logs: string[] = []
    const created = await ensureLoopTickCronJob({ port: 8647, token: 'tok-1', hermesHome: dir, exec, log: (m) => logs.push(m) })
    expect(created).toBe(true)
    const scriptPath = join(dir, 'scripts', 'loop-cron-bridge.sh')
    expect(readFileSync(scriptPath, 'utf8')).toContain('127.0.0.1:8647')
    expect(statSync(scriptPath).mode & 0o777).toBe(0o600)
    const createArgs = calls.find((a) => a[1] === 'create')!
    expect(createArgs).toContain('1m')
    expect(createArgs).toContain(CRON_BRIDGE_JOB_NAME)
    expect(createArgs).toContain(scriptPath)
    const again = await ensureLoopTickCronJob({ port: 8647, token: 'tok-1', hermesHome: dir, exec, log: (m) => logs.push(m) })
    expect(again).toBe(false)
    expect(calls.filter((a) => a[1] === 'create')).toHaveLength(1)
    expect(logs.join('\n')).toContain('跳过')
    rmSync(dir, { recursive: true, force: true })
  })
})
