// overlay/obsalerts 域：信号问题记录（B6 2026-11-28）。
//
// 为什么另立来源类型而不放宽评测处置单（eval/store.ts remediation）：处置单的关闭判据
// 全是评测专有（同 setId/setHash、复评通过），放宽后告警类记录永远关不掉，还会污染
// 飞轮漏斗计数——spec D12。本模块承接两类来源：obs-alert（观测告警）与 incident（事故报告）。
//
// 版本锚点（spec B6）：建单时按调用方给的 runId/sessionId 查运行清单（run-manifest），
// 抄入 model/promptHash/permissionMode/toolContractVersion——必须是抄值不能只存引用，
// 清单只保留 14 天。没给运行标识或查不到时锚点为 null 并写明原因，不猜版本。
//
// 幂等：sourceKey = 来源类型 + 稳定键（告警用 kind@窗口起点）。同键重复建单返回已有记录。
// 存储：JSON 快照 + 原子写；OBS_ISSUES_STORE 覆盖，缺省 underWebUi('obs-issues.json')。
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import { queryRunManifests, type RunManifest } from '../runmanifest/run-manifest'

export type SignalIssueSourceKind = 'obs-alert' | 'incident'

export interface SignalIssueAnchors {
  runId: string
  sessionId: string
  model: string
  promptHash?: string
  permissionMode?: string
  toolContractVersion: string
}

export interface SignalIssueRecord {
  issueId: string
  sourceKind: SignalIssueSourceKind
  sourceKey: string
  title: string
  severity: string
  detail: string
  /** 版本锚点；null=缺席（anchorNote 写明为什么缺席） */
  anchors: SignalIssueAnchors | null
  anchorNote: string
  status: 'open' | 'closed'
  closureNote?: string
  closedBy?: string
  closedAt?: number
  createdAt: number
}

export function obsIssueStoreFile(): string {
  return process.env.OBS_ISSUES_STORE?.trim()
    ? resolve(process.env.OBS_ISSUES_STORE)
    : join(underWebUi(), 'obs-issues.json')
}

/** 测试隔离：指向临时目录（目录内 obs-issues.json 为存储文件）。null 恢复生产路径。 */
export function _useObsIssueStoreForTests(dir: string | null): void {
  overrideDir = dir
}
let overrideDir: string | null = null

function storeFile(): string {
  if (overrideDir) return join(overrideDir, 'obs-issues.json')
  return obsIssueStoreFile()
}

function readAll(): SignalIssueRecord[] {
  const file = storeFile()
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { records?: SignalIssueRecord[] }
    return Array.isArray(raw.records) ? raw.records : []
  } catch {
    return []
  }
}

function writeAll(records: SignalIssueRecord[]): void {
  atomicWriteJson(storeFile(), { records })
}

export function listSignalIssues(): SignalIssueRecord[] {
  return readAll()
}

export function findSignalIssueBySourceKey(kind: SignalIssueSourceKind, sourceKey: string): SignalIssueRecord | null {
  return readAll().find((r) => r.sourceKind === kind && r.sourceKey === sourceKey) ?? null
}

/** 按运行标识抄版本锚点：runId 优先，其次 sessionId 取最近一条。查不到返回 null＋原因。 */
function anchorsFromManifest(
  ids: { runId?: string; sessionId?: string },
  manifests: RunManifest[],
): { anchors: SignalIssueAnchors | null; anchorNote: string } {
  if (!ids.runId && !ids.sessionId) {
    return { anchors: null, anchorNote: '未提供运行标识（runId/sessionId），版本锚点缺席——建单来源只有文本没有运行上下文' }
  }
  // 测试注入面：调用方传 manifests 直接用；生产查真实清单（保留窗内的）
  const entries = manifests
    ?? queryRunManifests({ runId: ids.runId, sessionId: ids.sessionId, days: 14, limit: 1 }).entries
  const hit = ids.runId
    ? entries.filter((m) => m.runId === ids.runId).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
    : entries.filter((m) => m.sessionId === ids.sessionId).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  if (!hit) {
    return { anchors: null, anchorNote: `运行清单里查不到 ${ids.runId ?? ids.sessionId}（清单只保留 14 天，或该运行未落清单）——版本锚点缺席，不猜版本` }
  }
  return {
    anchors: {
      runId: hit.runId,
      sessionId: hit.sessionId,
      model: hit.model,
      ...(hit.promptHash ? { promptHash: hit.promptHash } : {}),
      ...(hit.permissionMode ? { permissionMode: hit.permissionMode } : {}),
      toolContractVersion: hit.toolContractVersion,
    },
    anchorNote: `版本锚点抄自运行清单（runId=${hit.runId}，清单只保留 14 天，这里是抄值不是引用）`,
  }
}

/** 建单（幂等按 sourceKind+sourceKey）。 */
export function createSignalIssue(input: {
  sourceKind: SignalIssueSourceKind
  sourceKey: string
  title: string
  severity: string
  detail: string
  runId?: string
  sessionId?: string
  /** 测试注入的清单；生产缺省查真实运行清单 */
  manifests?: RunManifest[]
}): { created: boolean; record: SignalIssueRecord } {
  const existing = findSignalIssueBySourceKey(input.sourceKind, input.sourceKey)
  if (existing) return { created: false, record: existing }
  const { anchors, anchorNote } = anchorsFromManifest(
    { runId: input.runId?.trim() || undefined, sessionId: input.sessionId?.trim() || undefined },
    input.manifests ?? null as unknown as RunManifest[],
  )
  const record: SignalIssueRecord = {
    issueId: `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sourceKind: input.sourceKind,
    sourceKey: input.sourceKey,
    title: input.title.slice(0, 200),
    severity: input.severity,
    detail: input.detail.slice(0, 2_000),
    anchors,
    anchorNote,
    status: 'open',
    createdAt: Date.now(),
  }
  writeAll([...readAll(), record])
  return { created: true, record }
}

/** 关闭（说明必填；已关闭拒绝——关闭是结论，不覆盖）。 */
export function closeSignalIssue(
  issueId: string,
  closureNote: string,
  closedBy: string,
): { ok: boolean; record?: SignalIssueRecord; reason?: string } {
  const records = readAll()
  const idx = records.findIndex((r) => r.issueId === issueId)
  if (idx < 0) return { ok: false, reason: `问题记录 ${issueId} 不存在` }
  const note = closureNote.trim()
  if (!note) return { ok: false, reason: '关闭说明必填（为什么可以关：如回归评测已过、已人工处置）' }
  if (records[idx]!.status === 'closed') {
    return { ok: false, reason: `问题记录 ${issueId} 已关闭（${records[idx]!.closedAt ? new Date(records[idx]!.closedAt!).toLocaleString() : ''}），不重复关闭` }
  }
  const closed: SignalIssueRecord = {
    ...records[idx]!,
    status: 'closed',
    closureNote: note,
    closedBy,
    closedAt: Date.now(),
  }
  records[idx] = closed
  writeAll(records)
  return { ok: true, record: closed }
}
