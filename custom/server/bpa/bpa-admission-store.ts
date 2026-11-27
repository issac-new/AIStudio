// 场景准入结论账本（B2，2026-11-28）：追加式、原子写、不覆盖历史。
// 只存人签署的结论（pilot=可进入试点 / deferred=暂缓）；「需补条件」由缺口推导
// （bpa-admission.assessAdmission），不落账不签署（spec D8）。签署人取服务端登录身份，
// 由控制器写入；本模块不读登录态。
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import type { AdmissionRuleResult } from './bpa-admission'
import type { BpaNode } from './bpa-types'

export type AdmissionConclusion = 'pilot' | 'deferred'

export interface BpaAdmissionRecord {
  recordId: string
  nodeId: string
  nodeName: string
  conclusion: AdmissionConclusion
  /** 签署理由（必填：结论是对外承诺，一句话理由不足以复核——结算 rationale 同款下限另在控制器） */
  reason: string
  /** 签署时四条规则的三态快照（结论对着当时的事实，事后规则变了不改写历史） */
  rulesSnapshot: AdmissionRuleResult[]
  /** 签署时的待补清单（pilot 时应为空数组） */
  pendingItems: string[]
  /** 服务端登录身份（请求体同名字段不采纳） */
  signedBy: string
  signedAt: number
}

export function admissionStoreFile(): string {
  return process.env.BPA_ADMISSION_STORE?.trim()
    ? resolve(process.env.BPA_ADMISSION_STORE.replace(/^~/, homedir()))
    : join(underWebUi('overlay'), 'bpa-admission.json')
}

interface StoreShape { records: BpaAdmissionRecord[] }

/** fail-soft 读：文件缺失/损坏 → 空账（与 bpa-store 同款纪律；损坏不隔离原档，下次写入即覆盖，
 *  准入结论是治理记录——损坏时由控制器在响应里如实标注？v1 从简：空账即「无签署记录」。） */
export function readAdmissionRecords(): BpaAdmissionRecord[] {
  const file = admissionStoreFile()
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<StoreShape>
    return Array.isArray(raw.records) ? raw.records.filter((r) => r && typeof r.recordId === 'string') : []
  } catch {
    return []
  }
}

/** 追加一条签署结论（追加式：同节点重复签署产生新记录，不覆盖；latest 取 signedAt 最大）。 */
export function appendAdmissionRecord(
  input: Omit<BpaAdmissionRecord, 'recordId' | 'signedAt'> & { signedAt?: number },
): BpaAdmissionRecord {
  const record: BpaAdmissionRecord = {
    ...input,
    recordId: `adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    signedAt: input.signedAt ?? Date.now(),
  }
  const records = [...readAdmissionRecords(), record]
  atomicWriteJson(admissionStoreFile(), { records })
  return record
}

/** 某节点当前有效的签署结论（signedAt 最大的一条；平局取数组靠后者=后写覆盖）。 */
export function latestAdmissionOf(nodeId: string): BpaAdmissionRecord | null {
  let latest: BpaAdmissionRecord | null = null
  for (const r of readAdmissionRecords()) {
    if (r.nodeId !== nodeId) continue
    if (latest === null || r.signedAt >= latest.signedAt) latest = r
  }
  return latest
}

/** 节点名快照用（签署时记下当时的节点名，节点后来改名历史仍可读）。 */
export function nodeNameOf(node: Pick<BpaNode, 'name'>): string {
  return node.name
}
