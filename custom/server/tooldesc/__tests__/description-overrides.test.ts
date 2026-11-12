// per-model 工具描述覆盖守门（minimax：合并/校验/省字账）。
import { describe, it, expect } from 'vitest'
import { validateOverrides, resolveDescriptions, overrideDeltaChars, type ToolDescriptionSet } from '../description-overrides'

const set: ToolDescriptionSet = {
  base: { bash: 'Run a shell command.', read: 'Read a file.' },
  perModel: {
    'weak-follower': { bash: 'Run ONE shell command. Output only. Never chain with &&.' },
  },
}

describe('validateOverrides（词表校验）', () => {
  it('合法通过；拼错工具名报 unknown', () => {
    expect(validateOverrides(set, 'weak-follower').ok).toBe(true)
    expect(validateOverrides(set, 'no-such-model').ok).toBe(true) // 无覆盖=空集合法
    const bad: ToolDescriptionSet = { base: set.base, perModel: { m: { besh: 'x' } } }
    expect(validateOverrides(bad, 'm')).toEqual({ ok: false, unknownTools: ['besh'] })
  })
})

describe('resolveDescriptions（覆盖合并）', () => {
  it('覆盖工具整段替换；未覆盖回落 base', () => {
    const r = resolveDescriptions(set, 'weak-follower')
    expect(r.bash).toContain('ONE shell command')
    expect(r.read).toBe('Read a file.')
    expect(resolveDescriptions(set, 'other').bash).toBe('Run a shell command.')
  })
})

describe('overrideDeltaChars（省字账）', () => {
  it('覆盖更长=正；无覆盖=0', () => {
    expect(overrideDeltaChars(set, 'weak-follower')).toBeGreaterThan(0)
    expect(overrideDeltaChars(set, 'none')).toBe(0)
  })
})
