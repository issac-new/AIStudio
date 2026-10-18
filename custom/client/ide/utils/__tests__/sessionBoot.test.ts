// @vitest-environment node
// 冷启动会话落位守门（2026-10-18 回归）：?session= 目标存在时必须压过
// ensureSession 的 agent 匹配逻辑，否则 imported/CLI 会话被新建空会话顶掉。
import { describe, it, expect } from 'vitest'
import { resolveBootSession } from '../sessionBoot'

describe('resolveBootSession', () => {
  const ids = ['s_cli', 's_ide']

  it('目标存在且未激活：返回 switchTo', () => {
    expect(resolveBootSession('s_cli', ids, 's_ide')).toEqual({ matched: true, switchTo: 's_cli' })
  })

  it('目标已激活：matched 但不重复切换', () => {
    expect(resolveBootSession('s_cli', ids, 's_cli')).toEqual({ matched: true, switchTo: null })
  })

  it('目标不存在：不命中，交回 ensureSession', () => {
    expect(resolveBootSession('ghost', ids, 's_ide')).toEqual({ matched: false, switchTo: null })
  })

  it('无参数 / 空白 / 非字符串：不命中', () => {
    expect(resolveBootSession(undefined, ids, null)).toEqual({ matched: false, switchTo: null })
    expect(resolveBootSession('   ', ids, null)).toEqual({ matched: false, switchTo: null })
    expect(resolveBootSession(['s_cli'], ids, null)).toEqual({ matched: false, switchTo: null })
  })

  it('首尾空白容忍', () => {
    expect(resolveBootSession('  s_cli  ', ids, null)).toEqual({ matched: true, switchTo: 's_cli' })
  })
})
