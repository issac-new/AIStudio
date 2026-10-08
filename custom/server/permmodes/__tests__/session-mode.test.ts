// 会话权限档 v4 通道守门：存储 CRUD、执法三级链（阶梯>会话>全局）、引擎映射与
// 切档子集、REST 查/切/清（真实 Koa 挂载）。引擎协议锚=upstream/zcode
// packages/shared/src/zcode-protocol-v4/command.ts:39/216（createSession.config.mode
// 与 switchCollaborationMode build/edit/plan/yolo）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'sess-mode-'))
let base = ''
let srv: ReturnType<typeof createServer>

beforeAll(async () => {
  process.env.HERMES_SESSION_MODES_DIR = dir
  process.env.HERMES_TOOL_ENFORCE = '1'
  delete process.env.HERMES_TOOL_ENFORCE_MODE
  const { sessionModeRoutes } = await import('../session-mode-controller')
  const app = new Koa()
  app.use(bodyParser())
  app.use(sessionModeRoutes.routes())
  srv = createServer(app.callback())
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
})

afterAll(() => {
  delete process.env.HERMES_SESSION_MODES_DIR
  delete process.env.HERMES_TOOL_ENFORCE
  rmSync(dir, { recursive: true, force: true })
  return new Promise<void>((r) => srv.close(() => r()))
})

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

describe('会话档存储', () => {
  it('set/get/clear 往返 + 非法档拒绝', async () => {
    const store = await import('../session-mode-store')
    store.setSessionMode('chen', 'acceptEdits')
    expect(store.sessionModeOf('chen')).toBe('acceptEdits')
    expect(store.sessionModeOf('wei')).toBeNull()
    expect(store.isSessionPermissionMode('turbo')).toBe(false)
    expect(store.clearSessionMode('chen')).toBe(true)
    expect(store.clearSessionMode('chen')).toBe(false)
    expect(store.sessionModeOf('chen')).toBeNull()
  })
})

describe('执法三级链（阶梯＞会话档＞全局档）', () => {
  it('会话档胜全局档：acceptEdits 放 write、拒 exec', async () => {
    const { evaluateEnforcement } = await import('../../toolpipeline/enforce-gate')
    const env = {
      globalMode: 'readonly' as const,
      sessionModeOf: (p?: string) => (p === 'chen' ? ('acceptEdits' as const) : null),
      ladderOf: () => null,
    }
    const w = evaluateEnforcement('write_file', {}, 'chen', env)
    expect(w).toMatchObject({ enforcing: true, allow: true })
    const e = evaluateEnforcement('terminal_exec', {}, 'chen', env)
    expect(e).toMatchObject({ enforcing: true, allow: false, rule: 'mode-needs-approval' })
    expect((e as { error: string }).error).toContain('会话档')
    // 无会话档的 profile 退全局档（readonly 拒 write）
    const g = evaluateEnforcement('write_file', {}, 'wei', env)
    expect(g).toMatchObject({ enforcing: true, allow: false, rule: 'mode-off' })
  })

  it('阶梯在位则阶梯胜（会话档不越权放行）', async () => {
    const { evaluateEnforcement } = await import('../../toolpipeline/enforce-gate')
    const env = {
      sessionModeOf: () => 'bypassPermissions' as const,
      ladderOf: () => ({
        profileId: 'chen', level: 'insight', maxRiskTier: 'low', approvalPoints: [], scope: 'profile',
      }),
    }
    const v = evaluateEnforcement('write_file', {}, 'chen', env)
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'ladder-insight-readonly' })
  })
})

describe('引擎档映射与切档子集', () => {
  it('七档→六档建会话映射 + switchCollaborationMode 可切子集', async () => {
    const pm = await import('../permission-modes')
    expect(pm.ENGINE_MODE_MAP['readonly']).toBe('plan')
    expect(pm.ENGINE_MODE_MAP['bypassPermissions']).toBe('yolo')
    expect(pm.toEngineSwitchMode('plan')).toBe('plan')
    expect(pm.toEngineSwitchMode('auto')).toBeNull() // 引擎面 auto 不可切（command.ts:216）
    expect(pm.toEngineSwitchMode('dontAsk')).toBeNull()
  })
})

describe('REST 查/切/清', () => {
  it('PUT 合法档落盘+GET 读回；非法档 400；DELETE 清除', async () => {
    const put = await req('PUT', '/api/hermes/permmodes/session-mode/chen', { mode: 'plan' })
    expect(put.status).toBe(200)
    expect(put.json.engineCreateMode).toBe('plan')
    const get = await req('GET', '/api/hermes/permmodes/session-mode/chen')
    expect(get.json.sessionMode).toBe('plan')
    const bad = await req('PUT', '/api/hermes/permmodes/session-mode/chen', { mode: 'turbo' })
    expect(bad.status).toBe(400)
    const live = await req('PUT', '/api/hermes/permmodes/session-mode/chen',
      { mode: 'auto', sessionId: 's1', workspacePath: '/tmp/w' })
    expect(live.json.liveSwitch).toBe('not_switchable') // auto 族建会话生效，会话内不可切——如实
    const del = await req('DELETE', '/api/hermes/permmodes/session-mode/chen')
    expect(del.json.removed).toBe(true)
    const get2 = await req('GET', '/api/hermes/permmodes/session-mode/chen')
    expect(get2.json.sessionMode).toBeNull()
  })
})
