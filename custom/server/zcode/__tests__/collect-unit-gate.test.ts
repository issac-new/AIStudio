// 审查挂账3/6 守门：collectUnitGate 逐目标隔离采集。
// 缺陷：此前整个采集循环包在一个 try 里，任一目标读取抛错即丢弃整张读数表
// （已成功采集的读数一并丢失，等价于「全批都没评门」）。修复后单目标失败只
// 影响该目标——按门自身 fail-soft 口径记 unknown（ledger_unavailable，不拦）。
// mock 注入采集链路抛错（readUnitGateFacts 对目标名含 'boom' 的目标抛），
// 其余目标走真实现，不依赖真实台账文件。
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../agentidentity/dispatch-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agentidentity/dispatch-gate')>()
  return {
    ...actual,
    readUnitGateFacts: (target: string, targetKind: 'agent' | 'matrix-account', mode?: 'on' | 'off') => {
      if (target.includes('boom')) throw new Error(`采集链路意外异常：${target}`)
      return actual.readUnitGateFacts(target, targetKind, mode)
    },
  }
})

const { collectUnitGate } = await import('../mention-dispatch')

const agentToken = (target: string) => ({ raw: `@${target}`, target, kind: 'agent' as const })

describe('collectUnitGate 逐目标隔离（审查挂账3/6）', () => {
  it('单目标读取抛错：该目标记 unknown（不拦），其余目标读数保留', () => {
    const map = collectUnitGate([agentToken('good-agent'), agentToken('boom-agent')])
    // 抛错目标不炸整表：unknown 语义与门自身 fail-soft 口径一致（不拦）
    const bad = map.get('boom-agent')
    expect(bad).toBeDefined()
    expect(bad!.decision).toBe('unknown')
    expect(bad!.applicable).toBe(false)
    expect(bad!.reasons).toEqual(['ledger_unavailable'])
    // 已成功采集的读数保留（此前整表丢弃）
    const good = map.get('good-agent')
    expect(good).toBeDefined()
    expect(['pass', 'skipped', 'unknown', 'block']).toContain(good!.decision)
    expect(good!.target).toBe('good-agent')
  })

  it('全部目标正常：返回逐目标真实读数（非 mock 路径回归）', () => {
    const map = collectUnitGate([agentToken('a1'), agentToken('a2')])
    expect(map.size).toBe(2)
    expect(map.get('a1')!.target).toBe('a1')
    expect(map.get('a2')!.target).toBe('a2')
  })

  it('重复目标只采一次（runsFor 去重语义不变）', () => {
    const map = collectUnitGate([agentToken('dup'), agentToken('dup')])
    expect(map.size).toBe(1)
  })
})
