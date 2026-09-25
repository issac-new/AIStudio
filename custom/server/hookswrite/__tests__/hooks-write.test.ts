// Hooks 写档面守门（Q11：词表校验/幂等 upsert/启停/重排）。
import { describe, it, expect } from 'vitest'
import { validateHook, upsertHook, setHookEnabled, reorderHooks, type HookConfig } from '../hooks-write'

const hook = (id: string, over: Partial<HookConfig> = {}): HookConfig => ({
  hookId: id, event: 'PreToolUse', matcher: 'Bash', command: 'check.sh', enabled: true, order: 0, ...over,
})

describe('validateHook（七事件词表锚 d.ts:402）', () => {
  it('合法通过；未知事件/空命令拒', () => {
    expect(validateHook(hook('a')).ok).toBe(true)
    expect(validateHook(hook('b', { event: 'Nope' as never })).problem).toContain('unknown event')
    expect(validateHook(hook('c', { command: '  ' })).problem).toBe('empty command')
  })
})

describe('写档操作', () => {
  it('upsert 幂等 hookId 保留 order', () => {
    let list = upsertHook([], hook('a'))
    list = upsertHook(list, hook('b'))
    expect(list).toHaveLength(2)
    list = upsertHook(list, hook('a', { command: 'new.sh' }))
    expect(list).toHaveLength(2)
    expect(list[0].command).toBe('new.sh')
    expect(list[0].order).toBe(0)
  })
  it('启停切换只动目标', () => {
    const list = setHookEnabled([hook('a'), hook('b')], 'a', false)
    expect(list[0].enabled).toBe(false)
    expect(list[1].enabled).toBe(true)
  })
  it('重排按序重写 order，缺漏顺尾补', () => {
    const list = reorderHooks([hook('a'), hook('b'), hook('c')], ['c', 'a'])
    expect(list.map((h) => h.hookId)).toEqual(['c', 'a', 'b'])
    expect(list.map((h) => h.order)).toEqual([0, 1, 2])
  })
})
