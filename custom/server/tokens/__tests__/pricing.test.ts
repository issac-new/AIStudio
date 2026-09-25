// 成本估算价目表守门（dsh 三原则吸收，矩阵 §3.8 dsh P0）。
// S-C 空表不缓存/条目形状校验、/cost usage 非负有限校验在此守门。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { join, resolve } from 'path'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import {
  estimateCost, loadPricingTable, matchPriceKey, resetPricingCacheForTests,
  type PricingTable, type ModelPrice,
} from '../pricing'
import { tokenMeterRoutes } from '../token-meter-controller'

const T = (models: Record<string, ModelPrice>, currency = 'CNY'): PricingTable => ({ currency, models })
const glm: ModelPrice = { input: { idle: 0.5, peak: 2 }, output: { idle: 2, peak: 8 } }
const U = { uncachedInput: 1_000_000, output: 500_000, cacheRead: 2_000_000, cacheWrite: 0 }

describe('价目表三原则（dsh deepseekPricing）', () => {
  beforeEach(() => resetPricingCacheForTests())

  it('两档区间（原则 1）：idle ≤ peak，双档独立可算', () => {
    const e = estimateCost('glm-4.7', U, T({ 'glm-4.7': glm }))
    expect(e).not.toBeNull()
    expect(e!.idleCost).toBe(0.5 + 1.0 + 0.1)  // input 1M×0.5 + output 0.5M×2 + cacheRead 2M×0.05(默认 1/10)
    expect(e!.peakCost).toBe(2 + 4 + 0.4)
    expect(e!.idleCost).toBeLessThan(e!.peakCost)
    expect(e!.currency).toBe('CNY')
  })

  it('缓存分价（原则 2）：显式 cacheRead 价覆盖 1/10 缺省', () => {
    const withExplicit: ModelPrice = { ...glm, cacheRead: { idle: 0.01, peak: 0.04 } }
    const e = estimateCost('m', U, T({ m: withExplicit }))
    expect(e!.idleCost).toBeCloseTo(0.5 + 1.0 + 2 * 0.01, 4)
  })

  it('未收录不显示（原则 3）：返回 null 绝不瞎算；前缀匹配取最长', () => {
    const table = T({ 'provider/x*': glm, 'provider/x-pro*': glm })
    expect(estimateCost('totally-unknown', U, table)).toBeNull()
    expect(matchPriceKey(table, 'provider/x-pro-max')!).toBe('provider/x-pro*')
    expect(matchPriceKey(table, 'provider/x')!).toBe('provider/x*')
    expect(matchPriceKey(table, 'other/y')).toBeNull()
  })
})

describe('价目表加载（runtime/pricing 单一事实源）', () => {
  beforeEach(() => resetPricingCacheForTests())

  it('仓内价目表可加载且含 glm 条目', () => {
    const table = loadPricingTable()
    expect(table.currency).toBe('CNY')
    expect(table.models['glm-4.7']).toBeTruthy()
    const e = estimateCost('glm-4.7-flash', U, table)
    expect(e).not.toBeNull()
  })

  it('env 覆盖 + 坏文件回空表（未收录=不显示）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pricing-'))
    const f = join(dir, 'p.yaml')
    writeFileSync(f, '{{broken', 'utf8')
    process.env.HERMES_PRICING_TABLE = f
    resetPricingCacheForTests()
    const t = loadPricingTable()
    expect(Object.keys(t.models)).toHaveLength(0)
    expect(estimateCost('glm-4.7', U, t)).toBeNull()
    delete process.env.HERMES_PRICING_TABLE
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('价目表缓存与形状校验（S-C）', () => {
  beforeEach(() => resetPricingCacheForTests())

  it('加载失败/未命中不缓存空表，修好即恢复（priced:0 不锁死到重启）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pricing-'))
    const f = join(dir, 'p.yaml')
    process.env.HERMES_PRICING_TABLE = f
    writeFileSync(f, '{{broken', 'utf8')
    expect(Object.keys(loadPricingTable().models)).toHaveLength(0)
    // 修好价目表后立即恢复（中间不 reset 缓存）——失败缓存了就会在这里卡成空表。
    writeFileSync(f, 'currency: CNY\nmodels:\n  m:\n    input: { idle: 1, peak: 2 }\n    output: { idle: 3, peak: 4 }\n', 'utf8')
    expect(loadPricingTable().models['m']).toBeTruthy()
    delete process.env.HERMES_PRICING_TABLE
    rmSync(dir, { recursive: true, force: true })
  })

  it('条目形状校验：坏条目丢弃 + warn（缺 input 不再抛 TypeError 打 500）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dir = mkdtempSync(join(tmpdir(), 'pricing-'))
    const f = join(dir, 'p.yaml')
    process.env.HERMES_PRICING_TABLE = f
    writeFileSync(f, [
      'currency: CNY',
      'models:',
      '  good:',
      '    input: { idle: 1, peak: 2 }',
      '    output: { idle: 3, peak: 4 }',
      '  no-input:',
      '    output: { idle: 3, peak: 4 }',
      '  bad-tier:',
      '    input: { idle: x, peak: 2 }',
      '    output: { idle: 3, peak: 4 }',
      '  bad-cache:',
      '    input: { idle: 1, peak: 2 }',
      '    output: { idle: 3, peak: 4 }',
      '    cacheRead: { idle: nope }',
    ].join('\n'), 'utf8')
    const t = loadPricingTable()
    expect(Object.keys(t.models)).toEqual(['good'])
    expect(estimateCost('no-input', U, t)).toBeNull()        // 坏条目=未收录，不炸
    expect(() => estimateCost('good', U, t)).not.toThrow()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    delete process.env.HERMES_PRICING_TABLE
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('/api/token-meter/cost usage 校验（S-C：证据不全不估，绝不瞎算）', () => {
  beforeEach(() => resetPricingCacheForTests())

  type Handler = (ctx: Record<string, unknown>) => Promise<void>
  function handlerFor(method: string, path: string): Handler {
    const layers = (tokenMeterRoutes as unknown as {
      stack: Array<{ path: string; methods: string[]; stack: Array<(...a: unknown[]) => unknown> }>
    }).stack
    const layer = layers.find((l) => l.path.endsWith(path) && l.methods.includes(method))
    if (!layer) throw new Error(`route not found: ${method} ${path}`)
    return layer.stack[layer.stack.length - 1] as Handler
  }

  async function cost(usage: unknown, model = 'glm-4.7'): Promise<Record<string, unknown>> {
    const ctx: Record<string, unknown> = {
      request: { body: { model, usage } }, state: {}, status: 200, body: undefined,
    }
    await handlerFor('POST', '/cost')(ctx)
    return ctx.body as Record<string, unknown>
  }

  it('负值/NaN/缺必填 → available:false（不按 0 瞎算）', async () => {
    expect(await cost({ uncachedInput: -1, output: 100 })).toMatchObject({ ok: true, available: false, reason: 'invalid_usage' })
    expect(await cost({ uncachedInput: Number.NaN, output: 1 })).toMatchObject({ available: false, reason: 'invalid_usage' })
    expect(await cost({ output: 100 })).toMatchObject({ available: false, reason: 'incomplete_usage' })
    expect(await cost({ uncachedInput: 100, output: 1, cacheRead: -5 })).toMatchObject({ available: false, reason: 'invalid_usage' })
  })

  it('合法 usage 照算；cacheRead/cacheWrite 缺省 0', async () => {
    const res = await cost({ uncachedInput: 1_000_000, output: 0 })
    expect(res.available).toBe(true)
    expect((res.estimate as { priceKey: string }).priceKey).toBe('glm-4.7')
  })

  it('未收录与价目表不可用分开标注（priced:0 的原因可辨）', async () => {
    expect(await cost({ uncachedInput: 1, output: 1 }, 'totally-unknown')).toMatchObject({
      available: false, reason: 'model_not_listed',
    })
    process.env.HERMES_PRICING_TABLE = join(tmpdir(), 'no-such-pricing.yaml')
    resetPricingCacheForTests()
    expect(await cost({ uncachedInput: 1, output: 1 })).toMatchObject({
      available: false, reason: 'pricing_table_unavailable', priced: 0,
    })
    delete process.env.HERMES_PRICING_TABLE
  })
})
