// overlay/custom/server/tokens/__tests__/meter-projections.test.ts
// R5-#9 守门：三投影恒等契约 + zcode 互校对账 + StatsPills 口径 + patch 403 登记。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import {
  attemptLedger, cacheHitPercent, deriveContextBreakdown, deriveContextPressure,
  deriveTokenUsage, fromZcodeUsageSummary,
} from '../meter-projections'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

describe('tokenUsage（逐 attempt 精确求和）', () => {
  it('anthropic 口径：uncached=input-cache 两账；逐 attempt 累计', () => {
    const usage = deriveTokenUsage([
      { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 600, cacheCreationTokens: 100 },
      { inputTokens: 800, outputTokens: 50 }, // 无 cache 证据：两账计 0 不估
    ])
    expect(usage).toEqual({
      uncachedInput: (1000 - 700) + 800, // 300+800
      output: 250,
      cacheRead: 600,
      cacheWrite: 100,
    })
  })
})

describe('contextPressure', () => {
  it('双比率（当前/预估）；window 非正显式拒绝', () => {
    const p = deriveContextPressure(80_000, 120_000, 128_000)
    expect(p.pressureRatio).toBeCloseTo(0.625)
    expect(p.projectedRatio).toBeCloseTo(0.9375)
    expect(() => deriveContextPressure(1, 1, 0)).toThrow()
  })
})

describe('contextBreakdown（之和恒等 surface）', () => {
  it('恒等成立 ok=true；破恒等显式告警（delta 不吞）', () => {
    const ok = deriveContextBreakdown(1000, 2000, 7000, 10_000)
    expect(ok.identity).toEqual({ ok: true, sumTokens: 10_000, delta: 0 })
    const broken = deriveContextBreakdown(1000, 2000, 7000, 10_500)
    expect(broken.identity).toEqual({ ok: false, sumTokens: 10_000, delta: 500 })
  })
})

describe('zcode rounds 契约互校', () => {
  it('UsageStatsSummary 映射 tokenUsage；四账恒等对账差异上报不修数', () => {
    const { usage, reconcile, } = fromZcodeUsageSummary({
      inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 6_000, cacheCreationTokens: 1_000,
    })
    expect(usage).toEqual({ uncachedInput: 3_000, output: 2_000, cacheRead: 6_000, cacheWrite: 1_000 })
    expect(reconcile).toEqual([]) // 3000+2000+6000+1000 == 10000+2000
    // 破坏例：cache 超 input（坏数据）→ uncached 被 clamp 到 0，四账恒等破裂 → 差异条目上报。
    const bad = fromZcodeUsageSummary({ inputTokens: 5_000, outputTokens: 2_000, cacheReadTokens: 9_000 })
    expect(bad.usage.uncachedInput).toBe(0)
    expect(bad.reconcile[0]).toMatchObject({ field: 'fourAccountsSum', expected: 7_000, actual: 11_000 })
  })
})

describe('StatsPills 口径', () => {
  it('缓存命中比 = cacheRead/(uncachedInput+cacheRead)；零输入返回 null 不伪造', () => {
    expect(cacheHitPercent({ uncachedInput: 1_000, output: 0, cacheRead: 3_000, cacheWrite: 0 })).toBe(75)
    expect(cacheHitPercent({ uncachedInput: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeNull()
  })

  it('TTFT/decode 台账：无流样本记 null 不伪造', () => {
    const ledger = attemptLedger([
      { inputTokens: 1, outputTokens: 1, ttftMs: 320, decodeMs: 1_500 },
      { inputTokens: 1, outputTokens: 1 },
    ])
    expect(ledger[0]).toMatchObject({ ttftMs: 320, decodeMs: 1_500 })
    expect(ledger[1]).toMatchObject({ ttftMs: null, decodeMs: null })
  })
})

describe('接线守门（patch 403）', () => {
  it('controller 双端点挂载 + series 登记', () => {
    const src = readFileSync(join(OVERLAY_ROOT, 'custom/server/tokens/token-meter-controller.ts'), 'utf8')
    expect(src).toContain("router.post('/project'")
    expect(src).toContain("router.post('/zcode'")
    const series = readFileSync(join(OVERLAY_ROOT, 'patches/series'), 'utf8')
    expect(series).toMatch(/^403-server-token-meter-routes\.patch$/m)
    const routesPath = join(OVERLAY_ROOT, '../upstream/hermes-studio/packages/server/src/bootstrap/routes.ts')
    if (existsSync(routesPath)) {
      expect(readFileSync(routesPath, 'utf8')).toContain("import { tokenMeterRoutes } from '../custom/tokens/token-meter-controller'")
    }
  })
})
