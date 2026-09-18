// overlay/custom/server/controllers/system/__tests__/storage.test.ts
// 资源管理器 server e2e（M2）：snapshot 分类扫描 / clean 白名单与只读拒绝 / reveal。
// 走真实临时目录（mock os.homedir 重定向数据根，零真实 ~/.hermes 触碰）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const fakeHome = mkdtempSync(join(tmpdir(), 'ide-storage-test-'))

const spawnMock = vi.fn(() => ({ unref: () => {} }))

vi.mock('os', async (importOrig) => ({
  ...(await importOrig<typeof import('os')>()),
  homedir: () => fakeHome,
}))

// reveal 走 spawn 打开文件管理器：mock 掉以断言按平台选命令（win32=explorer）
vi.mock('child_process', async (importOrig) => ({
  ...(await importOrig<typeof import('child_process')>()),
  spawn: (...args: unknown[]) => (spawnMock as (...a: unknown[]) => unknown)(...args),
}))

// mock 后再 import controller（homedir 在模块顶层求值）
const storageModule = await import('../storage')
// Koa 化的最小 ctx 夹具
function makeCtx() {
  const ctx: Record<string, unknown> = { status: 0, body: undefined, query: {}, request: { body: {} } }
  return ctx as any
}

// router 不真正起服务：直接调注册的路由处理器。Router 实例的 stack 可读。
type Handler = (ctx: any) => Promise<void>
function findHandler(method: string, path: string): Handler {
  const router = storageModule.default as any
  const layer = router.stack.find((l: any) => l.path === path && l.methods.includes(method))
  if (!layer) throw new Error(`route not found: ${method} ${path}`)
  return layer.stack[layer.stack.length - 1]
}

describe('storage controller（M2 资源管理器）', () => {
  beforeEach(() => {
    // 每例重建 logs 目录
    const logs = join(fakeHome, '.hermes', 'logs')
    rmSync(join(fakeHome, '.hermes'), { recursive: true, force: true })
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'a.log'), 'x'.repeat(2048))
    writeFileSync(join(logs, 'b.log'), 'y'.repeat(1024))
  })

  it('snapshot：分类扫描出 logs 体积与文件数，含不可清理分类标记', async () => {
    const ctx = makeCtx()
    await findHandler('GET', '/api/ide/storage/snapshot')(ctx)
    const cats = ctx.body.categories as Array<Record<string, unknown>>
    const logs = cats.find(c => c.key === 'logs')
    expect(logs).toBeTruthy()
    expect(logs!.bytes).toBeGreaterThanOrEqual(3072)
    expect(logs!.files).toBe(2)
    expect(logs!.cleanable).toBe(true)
    const sessionStore = cats.find(c => c.key === 'sessionStore')
    expect(sessionStore!.cleanable).toBe(false)
    expect(ctx.body.totalBytes).toBeGreaterThan(0)
  })

  it('clean：白名单分类可清理并报告释放量；只读分类 403', async () => {
    const ctx = makeCtx()
    ctx.request.body = { category: 'logs' }
    await findHandler('POST', '/api/ide/storage/clean')(ctx)
    expect(ctx.body.ok).toBe(true)
    expect(ctx.body.freedBytes).toBeGreaterThanOrEqual(3072)
    expect(existsSync(join(fakeHome, '.hermes', 'logs'))).toBe(false)

    const ctx2 = makeCtx()
    ctx2.request.body = { category: 'sessionStore' }
    await findHandler('POST', '/api/ide/storage/clean')(ctx2)
    expect(ctx2.status).toBe(403)
  })

  it('clean：未知分类 400', async () => {
    const ctx = makeCtx()
    ctx.request.body = { category: 'nope' }
    await findHandler('POST', '/api/ide/storage/clean')(ctx)
    expect(ctx.status).toBe(400)
  })

  it('reveal：按平台选打开命令（win32=explorer / darwin=open / 其他=xdg-open）', async () => {
    const platformOrig = process.platform
    const setPlatform = (v: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value: v })
    try {
      const ctx = makeCtx()
      ctx.request.body = { category: 'logs' }
      setPlatform('win32')
      await findHandler('POST', '/api/ide/storage/reveal')(ctx)
      expect(ctx.body).toEqual({ ok: true })
      expect(spawnMock.mock.calls[0]![0]).toBe('explorer')
      setPlatform('darwin')
      await findHandler('POST', '/api/ide/storage/reveal')(ctx)
      expect(spawnMock.mock.calls[1]![0]).toBe('open')
      setPlatform('linux')
      await findHandler('POST', '/api/ide/storage/reveal')(ctx)
      expect(spawnMock.mock.calls[2]![0]).toBe('xdg-open')
    } finally {
      setPlatform(platformOrig)
      spawnMock.mockClear()
    }
  })
})

// 测试尾清理
process.on('exit', () => rmSync(fakeHome, { recursive: true, force: true }))
