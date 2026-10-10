// overlay/custom/client/ia2/__tests__/fit-count.test.ts
// 自适应限量显示纯函数核守门（2026-10-10 注意力条根治轮）：
// 「塞不下取前缀+尾部 +N」的算术边界——全放下/恰好放不下/极窄容器保 1/
// 量不到宽度（jsdom/未挂载）全显示/+N 预留位含 gap。
import { describe, it, expect } from 'vitest'
import { fitCount } from '../utils/fit-count'

const GAP = 6
const MORE = 56

describe('fitCount — 自适应前缀切片', () => {
  it('全放得下 → 全显示（不出现 +N）', () => {
    expect(fitCount({ widths: [100, 100, 100], available: 400, gap: GAP, moreWidth: MORE })).toBe(3)
  })

  it('恰好等宽 → 全显示（边界用尽不算溢出）', () => {
    // 3×100 + 2×6 = 312
    expect(fitCount({ widths: [100, 100, 100], available: 312, gap: GAP, moreWidth: MORE })).toBe(3)
  })

  it('放不下 → 为 +N 预留后贪心取前缀', () => {
    // 预算 = 300 - 56 - 6 = 238 → 两个 chip 100+6+100=206 ✓，三个 212+6+100=318 ✗
    expect(fitCount({ widths: [100, 100, 100], available: 300, gap: GAP, moreWidth: MORE })).toBe(2)
  })

  it('极窄容器 → 至少保 1 个（+N 与首 chip 至少共存）', () => {
    expect(fitCount({ widths: [100, 100], available: 60, gap: GAP, moreWidth: MORE })).toBe(1)
  })

  it('available<=0（jsdom/未挂载量不到）→ 全显示（渐进增强兜底）', () => {
    expect(fitCount({ widths: [100, 100, 100], available: 0, gap: GAP, moreWidth: MORE })).toBe(3)
  })

  it('空列表 → 0', () => {
    expect(fitCount({ widths: [], available: 500, gap: GAP, moreWidth: MORE })).toBe(0)
  })

  it('首 chip 就超预算也保 1（不出现 0+N 的空条）', () => {
    expect(fitCount({ widths: [500, 100], available: 100, gap: GAP, moreWidth: MORE })).toBe(1)
  })
})
