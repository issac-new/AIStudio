// 引擎独立模型配置 REST 守门（router-harness 模式=session-share-round6 同款；
// 存储经 ENGINE_MODEL_STORE 注入临时文件，不碰生产 runtime/）。
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Router from '@koa/router'

const dir = mkdtempSync(join(tmpdir(), 'engine-models-'))
process.env.ENGINE_MODEL_STORE = join(dir, 'engine-models.json')

interface CtxShape {
  request: { body: Record<string, unknown> }
  status: number
  body: unknown
}

async function run(router: Router, method: 'get' | 'put', ctx: Partial<CtxShape>): Promise<CtxShape> {
  const full: CtxShape = { request: { body: {} }, status: 200, body: undefined, ...ctx } as CtxShape
  const layer = router.stack.find((l) => l.methods.includes(method.toUpperCase()) && l.match('/api/ide/engine-models'))
  expect(layer, 'route exists').toBeTruthy()
  for (const mw of (layer as unknown as { stack: Array<(c: CtxShape, next?: () => Promise<void>) => Promise<void>> }).stack) {
    await mw(full, async () => {})
  }
  return full
}

describe('/api/ide/engine-models（独立设置守门）', () => {
  let router: Router
  beforeAll(async () => {
    const mod = await import('../engine-models')
    router = mod.default as unknown as Router
  })
  beforeEach(() => {
    if (existsSync(join(dir, 'engine-models.json'))) rmSync(join(dir, 'engine-models.json'))
  })

  it('GET 空态：空目录+独立存储声明（与 hermes 零共享）', async () => {
    const res = await run(router, 'get', {})
    expect(res.status).toBe(200)
    const body = res.body as { ok: boolean; config: { providers: unknown[] }; store: string }
    expect(body.ok).toBe(true)
    expect(body.config.providers).toEqual([])
    expect(body.store).toContain('engine-models.json')
  })

  it('PUT 非法 400 带问题清单；合法原子落盘+回读一致', async () => {
    const bad = await run(router, 'put', {
      request: { body: { providers: [{ providerId: '', baseURL: 'x', models: [] }] } },
    })
    expect(bad.status).toBe(400)
    expect(((bad.body as { problems: string[] }).problems).length).toBeGreaterThan(0)

    const good = await run(router, 'put', {
      request: { body: {
        providers: [{ providerId: 'bigmodel', baseURL: 'https://a.com/v1', apiKeyEnv: 'BIGMODEL_KEY', models: [{ modelId: 'glm-5.3' }] }],
        defaultModel: { providerId: 'bigmodel', modelId: 'glm-5.3' },
      } },
    })
    expect(good.status).toBe(200)
    const onDisk = JSON.parse(readFileSync(join(dir, 'engine-models.json'), 'utf8'))
    expect(onDisk.providers[0].providerId).toBe('bigmodel')
    expect(onDisk.defaultModel).toEqual({ providerId: 'bigmodel', modelId: 'glm-5.3' })
    const read = await run(router, 'get', {})
    expect(((read.body as { config: { providers: Array<{ providerId: string }> } }).config).providers[0].providerId).toBe('bigmodel')
  })
})
