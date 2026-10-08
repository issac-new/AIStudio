// overlay/custom/server/govbus/__tests__/event-log.test.ts
// 治理事件总线（六文调研轮 F）守门测试：追加/查询过滤/订阅 fan-out/双桥真实事件。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendGovEvent, queryGovEvents, subscribeGovEvent, _useGovEventDirForTests, _resetGovEventDirForTests,
  type GovEvent,
} from '../event-log'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'govbus-'))
  _useGovEventDirForTests(dir)
})

afterAll(() => {
  _resetGovEventDirForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('govbus event log', () => {
  it('追加→查询（新在前）+ 过滤器（域/严重级下限/类型前缀/时间窗）', () => {
    appendGovEvent({ domain: 'approval', severity: 'info', type: 'approval.once', source: 't', summary: 'a1', ts: 1000 })
    appendGovEvent({ domain: 'quality', severity: 'high', type: 'evidence.verdict_fail', source: 't', summary: 'q1', ts: 2000 })
    appendGovEvent({ domain: 'cost', severity: 'warn', type: 'cost.spike', source: 't', summary: 'c1', ts: 3000 })
    const all = queryGovEvents({})
    expect(all).toHaveLength(3)
    expect(all[0].summary).toBe('c1')  // 新在前
    expect(queryGovEvents({ domain: 'quality' })).toHaveLength(1)
    expect(queryGovEvents({ minSeverity: 'warn' })).toHaveLength(2)
    expect(queryGovEvents({ typePrefix: 'evidence.' })).toHaveLength(1)
    expect(queryGovEvents({ sinceMs: 1500 })).toHaveLength(2)
    expect(queryGovEvents({ limit: 2 })).toHaveLength(2)
  })

  it('非法域/严重级 → 抛错（类型面收敛）', () => {
    expect(() => appendGovEvent({ domain: 'bogus' as never, severity: 'info', type: 'x', source: 't', summary: 'x' })).toThrow()
    expect(() => appendGovEvent({ domain: 'system', severity: 'bogus' as never, type: 'x', source: 't', summary: 'x' })).toThrow()
  })

  it('订阅 fan-out：域过滤与严重级下限生效；退订后不再收', () => {
    const got: GovEvent[] = []
    const gotWarn: GovEvent[] = []
    const off1 = subscribeGovEvent({ label: 'all', fn: (e) => got.push(e) })
    const off2 = subscribeGovEvent({ label: 'warn+', minSeverity: 'warn', fn: (e) => gotWarn.push(e) })
    appendGovEvent({ domain: 'system', severity: 'info', type: 't.info', source: 't', summary: 'i' })
    appendGovEvent({ domain: 'security', severity: 'high', type: 't.high', source: 't', summary: 'h' })
    expect(got).toHaveLength(2)
    expect(gotWarn).toHaveLength(1)
    expect(gotWarn[0].severity).toBe('high')
    off1()
    off2()
    appendGovEvent({ domain: 'system', severity: 'info', type: 't.again', source: 't', summary: 'i2' })
    expect(got).toHaveLength(2)
  })

  it('订阅者抛异常不拖垮总线（fail-soft）', () => {
    const got: GovEvent[] = []
    subscribeGovEvent({ label: 'bad', fn: () => { throw new Error('subscriber bug') } })
    subscribeGovEvent({ label: 'good', fn: (e) => got.push(e) })
    expect(() => appendGovEvent({ domain: 'system', severity: 'info', type: 't.x', source: 't', summary: 'x' })).not.toThrow()
    expect(got).toHaveLength(1)
  })
})

describe('govbus 双桥（真实事件入口）', () => {
  // 桥是 fire-and-forget 异步落总线：断言前等一拍（微任务+宏任务各一）。
  const settle = () => new Promise((r) => setTimeout(r, 25))

  it('桥1：appendApprovalLog → approval 域事件（deny → high）', async () => {
    process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals-history.json')
    try {
      const { appendApprovalLog } = await import('../../approvals/approval-log')
      appendApprovalLog({ id: 'b1', actor: 'wei', targetKind: 'command', targetId: 'cmd-1', targetTitle: '危险命令', decision: 'deny' })
      await settle()
      const ev = queryGovEvents({ typePrefix: 'approval.' })[0]
      expect(ev).toBeTruthy()
      expect(ev.domain).toBe('approval')
      expect(ev.severity).toBe('high')
      expect(ev.summary).toContain('deny')
    } finally {
      delete process.env.HERMES_APPROVALS_LOG_FILE
    }
  })

  it('桥2：appendEvidence verification fail → quality 域 high 事件；pass → info', async () => {
    process.env.HERMES_EVIDENCE_DIR = join(dir, 'evidence')
    try {
      const { appendEvidence } = await import('../../evidence/evidence-store')
      appendEvidence({ evidenceId: 'vf1', taskId: 'task-govbus', kind: 'verification', at: 1, ref: './v1', verdict: 'fail', basis: 'npm test' })
      appendEvidence({ evidenceId: 'vp1', taskId: 'task-govbus', kind: 'verification', at: 2, ref: './v2', verdict: 'pass' })
      await settle()
      const verdicts = queryGovEvents({ typePrefix: 'evidence.verdict' })
      expect(verdicts).toHaveLength(2)
      expect(verdicts.find((e) => e.type === 'evidence.verdict_fail')?.severity).toBe('high')
      expect(verdicts.find((e) => e.type === 'evidence.verdict_pass')?.severity).toBe('info')
    } finally {
      delete process.env.HERMES_EVIDENCE_DIR
    }
  })

  it('桥2 附带：gapClass 标记 → quality 域 gap 事件', async () => {
    process.env.HERMES_EVIDENCE_DIR = join(dir, 'evidence')
    try {
      const { appendEvidence } = await import('../../evidence/evidence-store')
      appendEvidence({ evidenceId: 'gg1', taskId: 'task-govbus2', kind: 'artifact', at: 3, ref: './g1', gapClass: 'product_gap' })
      await settle()
      const ev = queryGovEvents({ typePrefix: 'evidence.gap_' })[0]
      expect(ev?.payload?.gapClass).toBe('product_gap')
    } finally {
      delete process.env.HERMES_EVIDENCE_DIR
    }
  })
})
