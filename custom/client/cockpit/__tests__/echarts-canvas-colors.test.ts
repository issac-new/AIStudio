// ECharts canvas 色域守门（2026-10-18 审计轮立项）：ECharts 默认 canvas 渲染器
// 不解析 CSS var()（theme-bridge.ts 既定结论——「ECharts 不吃 var() 只吃实色」），
// option 对象里的 color/lineStyle 一旦写 'var(--x)' 会被 canvas 规范忽略、沿用
// 上一有效 fillStyle（暗色主题下标签不可见）。批C raw hex 清扫（bb010da9）曾把
// #fff/#333 等改为裸 var() 无 fallback 形态——raw-hex 预算闸只统计带 fallback 的
// var(--x, …)，完全绕过守门。本测试源码断言：echarts 组件的 <script> 段禁止
// 出现 option 对象字面量里的 'var(-- 色值（DOM 渲染域的 tooltip formatter 与
// <style> 段不受此限）。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

function scriptSection(relPath: string): string {
  const raw = readFileSync(join(HERE, relPath), 'utf-8')
  const start = raw.indexOf('<script')
  const end = raw.indexOf('</script>')
  expect(start, `${relPath} 缺 <script> 段`).toBeGreaterThan(-1)
  return raw.slice(start, end)
}

describe('ECharts canvas 色域守门（option 禁 var()）', () => {
  const ECHARTS_COMPONENTS = [
    '../../cockpit/components/RunTraceTopology.vue',
    '../../bpa/components/BpaLinkPanel.vue',
  ]

  it('两个 echarts 组件 script 段无 option 内 var() 色值（走 resolveNeutrals 实色通道）', () => {
    for (const rel of ECHARTS_COMPONENTS) {
      const src = scriptSection(rel)
      const offenders = [...src.matchAll(/:\s*'var\(--/g)].map(() => rel)
      expect(offenders, `${rel} 的 option 色值出现 'var(--'（canvas 不解析，须 resolveNeutrals/status-colors 实色）`).toEqual([])
    }
  })

  it('resolveNeutrals 暴露 onAccent（拓扑/BPA 标签前景色单一事实源）', async () => {
    const mod = await import('../styles/status-colors')
    expect(typeof mod.resolveNeutrals).toBe('function')
  })
})
