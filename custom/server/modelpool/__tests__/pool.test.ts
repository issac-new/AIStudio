// overlay/modelpool 守门：白名单单一源不变式＋上游判定两态＋REST 投影契约
// （spec 2026-11-21-model-pool-unification）。
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UPSTREAM, EKKO_MODEL_UPSTREAM_ENV, UNIFIED_POOL, UNIFIED_PROVIDER,
  resolveModelUpstream, unifiedModelNames,
} from '../pool'
import { modelPoolView } from '../controller'

describe('统一模型池白名单不变式', () => {
  it('默认模型必须是清单成员且清单无重名', () => {
    const names = unifiedModelNames()
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain(UNIFIED_POOL.defaultModel)
  })

  it('provider/apiMode 与宿主 cc-switch lane 口径一致（codex_responses）', () => {
    expect(UNIFIED_POOL.provider).toBe(UNIFIED_PROVIDER)
    expect(UNIFIED_POOL.provider).toBe('cc-switch-route')
    expect(UNIFIED_POOL.apiMode).toBe('codex_responses')
  })

  it('每个模型都带正上下文窗（投影 context_length 消费方依赖）', () => {
    for (const entry of UNIFIED_POOL.models) expect(entry.contextLength).toBeGreaterThan(0)
  })
})

describe('resolveModelUpstream 两态', () => {
  it('env 缺省＝统一模式且落默认上游（本仓即部署正身）', () => {
    for (const env of [{}, { [EKKO_MODEL_UPSTREAM_ENV]: undefined }, { [EKKO_MODEL_UPSTREAM_ENV]: '  ' }]) {
      expect(resolveModelUpstream(env)).toEqual({ unified: true, baseUrl: DEFAULT_UPSTREAM })
    }
  })

  it("显式 'self'＝legacy（studio 内部网关产品态，唯一逃生门）", () => {
    expect(resolveModelUpstream({ [EKKO_MODEL_UPSTREAM_ENV]: 'self' })).toEqual({ unified: false, baseUrl: '' })
  })

  it('显式 URL＝统一模式且尊重该 URL（trim 后）', () => {
    expect(resolveModelUpstream({ [EKKO_MODEL_UPSTREAM_ENV]: ' http://127.0.0.1:19999/hermes/v1 ' }))
      .toEqual({ unified: true, baseUrl: 'http://127.0.0.1:19999/hermes/v1' })
  })
})

describe('GET /api/modelpool 投影契约', () => {
  it('返回 env 态＋白名单，200', async () => {
    const ctx: any = { status: 0, body: undefined }
    await modelPoolView(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({
      unified: true,
      upstreamBaseUrl: DEFAULT_UPSTREAM,
      env: EKKO_MODEL_UPSTREAM_ENV,
      defaultUpstream: DEFAULT_UPSTREAM,
      pool: { provider: UNIFIED_PROVIDER, defaultModel: UNIFIED_POOL.defaultModel },
    })
  })
})
