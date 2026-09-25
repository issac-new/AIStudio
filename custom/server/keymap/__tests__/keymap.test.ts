// keymap 守门（codex：覆盖叠加/一键双绑冲突/默认键位）。
import { describe, it, expect } from 'vitest'
import { applyKeymap, defaultKeymap } from '../keymap'

describe('键位重映射（codex 语义）', () => {
  it('override 覆盖默认；一键双绑冲突检测', () => {
    const { bindings, conflicts } = applyKeymap(defaultKeymap(), [
      { context: 'session', action: 'submit', key: 'Ctrl+Enter' },  // 覆盖
      { context: 'session', action: 'interrupt', key: 'Ctrl+C' },   // 无冲突
    ])
    expect(bindings.find((b) => b.action === 'submit')!.key).toBe('Ctrl+Enter')
    expect(conflicts).toEqual([])

    const clash = applyKeymap(defaultKeymap(), [{ context: 'session', action: 'submit', key: 'Esc' }])
    expect(clash.conflicts).toHaveLength(1)
    expect(clash.conflicts[0]).toMatchObject({ context: 'session', key: 'Esc' })
    expect(clash.conflicts[0].actions.sort()).toEqual(['interrupt', 'submit'])
  })

  it('默认键位（两上下文最小集）', () => {
    const d = defaultKeymap()
    expect(new Set(d.map((b) => b.context))).toEqual(new Set(['session', 'editor']))
    expect(applyKeymap(d, []).conflicts).toEqual([])
  })
})
