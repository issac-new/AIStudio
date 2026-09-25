// 成本估算价目表守门（dsh 三原则吸收，矩阵 §3.8 dsh P0）。
import { describe, it, expect, beforeEach } from 'vitest'
import { join, resolve } from 'path'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import {
  estimateCost, loadPricingTable, matchPriceKey, resetPricingCacheForTests,
  type PricingTable, type ModelPrice,
} from '../pricing'

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
