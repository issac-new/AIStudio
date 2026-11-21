// 批一 b 变更 3 挂线测试：dispatchColumnTransition 入口触发试用期惰性结算
// （settleDueProbation，幂等有界、fail-soft 不阻断派发；spec 决策 1——不新增
// watcher，由下一次派单触发）。vi.mock 文件级作用域故独立成文件（夹具范式：
// dispatch-idempotency.test.ts）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const settleSpy = vi.hoisted(() => vi.fn(async () => []))
vi.mock('../../expcandidates/probation', () => ({
  settleDueProbation: settleSpy,
  twoProportionZ: () => null,
  Z_ALPHA_ONE_SIDED_0_05: 1.6449,
  PROBATION_SETTLE_BATCH_LIMIT: 10,
}))

let dir = ''

beforeEach(async () => {
  settleSpy.mockClear()
  dir = mkdtempSync(join(tmpdir(), 'probation-hook-'))
  process.env.HERMES_COLUMNS_FILE = join(dir, 'columns.yaml')
  process.env.GOVERNANCE_DISPATCH_LEDGER = join(dir, 'ledger.jsonl')
  writeFileSync(join(dir, 'columns.yaml'), [
    'columns:', '  doing:', '    timing: entry', '    steps:', '      - id: s1', '        role: general-engineer', '        provider: zcode', '',
  ].join('\n'), 'utf8')
  const { resetColumnAutomationsCacheForTests } = await import('../column-automation')
  resetColumnAutomationsCacheForTests()
})

afterEach(async () => {
  delete process.env.HERMES_COLUMNS_FILE
  delete process.env.GOVERNANCE_DISPATCH_LEDGER
  const { resetColumnAutomationsCacheForTests } = await import('../column-automation')
  resetColumnAutomationsCacheForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('派单入口惰性结算挂线', () => {
  it('每次列流转派单调用一次 settleDueProbation（预检通过后、派发前）', async () => {
    const { dispatchColumnTransition } = await import('../column-dispatch')
    const fakeService = { dispatch: async () => [{ reason: 'queued', commandId: 'c1', sessionId: 's1' }] }
    const r = await dispatchColumnTransition(fakeService as never, { from: 'todo', to: 'doing', workspacePath: '/tmp/w' })
    expect(r.outcomes).toHaveLength(1)
    expect(settleSpy).toHaveBeenCalledTimes(1)
  })

  it('结算异常 fail-soft：派发照常完成（不因试用期结算阻断业务）', async () => {
    settleSpy.mockRejectedValueOnce(new Error('板库暂不可读'))
    const { dispatchColumnTransition } = await import('../column-dispatch')
    const fakeService = { dispatch: async () => [{ reason: 'queued', commandId: 'c1', sessionId: 's1' }] }
    const r = await dispatchColumnTransition(fakeService as never, { from: 'todo', to: 'doing', workspacePath: '/tmp/w' })
    expect(r.outcomes).toHaveLength(1)
    expect(settleSpy).toHaveBeenCalledTimes(1)
  })
})
