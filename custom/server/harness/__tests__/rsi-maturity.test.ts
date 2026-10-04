// rsi-maturity 域单测（P9）：分级判定纪律（机制存在≠级别达成）、证据缺席不判定、
// L4/L5 如实未达成（L4 是安全取舍不是欠账）。
import { describe, expect, it } from 'vitest'
import { buildRsiMaturity, countCapabilityGaps } from '../rsi-maturity'

const full = { ladder: true, watchdog: true, soul: true, gapRegister: true }
const none = { ladder: false, watchdog: false, soul: false, gapRegister: false }

describe('buildRsiMaturity 分级判定', () => {
  it('证据齐全：L1-L3 达成、L4/L5 未达成', () => {
    const r = buildRsiMaturity(full, 4)
    const by = new Map(r.levels.map((l) => [l.key, l]))
    expect(by.get('L1')!.achieved).toBe(true)
    expect(by.get('L2')!.achieved).toBe(true)
    expect(by.get('L3')!.achieved).toBe(true)
    expect(by.get('L4')!.achieved).toBe(false)
    expect(by.get('L5')!.achieved).toBe(false)
    // L4 必须写明是安全取舍而非能力缺口
    expect(by.get('L4')!.gap).toContain('安全取舍')
  })

  it('核心证据缺席：L2/L3 置 null 不判定（不因文件缺失谎报达成）', () => {
    const r = buildRsiMaturity(none, null)
    const by = new Map(r.levels.map((l) => [l.key, l]))
    expect(by.get('L2')!.achieved).toBeNull()
    expect(by.get('L3')!.achieved).toBeNull()
    // L1 与探测无关恒达成；L4/L5 判定不依赖探测
    expect(by.get('L1')!.achieved).toBe(true)
    expect(by.get('L4')!.achieved).toBe(false)
  })

  it('每级证据锚点非空（达成/未达成都可追溯）', () => {
    const r = buildRsiMaturity(full, 4)
    for (const lv of r.levels.slice(0, 4)) {
      expect(lv.evidence.length, lv.key).toBeGreaterThan(0)
    }
    expect(r.levels[4]!.gap).toContain('研究前沿')
  })

  it('五元组盘点齐备，model/trainer 如实 no', () => {
    const r = buildRsiMaturity(full, 4)
    expect(r.elements.map((e) => e.key)).toEqual(['model', 'harness', 'data', 'trainer', 'improvementMechanism'])
    const by = new Map(r.elements.map((e) => [e.key, e]))
    expect(by.get('model')!.evolvable).toBe('no')
    expect(by.get('trainer')!.evolvable).toBe('no')
    expect(by.get('harness')!.evolvable).toBe('yes')
  })
})

describe('countCapabilityGaps', () => {
  it('返回 null 或非负数（fail-soft 不抛）', () => {
    const v = countCapabilityGaps()
    expect(v === null || (typeof v === 'number' && v >= 0)).toBe(true)
  })
})
