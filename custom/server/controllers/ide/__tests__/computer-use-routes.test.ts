// 电脑操作端点守门（2026-10-18 接通轮）：GET/PUT /api/ide/computer-use——引擎插件
// 真接线（listPlugins/setPluginEnabled），状态/切换均以引擎为单一事实源。
// 注意：engine-bridge 须静态导入+vi.mock（动态 import 不进 mock 注册表，实测
// 会真连引擎握手超时；kanban column-automation.test.ts 同款先例）。
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { connectMock, agentMock, closeMock } = vi.hoisted(() => {
  const agentMock = {
    listPlugins: vi.fn(),
    setPluginEnabled: vi.fn(),
  }
  const closeMock = vi.fn()
  const connectMock = vi.fn(async () => ({
    agent: agentMock,
    clientId: 'test',
    protocolVersion: 1,
    readyAt: 0,
    onReconnected: () => ({ dispose() { /* noop */ } }),
    close: closeMock,
  }))
  return { connectMock, agentMock, closeMock }
})

vi.mock('../../../zcode/engine-bridge', () => ({ connectZCodeEngine: connectMock }))

import { ideNativeRoutes } from '../native-routes'

interface FakeCtx {
  method: string
  path: string
  query: Record<string, string>
  request: { body?: Record<string, unknown> }
  status: number
  body: unknown
}

async function call(method: string, path: string, opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {}): Promise<FakeCtx> {
  const ctx: FakeCtx = {
    method,
    path,
    query: opts.query ?? {},
    request: { body: opts.body },
    status: 200,
    body: undefined,
  }
  await ideNativeRoutes()(ctx as never, async () => { /* next */ })
  return ctx
}

describe('电脑操作端点（引擎插件真接线）', () => {
  beforeEach(() => {
    connectMock.mockReset()
    connectMock.mockImplementation(async () => ({
      agent: agentMock,
      clientId: 'test',
      protocolVersion: 1,
      readyAt: 0,
      onReconnected: () => ({ dispose() { /* noop */ } }),
      close: closeMock,
    }))
    agentMock.listPlugins.mockReset()
    agentMock.setPluginEnabled.mockReset()
    closeMock.mockReset()
  })

  it('GET：插件在场→supported+enabled 投影引擎真值；不在场→supported:false', async () => {
    agentMock.listPlugins.mockResolvedValue({
      plugins: [
        { id: 'rtk-zcode-bridge@inline', enabled: true },
        { id: 'computer-use@zcode-plugins-official', enabled: true },
      ],
    })
    let ctx = await call('GET', '/api/ide/computer-use', { query: { workspacePath: '/w' } })
    expect(ctx.body).toEqual({ ok: true, supported: true, enabled: true, pluginId: 'computer-use@zcode-plugins-official' })
    expect(agentMock.listPlugins).toHaveBeenCalledWith({ workspacePath: '/w' })

    agentMock.listPlugins.mockResolvedValue({ plugins: [{ id: 'other', enabled: true }] })
    ctx = await call('GET', '/api/ide/computer-use')
    expect(ctx.body).toMatchObject({ ok: true, supported: false, enabled: false })
  })

  it('PUT：setPluginEnabled(user 级)+回读真值应答；引擎拒绝→503+detail', async () => {
    agentMock.setPluginEnabled.mockResolvedValue({})
    agentMock.listPlugins.mockResolvedValue({ plugins: [{ id: 'computer-use@zcode-plugins-official', enabled: false }] })
    const ctx = await call('PUT', '/api/ide/computer-use', { body: { enabled: false, workspacePath: '/w' } })
    expect(agentMock.setPluginEnabled).toHaveBeenCalledWith({
      workspacePath: '/w',
      pluginId: 'computer-use@zcode-plugins-official',
      enabled: false,
      scope: 'user',
    })
    // 应答=回读引擎真值（不 echo 请求值）
    expect(ctx.body).toMatchObject({ ok: true, enabled: false })
    expect(ctx.status).toBe(200)

    agentMock.setPluginEnabled.mockRejectedValue(new Error('session busy: tool set immutable'))
    const fail = await call('PUT', '/api/ide/computer-use', { body: { enabled: true } })
    expect(fail.status).toBe(503)
    expect(fail.body).toMatchObject({ ok: false, detail: expect.stringContaining('session busy') })
  })

  it('引擎不可达：GET 如实 ok:false（不 500）；非匹配路径放行', async () => {
    connectMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const ctx = await call('GET', '/api/ide/computer-use')
    expect(ctx.body).toMatchObject({ ok: false, supported: false, detail: expect.stringContaining('ECONNREFUSED') })
    expect(ctx.status).toBe(200)

    const passthrough = await call('GET', '/api/ide/other')
    expect(passthrough.body).toBeUndefined()
  })
})
