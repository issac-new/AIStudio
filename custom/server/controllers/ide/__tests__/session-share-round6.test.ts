// overlay/custom/server/controllers/ide/__tests__/session-share-round6.test.ts
// R6 共享会话守门（routa shared-session 语义）：invite token 创建 / 四档模式
// role 判定（host/collaborator/viewer）/ prompt 审批门（approve 待人审，
// prompt 直接入队，viewer 拒绝）/ patch 356 漂移。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 直接挂载控制器 Router 到最小 koa 上下文驱动（不走全量 bootstrap）
import Router from '@koa/router'

interface CtxShape {
  params: Record<string, string>
  request: { body: Record<string, unknown>; query?: Record<string, unknown> }
  state: { user?: { username?: string } }
  status: number
  body: unknown
}

async function run(router: Router, method: 'get' | 'post', path: string, ctx: Partial<CtxShape>): Promise<CtxShape> {
  const full: CtxShape = {
    params: {}, request: { body: {} }, state: {}, status: 200, body: undefined,
    ...ctx,
  } as CtxShape
  const stack = router.stack.filter((l) => l.methods.includes(method.toUpperCase()) && l.match(path))
  const layer = stack[0]
  expect(layer, `route ${method} ${path} exists`).toBeTruthy()
  const layerAny = layer as unknown as { params?: Record<string, string>; stack: Array<(c: CtxShape, next?: () => Promise<void>) => Promise<void>> }
  // koa-router 的 params 提取：layer.match(path) 命中后，命名参数经 layer 的
  // paramNames + 匹配段重建（绕过 Router 内部实现，直接按注册路径拆）
  const pathParts = path.split('/').filter(Boolean)
  const layerParts = layer.path.split('/').filter(Boolean)
  const params: Record<string, string> = {}
  layerParts.forEach((seg, i) => {
    if (seg.startsWith(':')) params[seg.slice(1)] = pathParts[i] ?? ''
  })
  full.params = { ...(layerAny.params ?? {}), ...params }
  for (const mw of layerAny.stack) {
    await mw(full, async () => {})
  }
  return full
}

describe('R6 共享会话（routa shared-session 语义）', () => {
  let router: Router
  beforeEach(async () => {
    const mod = await import('../session-share')
    router = mod.default as unknown as Router
  })

  it('create：发 invite token + host role + mode 合法校验', async () => {
    const created = await run(router, 'post', '/api/ide/session-share/create', {
      request: { body: { sessionId: 's1', mode: 'approve' } },
      state: { user: { username: 'alice' } },
    })
    expect(created.status).toBe(200)
    const body = created.body as { ok: boolean; token: string; url: string; mode: string; role: string }
    expect(body.ok).toBe(true)
    expect(body.token.length).toBeGreaterThan(10)
    expect(body.role).toBe('host')
    expect(body.mode).toBe('approve')

    const bad = await run(router, 'post', '/api/ide/session-share/create', {
      request: { body: { sessionId: 's1', mode: 'bogus' } },
    })
    expect(bad.status).toBe(400)
  })

  it('get：host→host；collaborator 模式非 host→collaborator；view 模式→viewer；404', async () => {
    const created = await run(router, 'post', '/api/ide/session-share/create', {
      request: { body: { sessionId: 's1', mode: 'approve' } },
      state: { user: { username: 'alice' } },
    })
    const token = (created.body as { token: string }).token

    const asHost = await run(router, 'get', `/api/ide/session-share/${token}`, { state: { user: { username: 'alice' } } })
    expect((asHost.body as { role: string }).role).toBe('host')

    const asCollab = await run(router, 'get', `/api/ide/session-share/${token}`, { state: { user: { username: 'bob' } } })
    expect((asCollab.body as { role: string }).role).toBe('collaborator')
    expect((asCollab.body as { canPrompt: boolean }).canPrompt).toBe(true)

    const created2 = await run(router, 'post', '/api/ide/session-share/create', {
      request: { body: { sessionId: 's2', mode: 'view' } },
      state: { user: { username: 'alice' } },
    })
    const token2 = (created2.body as { token: string }).token
    const asViewer = await run(router, 'get', `/api/ide/session-share/${token2}`, { state: { user: { username: 'bob' } } })
    expect((asViewer.body as { role: string }).role).toBe('viewer')
    expect((asViewer.body as { canPrompt: boolean }).canPrompt).toBe(false)

    const missing = await run(router, 'get', '/api/ide/session-share/notoken', {})
    expect(missing.status).toBe(404)
  })

  it('prompt：approve 模式待人审、prompt 模式直接入队、viewer 拒绝、空文 400', async () => {
    const approve = await run(router, 'post', '/api/ide/session-share/create', {
      request: { body: { sessionId: 's1', mode: 'approve' } },
      state: { user: { username: 'alice' } },
    })
    const tokenA = (approve.body as { token: string }).token
    const resA = await run(router, 'post', `/api/ide/session-share/${tokenA}/prompt`, {
      request: { body: { text: '请继续修复' } },
      state: { user: { username: 'bob' } },
    })
    expect(resA.status).toBe(200)
    expect((resA.body as { pendingApproval: boolean }).pendingApproval).toBe(true)
    expect((resA.body as { queued: boolean }).queued).toBe(false)

    const prompt = await run(router, 'post', '/api/ide/session-share/create', {
      request: { body: { sessionId: 's1', mode: 'prompt' } },
      state: { user: { username: 'alice' } },
    })
    const tokenP = (prompt.body as { token: string }).token
    const resP = await run(router, 'post', `/api/ide/session-share/${tokenP}/prompt`, {
      request: { body: { text: '跑起来' } },
      state: { user: { username: 'bob' } },
    })
    expect((resP.body as { queued: boolean }).queued).toBe(true)

    const view = await run(router, 'post', '/api/ide/session-share/create', {
      request: { body: { sessionId: 's1', mode: 'view' } },
      state: { user: { username: 'alice' } },
    })
    const tokenV = (view.body as { token: string }).token
    const resV = await run(router, 'post', `/api/ide/session-share/${tokenV}/prompt`, {
      request: { body: { text: 'hi' } },
      state: { user: { username: 'bob' } },
    })
    expect(resV.status).toBe(403)

    const resEmpty = await run(router, 'post', `/api/ide/session-share/${tokenA}/prompt`, {
      request: { body: { text: '  ' } },
      state: { user: { username: 'bob' } },
    })
    expect(resEmpty.status).toBe(400)
  })
})

describe('patch 356 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../../..')

  it('356 含 import 与挂载两行；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/356-server-ide-session-share.patch'), 'utf8')
    expect(patch).toContain("import ideSessionShareRouter from '../custom/controllers/ide/session-share'")
    expect(patch).toContain('app.use(ideSessionShareRouter.routes())')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('356-server-ide-session-share.patch')
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('356-server-ide-session-share.patch')
  })
})
