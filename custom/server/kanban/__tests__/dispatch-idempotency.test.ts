// 长会话治理 B4：派发幂等——台账窗口查询 + 列派发重放去重 + safeAct 进程内幂等。
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendDispatchOutcome, dispatchLedgerPath, hasRecentDispatch } from '../../governance/dispatch-ledger'
import { resetColumnAutomationsCacheForTests } from '../column-automation'

const HOME = mkdtempSync(join(tmpdir(), 'b4-ledger-'))

describe('hasRecentDispatch (ledger window query)', () => {
  beforeEach(() => { process.env.GOVERNANCE_DISPATCH_LEDGER = join(HOME, 'ledger.jsonl') })
  afterEach(() => { delete process.env.GOVERNANCE_DISPATCH_LEDGER })

  it('matches taskId+kind+column+target inside the window', () => {
    const file = dispatchLedgerPath()
    writeFileSync(file, JSON.stringify({
      ts: Date.now() - 60_000, kind: 'column', target: 'coder-a', column: 'In Progress',
      reason: 'queued', taskId: 'T-9',
    }) + '\n')
    expect(hasRecentDispatch({ taskId: 'T-9', kind: 'column', column: 'In Progress', target: 'coder-a' })).toBe(true)
    // 任何一维不同都不命中
    expect(hasRecentDispatch({ taskId: 'T-9', kind: 'column', column: 'Review', target: 'coder-a' })).toBe(false)
    expect(hasRecentDispatch({ taskId: 'T-9', kind: 'column', column: 'In Progress', target: 'coder-b' })).toBe(false)
    expect(hasRecentDispatch({ taskId: 'T-8', kind: 'column', column: 'In Progress', target: 'coder-a' })).toBe(false)
  })

  it('entries older than the window do not match; older entries stop the scan', () => {
    const file = dispatchLedgerPath()
    writeFileSync(file, JSON.stringify({
      ts: Date.now() - 40 * 60 * 1000, kind: 'column', target: 'coder-a', column: 'In Progress',
      reason: 'queued', taskId: 'T-9',
    }) + '\n')
    expect(hasRecentDispatch({ taskId: 'T-9', kind: 'column', column: 'In Progress', target: 'coder-a' })).toBe(false)
  })

  it('missing ledger fails open (no dedup)', () => {
    process.env.GOVERNANCE_DISPATCH_LEDGER = join(HOME, 'absent.jsonl')
    expect(hasRecentDispatch({ taskId: 'T-9', kind: 'column' })).toBe(false)
  })
})

describe('column dispatch dedup (replay within window)', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'b4-columns-'))
    process.env.HERMES_COLUMNS_FILE = join(dir, 'columns.yaml')
    process.env.GOVERNANCE_DISPATCH_LEDGER = join(dir, 'ledger.jsonl')
    writeFileSync(join(dir, 'columns.yaml'), [
      'columns:',
      '  in_progress:',
      '    timing: entry',
      '    steps:',
      '      - id: s1',
      '        role: general-engineer',
      '        specialist: refiner',
      '        provider: zcode',
      '',
    ].join('\n'), 'utf8')
    resetColumnAutomationsCacheForTests()
  })
  afterEach(() => {
    delete process.env.HERMES_COLUMNS_FILE
    delete process.env.GOVERNANCE_DISPATCH_LEDGER
    resetColumnAutomationsCacheForTests()
    rmSync(dir, { recursive: true, force: true })
  })

  it('second dispatch for the same taskId+column+provider is skipped and reported in deduped', async () => {
    const { dispatchColumnTransition } = await import('../../kanban/column-dispatch')
    const calls: string[] = []
    const service = {
      dispatch: async (p: { text: string }) => {
        calls.push(p.text)
        return [{ reason: 'queued', commandId: 'c1', sessionId: 's1' }]
      },
    } as never
    const params = { from: null, to: 'in_progress', workspacePath: '/w', taskId: 'T-42' }
    const first = await dispatchColumnTransition(service, params)
    expect(first.outcomes).toHaveLength(1)
    expect(first.deduped).toHaveLength(0)
    // 重放（重启环形态）：同键 30 分钟窗口内 → 跳过
    const second = await dispatchColumnTransition(service, params)
    expect(second.outcomes).toHaveLength(0)
    expect(second.deduped).toHaveLength(1)
    expect(second.deduped[0]).toMatchObject({ taskId: 'T-42', column: 'in_progress', provider: 'zcode' })
    expect(calls).toHaveLength(1)
    // 不同 taskId 不受影响
    const third = await dispatchColumnTransition(service, { ...params, taskId: 'T-43' })
    expect(third.outcomes).toHaveLength(1)
  })
})

afterAll(() => rmSync(HOME, { recursive: true, force: true }))
