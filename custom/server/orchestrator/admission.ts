// custom/server/orchestrator/admission.ts
// 按源准入表（2026-10-31 A+B 批 spec D7）。
// 语义对照 dsh-superagent-prototype docs/002-authorization.md：
//   每个源有自己的准入单元表（发送者是否在名单 × 是否明确指向），单元给 accept/ignore/inferred；
//   源级 mode 决定是否真的接单：off 不评估 / observe 只记录 / auto 正向即接单。
// 本模块是纯判定 + JSON 存储；判定结果由 ingest 落库，不直接派发任务。
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import type { AdmissionAction, AdmissionCell, AdmitResult, AuthStrength, SourceAdmission } from './types'
import { ADMISSION_ACTIONS, ADMISSION_MODES } from './types'

/** 准入表文件：与其它治理策略同根（~/.hermes-web-ui/orchestrator/admissions.json）。 */
export function admissionsFile(): string {
  const override = process.env.ORCHESTRATOR_ADMISSIONS?.trim()
  if (override) return resolve(override)
  return resolve(underWebUi('orchestrator'), 'admissions.json')
}

/** 缺省单元：名单内且明确指向=accept；名单内不指向=inferred；名单外一律 ignore。
 *  与上游默认一致（unlisted 的 addressed 单元缺省为 ignore），宁可漏接不可越权。 */
export function defaultCells(): AdmissionCell[] {
  return [
    { sender: 'listed', addressing: true, action: 'accept' },
    { sender: 'listed', addressing: false, action: 'inferred' },
    { sender: 'unlisted', addressing: true, action: 'ignore' },
    { sender: 'unlisted', addressing: false, action: 'ignore' },
  ]
}

export function normalizeAdmission(input: Partial<SourceAdmission> & { sourceId: string }): SourceAdmission {
  const mode = ADMISSION_MODES.includes(input.mode as SourceAdmission['mode'])
    ? input.mode as SourceAdmission['mode']
    : 'observe'
  const allowedSenders = Array.isArray(input.allowedSenders)
    ? input.allowedSenders.map(s => String(s).trim()).filter(Boolean)
    : []
  const cells = Array.isArray(input.cells) && input.cells.length
    ? input.cells.filter(isCell).map(c => ({
      sender: c.sender, addressing: c.addressing, action: c.action,
    }))
    : defaultCells()
  return { sourceId: input.sourceId, mode, allowedSenders, cells }
}

function isCell(value: unknown): value is AdmissionCell {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return (c.sender === 'listed' || c.sender === 'unlisted')
    && typeof c.addressing === 'boolean'
    && ADMISSION_ACTIONS.includes(c.action as AdmissionAction)
}

/** 纯判定：不读盘。senderListed 由调用方按 allowedSenders 判定后传入。 */
export function admit(
  admission: SourceAdmission,
  senderListed: boolean,
  addressed: boolean,
): AdmitResult {
  if (admission.mode === 'off') {
    return { allow: false, action: null, strength: null, reason: 'source_off' }
  }
  const cell = admission.cells.find(c => c.sender === (senderListed ? 'listed' : 'unlisted') && c.addressing === addressed)
  if (!cell) {
    return { allow: false, action: null, strength: null, reason: 'no_matching_cell' }
  }
  const strength: AuthStrength | null = cell.action === 'accept'
    ? 'explicit'
    : cell.action === 'inferred' ? 'inferred' : null
  // observe 只记录 would-accept：allow 为 false，但 action/strength 保留供审计。
  const allow = admission.mode === 'auto' && cell.action !== 'ignore'
  return {
    allow,
    action: cell.action,
    strength,
    reason: admission.mode === 'observe'
      ? (cell.action === 'ignore' ? 'observe_ignore' : 'observe_would_accept')
      : (allow ? 'auto_accept' : 'ignored'),
  }
}

interface AdmissionsDoc { version: 1; updatedAt: number; sources: SourceAdmission[] }

function loadDoc(): AdmissionsDoc {
  const file = admissionsFile()
  if (!existsSync(file)) return { version: 1, updatedAt: 0, sources: [] }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { sources?: unknown }).sources)) {
    // 策略文件损坏必须 fail-closed：不能以空表继续。
    throw new Error(`准入表格式无效：${file}`)
  }
  const doc = parsed as AdmissionsDoc
  return {
    version: 1, updatedAt: Number(doc.updatedAt) || 0,
    sources: doc.sources.map(s => normalizeAdmission(s as Partial<SourceAdmission> & { sourceId: string })),
  }
}

function saveDoc(doc: AdmissionsDoc): void {
  atomicWriteJson(admissionsFile(), doc, { indent: 2 })
}

export function listAdmissions(): SourceAdmission[] {
  return loadDoc().sources
}

export function getAdmission(sourceId: string): SourceAdmission | null {
  return loadDoc().sources.find(s => s.sourceId === sourceId) ?? null
}

export function setAdmission(admission: SourceAdmission, changedBy: string): SourceAdmission {
  const doc = loadDoc()
  const normalized = normalizeAdmission(admission)
  const idx = doc.sources.findIndex(s => s.sourceId === normalized.sourceId)
  if (idx >= 0) doc.sources[idx] = normalized
  else doc.sources.push(normalized)
  doc.updatedAt = Date.now()
  saveDoc(doc)
  void changedBy // 变更人由 policy-version 台账记录，此处不重复存
  return normalized
}
