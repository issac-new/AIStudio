// overlay/custom/client/ia2/__tests__/run-options.test.ts
// 运行选择器空态守门（2026-10-19 0→1 复验）：清场后不得把记忆里的旧运行补回选项。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildRunOptions, normalizeRunId } from '../utils/run-options'

describe('buildRunOptions', () => {
  it('列表空且加载完 → 空（旧运行不得补位）', () => {
    expect(buildRunOptions([], '2026-10-17-v8-run21', false)).toEqual([])
  })
  it('列表空但加载中 → 保留当前值，避免闪空', () => {
    expect(buildRunOptions([], 'r1', true)).toEqual(['r1'])
  })
  it('列表非空且当前不在列表 → 当前补首位（显式深链可查看）', () => {
    expect(buildRunOptions(['r2', 'r3'], 'r1', false)).toEqual(['r1', 'r2', 'r3'])
  })
  it('去重、sim- 前缀归一、上限截断', () => {
    expect(buildRunOptions(['sim-a', 'a', 'b'], '', false)).toEqual(['a', 'b'])
    const many = Array.from({ length: 50 }, (_, i) => `r${i}`)
    expect(buildRunOptions(many, '', false)).toHaveLength(40)
    expect(normalizeRunId('sim-x')).toBe('x')
    expect(normalizeRunId('x')).toBe('x')
  })
  it('RunSelector 空态清记忆与 query（源级守门）', () => {
    const src = readFileSync(resolve(__dirname, '../views/sim/RunSelector.vue'), 'utf8')
    expect(src).toContain('localStorage.removeItem(LAST_RUN_KEY)')
    expect(src).toContain("if (!list.length && current.value && !runsStore.loading)")
  })
})
