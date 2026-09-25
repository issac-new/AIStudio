// 权限升级协议守门（routa §七#7：urgency 三档/待决队列排序/一次定音/批准即改沙箱约束）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  decideEscalation, isEscalationUrgency, listPending, loadEscalation, requestEscalation,
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
