/**
 * overlay/custom/server/simcenter/uat-state.ts
 * UAT 逐 AC 判定最小状态机（spec 2026-10-21-g5-uat-state-machine §2）：
 *
 *   pending --pass--> pass
 *   pending --conditional（必填 note + 显式 acknowledged）--> conditional
 *   pending --reject（必填 note）--> reject（阻断该 AC）
 *
 * 允许改判：append-only 台账，最新记录胜出，历史全量可查；没有 409 迁移限制。
 * 读模型按 AC 聚合：latest + history + blocked。非法 verdict/ac 由校验层 400。
 */

export type UatVerdictKey = 'pass' | 'conditional' | 'reject'
export type UatAcState = 'pending' | UatVerdictKey

export const UAT_VERDICT_LABEL: Record<UatVerdictKey, string> = {
  pass: '通过', conditional: '有条件通过', reject: '不通过',
}

export interface UatVerdictRecord {
  ts: string
  actor: string
  run: string
  ac: string
  verdict: UatVerdictKey
  note?: string
  /** conditional 的显式认可事件标记（写入时必填 true） */
  acknowledged?: boolean
}

export interface UatAcAggregate {
  ac: string
  state: UatAcState
  latest: UatVerdictRecord | null
  history: UatVerdictRecord[]
  /** 最新判定为 reject：阻断该 AC（不参与通过统计） */
  blocked: boolean
}

export interface UatAggregate {
  byAc: UatAcAggregate[]
  summary: { acCount: number; pass: number; conditional: number; reject: number; blocked: number }
}

export interface UatVerdictFields {
  ac: string
  verdict: UatVerdictKey
  note?: string
  acknowledged?: boolean
}

/** AC 编号归一（纯函数）：接受 "3"/"AC-3"/"ac 3"，输出 AC-N；其他 null。 */
export function normalizeUatAc(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^(?:AC[-\s]?)?(\d{1,3})$/i.exec(raw.trim())
  return m ? `AC-${m[1]}` : null
}

/**
 * 判定字段校验（纯函数；run 由控制器统一校验）：
 * - verdict ∈ pass|conditional|reject
 * - conditional：note 必填 + acknowledged=true（显式认可事件）
 * - reject：note 必填（理由）
 * - note ≤200
 */
export function validateUatVerdictFields(body: unknown):
  { ok: true; ac: string; verdict: UatVerdictKey; note?: string; acknowledged?: boolean } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: '请求体须为对象' }
  }
  const b = body as Record<string, unknown>
  const ac = normalizeUatAc(b.ac)
  if (!ac) return { ok: false, error: 'ac 非法（形如 AC-1，编号 ≤3 位）' }
  const verdict = b.verdict
  if (verdict !== 'pass' && verdict !== 'conditional' && verdict !== 'reject') {
    return { ok: false, error: 'verdict 须为 pass|conditional|reject' }
  }
  const note = typeof b.note === 'string' ? b.note.trim() : ''
  if (note.length > 200) return { ok: false, error: 'note 超长（≤200 字符）' }
  const acknowledged = b.acknowledged === true || b.ack === true
  if (verdict === 'conditional' && !note) {
    return { ok: false, error: '有条件通过必须填写说明（note 必填）' }
  }
  if (verdict === 'conditional' && !acknowledged) {
    return { ok: false, error: '有条件通过需显式认可（acknowledged:true）' }
  }
  if (verdict === 'reject' && !note) {
    return { ok: false, error: '不通过必须填写理由（note 必填）' }
  }
  return {
    ok: true,
    ac,
    verdict,
    ...(note ? { note } : {}),
    ...(acknowledged ? { acknowledged: true } : {}),
  }
}

/**
 * 按 AC 聚合（纯函数）：最新 ts 胜出（同 ts 取后出现者），历史按台账顺序保留。
 * AC 排序按编号数值，未知编号的坏记录不进聚合（读层已过滤三态 verdict）。
 */
export function aggregateUatByAc(records: UatVerdictRecord[]): UatAggregate {
  const groups = new Map<string, UatVerdictRecord[]>()
  for (const record of records) {
    if (!record || typeof record.ac !== 'string') continue
    const list = groups.get(record.ac) ?? []
    list.push(record)
    groups.set(record.ac, list)
  }
  const byAc: UatAcAggregate[] = [...groups.entries()].map(([ac, history]) => {
    let latest: UatVerdictRecord | null = null
    for (const record of history) {
      if (!latest || Date.parse(record.ts) >= Date.parse(latest.ts)) latest = record
    }
    return {
      ac,
      state: latest?.verdict ?? 'pending',
      latest,
      history,
      blocked: latest?.verdict === 'reject',
    }
  }).sort((a, b) => Number(a.ac.replace(/^AC-/i, '')) - Number(b.ac.replace(/^AC-/i, '')))
  const count = (key: UatVerdictKey) => byAc.filter(a => a.state === key).length
  return {
    byAc,
    summary: {
      acCount: byAc.length,
      pass: count('pass'),
      conditional: count('conditional'),
      reject: count('reject'),
      blocked: byAc.filter(a => a.blocked).length,
    },
  }
}
