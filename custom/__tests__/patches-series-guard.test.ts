// overlay/custom/__tests__/patches-series-guard.test.ts
// patches/series ↔ 文件树一致性守门（2026-10-04 24h 审查轮增设）。
// 事故实锤：61419f38 把在途分支的 series 尾巴（563-ekko/564-disclosure）带上
// main 但未携带补丁文件——inject.mjs:117 对缺文件硬失败，origin/main 注入链
// 当场断掉；同轮 00b48c6f 让号时 564 号被两个补丁占用（编号撞号）。
// 本守门两条断言：① series 每个条目在 patches/ 下文件存在；② 补丁编号唯一。
// 参照同模式：zcode-patches-guard.test.ts ①（zcode-patches/series 同类守门）。
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const overlayRoot = resolve(__dirname, '..', '..')

function readSeries(): string[] {
  const text = readFileSync(join(overlayRoot, 'patches', 'series'), 'utf8')
  return text
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l.length > 0)
}

describe('patches/series 守门（zcode-patches-guard 同模式）', () => {
  it('series 非空且条目文件一一存在', () => {
    const series = readSeries()
    expect(series.length).toBeGreaterThan(0)
    const missing = series.filter((p) => !existsSync(join(overlayRoot, 'patches', p)))
    expect(missing, `series 引用了不存在的补丁文件（inject 硬失败）：${missing.join(', ')}`).toEqual([])
  })

  it('补丁编号唯一（撞号=让号流程漏步）', () => {
    // 双侧保留白名单（agent 0.21.7 升级轮 1f6aefad 显式决策「611×2/612×2 双侧保留」：
    // 同号双胞胎分属不同宿主域——toolsets-obs-recall vs session-rotation-itercap、
    // observation-pack-recall vs capacity-retry-anchor；让号改名反而破坏升级轮的三向再生对账）
    const DUAL_KEEP = new Set(['611', '612'])
    const nums = readSeries().map((p) => /^(\d+)-/.exec(p)?.[1]).filter((n): n is string => !!n)
    const seen = new Map<string, number>()
    for (const n of nums) seen.set(n, (seen.get(n) ?? 0) + 1)
    const dup = [...seen.entries()].filter(([n, c]) => c > 1 && !DUAL_KEEP.has(n)).map(([n]) => n)
    expect(dup, `编号被多个补丁占用：${dup.join(', ')}（处置惯例：在途方保留，已合 main 者让号；611/612=升级轮双侧保留白名单）`).toEqual([])
  })
})
