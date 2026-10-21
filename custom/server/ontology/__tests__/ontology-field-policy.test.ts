// P3-2 字段级脱敏试点守门（2026-10-21）：
//   viewer 看不到 Account.accountNumber / Payer.partyRef；admin 可见；其他类型不受影响；
//   只读脱敏不改存储。
import { describe, expect, it } from 'vitest'
import { FIBO_FIELD_POLICIES, REDACTED_VALUE, redactInstancesForRole } from '../ontology-field-policy'
import type { OntologyInstance } from '../ontology-types'

function inst(id: string, type: string, data: Record<string, unknown>): OntologyInstance {
  return { id, type, label: id, data, relations: [], updatedAt: 0 }
}

const account = inst('a1', 'Account', { accountNumber: 'ACC-1', openedOn: '2026-01-01' })
const payer = inst('p1', 'Payer', { partyRef: 'ACME', other: 'keep' })
const task = inst('t1', 'Task', { title: '任务', status: 'todo' })

describe('字段级脱敏试点', () => {
  it('试点策略两条：账户号与付款方标识', () => {
    expect(FIBO_FIELD_POLICIES.map((p) => `${p.type}.${p.field}`)).toEqual([
      'Account.accountNumber', 'Payer.partyRef',
    ])
  })

  it('viewer：两类敏感字段变 ***，其他字段与其他类型不受影响', () => {
    const r = redactInstancesForRole([account, payer, task], 'viewer')
    expect(r.redacted).toBe(2)
    expect(r.fields.sort()).toEqual(['Account.accountNumber', 'Payer.partyRef'])
    expect(r.instances[0].data.accountNumber).toBe(REDACTED_VALUE)
    expect(r.instances[0].data.openedOn).toBe('2026-01-01')
    expect(r.instances[1].data.partyRef).toBe(REDACTED_VALUE)
    expect(r.instances[1].data.other).toBe('keep')
    expect(r.instances[2]).toBe(task) // 非策略类型原样返回
    // 不改存储
    expect(account.data.accountNumber).toBe('ACC-1')
    expect(payer.data.partyRef).toBe('ACME')
  })

  it('super_admin/admin 与无鉴权上下文（dev）不脱敏', () => {
    for (const role of ['super_admin', 'admin', undefined]) {
      const r = redactInstancesForRole([account, payer], role)
      expect(r.redacted, String(role)).toBe(0)
      expect(r.instances[0].data.accountNumber).toBe('ACC-1')
      expect(r.instances[1].data.partyRef).toBe('ACME')
    }
  })
})
