/**
 * 字段级脱敏试点（P3-2，2026-10-21）。
 *
 * 只对 FIBO 账户/付款方两类实例生效，选两个字段做「角色 × 属性 × 可见性」：
 *   Account.accountNumber、Payer.partyRef —— super_admin/admin 可见，其余角色脱敏。
 * 读时脱敏，不改存储；本地无鉴权上下文（dev）视为管理上下文，与 superAdminDenied 同语义。
 */
import type { OntologyInstance } from './ontology-types'

export interface FiboFieldPolicy {
  type: string
  field: string
  allowRoles: string[]
  note: string
}

export const FIBO_FIELD_POLICIES: FiboFieldPolicy[] = [
  { type: 'Account', field: 'accountNumber', allowRoles: ['super_admin', 'admin'], note: '账户号属敏感标识' },
  { type: 'Payer', field: 'partyRef', allowRoles: ['super_admin', 'admin'], note: '付款方外部标识' },
]

export const REDACTED_VALUE = '***'

export interface RedactResult {
  instances: OntologyInstance[]
  redacted: number
  fields: string[]
}

/** 按角色脱敏实例数据；返回新数组，不修改入参。 */
export function redactInstancesForRole(
  instances: OntologyInstance[],
  role: string | undefined,
): RedactResult {
  const effective = role ?? 'super_admin'
  const applicable = FIBO_FIELD_POLICIES.filter((p) => !p.allowRoles.includes(effective))
  if (applicable.length === 0) return { instances, redacted: 0, fields: [] }

  let redacted = 0
  const fields = new Set<string>()
  const out = instances.map((inst) => {
    const hits = applicable.filter((p) => p.type === inst.type && p.field in (inst.data ?? {}))
    if (hits.length === 0) return inst
    redacted++
    const data = { ...inst.data }
    for (const p of hits) {
      data[p.field] = REDACTED_VALUE
      fields.add(`${p.type}.${p.field}`)
    }
    return { ...inst, data }
  })
  return { instances: out, redacted, fields: [...fields] }
}
