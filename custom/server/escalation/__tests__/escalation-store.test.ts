// 权限升级协议守门（routa §七#7：urgency 三档/待决队列排序/一次定音/批准即改沙箱约束）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  attributeEscalation, decideEscalation, isEscalationUrgency, isMechanismGap, listDecided,
  listPending, loadEscalation, recurrenceByScope, requestEscalation, AttributionGateError,
} from '../escalation-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'esc-'))
  process.env.HERMES_ESCALATION_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_ESCALATION_DIR
  rmSync(dir, { recursive: true, force: true })
})

const req = (id: string, urgency: 'normal' | 'urgent' | 'critical', at = 1) =>
  requestEscalation({
    escalationId: id, fromAgent: 'zcode', scope: { tool: 'terminal', argvPrefix: 'kubectl' },
    urgency, reason: '需要集群权限', at,
  })

describe('urgency 三档 + 待决队列（routa listPendingPermissions）', () => {
  it('三档冻结；待决按 urgency 高在前', () => {
    expect(isEscalationUrgency('critical')).toBe(true)
    expect(isEscalationUrgency('asap')).toBe(false)
    req('e1', 'normal', 1)
    req('e2', 'critical', 2)
    req('e3', 'urgent', 3)
    expect(listPending().map((r) => r.escalationId)).toEqual(['e2', 'e3', 'e1'])
  })

  it('发起幂等', () => {
    const a = req('e4', 'normal')
    const b = requestEscalation({ ...a, reason: '改理由' })
    expect(b.reason).toBe('需要集群权限')  // 幂等不覆盖
  })
})

describe('裁决（一次定音 + 批准即改沙箱约束）', () => {
  it('approved 可附 sandboxConstraints；重裁被拒；denied 无约束', () => {
    req('e5', 'urgent')
    const done = decideEscalation('e5', 'approved', {
      by: 'coordinator', note: '限 kubectl get',
      sandboxConstraints: [{ tool: 'terminal', argvPrefix: 'kubectl get', list: 'allow' }],
    })
    expect('state' in done && done.state).toBe('approved')
    expect('decision' in done && done.decision!.sandboxConstraints).toHaveLength(1)
    const again = decideEscalation('e5', 'denied', { by: 'x' })
    expect('error' in again && again.error).toContain('一次定音')

    req('e6', 'normal')
    const denied = decideEscalation('e6', 'denied', { by: 'coordinator', note: '不批' })
    expect('state' in denied && denied.state).toBe('denied')
    expect(listPending()).toHaveLength(0)  // 待决清空
  })
})

describe('机制归因（甲2：结案断点五选一 + 复发纪律）', () => {
  it('pending 不许归因；裁决后可归因；一次定音', () => {
    req('a1', 'normal')
    const early = attributeEscalation('a1', 'capability', 'coordinator')
    expect('error' in early && early.error).toContain('未裁决')
    decideEscalation('a1', 'approved', { by: 'c' })
    const ok = attributeEscalation('a1', 'capability', 'cuishi', '缺 LSP 工具')
    expect('attribution' in ok && ok.attribution?.gap).toBe('capability')
    expect('attribution' in ok && ok.attribution?.note).toBe('缺 LSP 工具')
    const again = attributeEscalation('a1', 'resource', 'c')
    expect('error' in again && again.error).toContain('一次定音')
  })

  it('gap 词表冻结（六值）', () => {
    expect(isMechanismGap('information')).toBe(true)
    expect(isMechanismGap('authority')).toBe(true)
    expect(isMechanismGap('none')).toBe(true)
    expect(isMechanismGap('budget')).toBe(false)
  })

  it('recurrenceByScope：同 tool 聚合、gap≠none 计断点、未归因单列', () => {
    req('r1', 'normal', 100); decideEscalation('r1', 'approved', { by: 'c' })
    attributeEscalation('r1', 'capability', 'c')
    req('r2', 'normal', 200); decideEscalation('r2', 'denied', { by: 'c' })  // 不归因
    const g = recurrenceByScope().get('terminal')
    expect(g?.incidents).toBe(2)
    expect(g?.byGap.capability).toBe(1)
    expect(g?.unattributed).toBe(1)
    expect(listDecided()).toHaveLength(2)
  })

  it('enforce 闸：同 (fromAgent, tool) 未归因前科拒新；归因后放行；异 tool 不连坐', () => {
    process.env.GOVERNANCE_ATTRIBUTION_ENFORCE = '1'
    try {
      req('g1', 'normal'); decideEscalation('g1', 'approved', { by: 'c' })
      expect(() => req('g2', 'normal')).toThrow(AttributionGateError)
      // 异 tool 不连坐（复发纪律按 scope 断点，不是全停）
      requestEscalation({
        escalationId: 'g3', fromAgent: 'zcode', scope: { tool: 'files' },
        urgency: 'normal', reason: 'x',
      })
      attributeEscalation('g1', 'authority', 'c')
      expect(requestEscalation({
        escalationId: 'g4', fromAgent: 'zcode', scope: { tool: 'terminal' },
        urgency: 'normal', reason: 'y',
      }).escalationId).toBe('g4')
    } finally {
      delete process.env.GOVERNANCE_ATTRIBUTION_ENFORCE
    }
  })
})
