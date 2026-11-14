// overlay/proactivity 域：介入治理服务层（2026-11-03 主动式 AI 综述吸收轮）。
//
// 三件事：①注意力偏好落盘（人面预算/安静时段/冷却/退避）；②把 delivery 的主动建议
// 转成干预候选、过治理者、落台账（幂等：同话题 6h 内不重复入账）；③给控制器提供读数。
// 纯函数在 intervention-governor.ts / proactivity-scorecard.ts；本文件只做编排与 IO。
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import { readAllBoards } from '../delivery/boards-reader'
import { buildDigest } from '../delivery/digest'
import { inferBreakpoint, type BreakpointDecision } from './breakpoint-adapter'
import { resolveKanbanHome } from '../delivery/kanban-home'
import {
  DEFAULT_ATTENTION_PREFS,
  govern,
  normalizePrefs,
  type AttentionPrefs,
  type InterventionCandidate,
} from './intervention-governor'
import {
  appendFeedback,
  appendIntervention,
  calibration,
  historyItems,
  readLedger,
  recentInterventions,
  type InterventionRecord,
  type InterventionStore,
} from './intervention-ledger'
import { buildScorecard, type ProactivityScorecard } from './proactivity-scorecard'
import { mergeBenefit, previewSuggestions, type PreviewResult } from './anticipation-preview'

// ── 注意力偏好（单一事实源；与两轴策略同在 proactivity 目录）────

export { DEFAULT_ATTENTION_PREFS }

export function prefsFile(): string {
  const env = process.env.ATTENTION_PREFS_PATH?.trim()
  if (env) return resolve(env)
  const dir = process.env.HERMES_GOAL_ALIGNMENT_DIR?.trim()
  return dir ? join(resolve(dir), 'attention.json') : underWebUi('proactivity/attention.json')
}

export function readAttentionPrefs(): AttentionPrefs {
  const file = prefsFile()
  if (!existsSync(file)) return { ...DEFAULT_ATTENTION_PREFS }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AttentionPrefs>
    return normalizePrefs(raw)
  } catch {
    try {
      renameSync(file, `${file}.corrupt-${Date.now()}`)
    } catch {
      /* 隔离失败也不覆写 */
    }
    return { ...DEFAULT_ATTENTION_PREFS }
  }
}

export function validateAttentionPrefs(input: unknown): { valid: boolean; problems: string[]; prefs?: AttentionPrefs } {
  const problems: string[] = []
  if (!input || typeof input !== 'object') return { valid: false, problems: ['请求体必须是对象'] }
  const body = input as Record<string, unknown>
  const q = body.quietHours
  if (q != null) {
    if (typeof q !== 'object') problems.push('quietHours 必须是对象或 null')
    else {
      const { startHour, endHour } = q as Record<string, unknown>
      const okHour = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23
      if (!okHour(startHour) || !okHour(endHour)) problems.push('quietHours.startHour/endHour 必须是 0-23 的整数')
    }
  }
  const nums: Array<[string, number, number]> = [
    ['dailyBudget', 0, 200],
    ['hourlyBudget', 0, 50],
    ['cooldownMinutes', 0, 1440],
    ['rejectionBackoffHours', 0, 720],
  ]
  for (const [key, min, max] of nums) {
    const v = body[key]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) problems.push(`${key} 必须是 ${min}-${max} 的数值`)
  }
  if (body.minScore != null) {
    const v = body.minScore
    if (typeof v !== 'number' || !Number.isFinite(v) || v < -1 || v > 1) problems.push('minScore 必须是 -1..1 的数值')
  }
  if (problems.length) return { valid: false, problems }
  return { valid: true, problems: [], prefs: normalizePrefs(body as Partial<AttentionPrefs>) }
}

export function writeAttentionPrefs(prefs: AttentionPrefs): AttentionPrefs {
  const file = prefsFile()
  mkdirSync(dirname(file), { recursive: true })
  atomicWriteJson(file, prefs, { mode: 0o600 })
  return prefs
}

// ── 建议 → 干预候选 ─────

/** 建议类型 → 严重度/收益/成本（启发式；见 spec D5）。 */
const SUGGESTION_PROFILE: Record<string, { severity: 'info' | 'attention'; benefit: number; cost: number }> = {
  'unblock-blocked': { severity: 'attention', benefit: 0.7, cost: 0.25 },
  'review-aging': { severity: 'info', benefit: 0.45, cost: 0.1 },
  'nudge-stalled': { severity: 'attention', benefit: 0.6, cost: 0.25 },
}

/** 同话题幂等窗口：6h 内已入账的候选不再重复记录（避免每次 sync 都刷一遍台账）。 */
const INGEST_DEDUPE_MS = 6 * 3_600_000

export interface BreakpointSnapshot {
  available: boolean
  reason?: string
  decision: BreakpointDecision
  boards: number
}

/**
 * 从看板生命周期事件推断当前断点（2026-11-03 断点适配器）。
 * 看板根缺席 → available:false + 非断点；事件为空 → no_evidence + 非断点（不猜成断点去促成打扰）。
 */
export function resolveBreakpoint(nowMs: number = Date.now()): BreakpointSnapshot {
  const { home } = resolveKanbanHome()
  if (!home) {
    return {
      available: false,
      reason: '看板数据根缺席',
      boards: 0,
      decision: inferBreakpoint([], nowMs),
    }
  }
  const boards = readAllBoards(home)
  const events = boards.flatMap((b) => b.events.map((e) => ({ kind: e.kind, atSec: e.at })))
  return { available: true, boards: boards.length, decision: inferBreakpoint(events, nowMs) }
}

export interface SyncResult {
  available: boolean
  reason?: string
  created: number
  skipped: number
  byDecision: Record<string, number>
  records: InterventionRecord[]
  /** 本轮候选所依据的断点推断（2026-11-03）；调用方据此解释延后。 */
  breakpoint?: BreakpointDecision
  /** 反事实差值预演统计（2026-11-14 P2）：命中预演的候选数；0＝全走静态表。 */
  previewedCount?: number
}

/**
 * 从 delivery 建议同步干预：候选 → 治理裁决 → 落台账。
 * 看板根缺席时 available=false（fail-soft，不造数）。
 * previews（2026-11-14 P2）：controller 前置慢通道产出的预演快照（topicKey → act−abstain 差值）；
 * 缺席或不命中＝fail-open 回 SUGGESTION_PROFILE 静态表（D4：预演失败不得污染必达路径）。
 */
export function syncInterventions(
  nowMs: number = Date.now(),
  actor?: string,
  previews?: Map<string, PreviewResult>,
): SyncResult {
  const { home } = resolveKanbanHome()
  if (!home) return { available: false, reason: '看板数据根缺席', created: 0, skipped: 0, byDecision: {}, records: [] }
  const breakpoint = resolveBreakpoint(nowMs).decision
  const boards = readAllBoards(home)
  const digest = buildDigest(
    boards.map((b) => ({ slug: b.slug, available: b.available, tasks: b.tasks, events: b.events })),
    { nowSec: Math.floor(nowMs / 1000) },
  )
  const prefs = readAttentionPrefs()
  const store = readLedger()
  const history = historyItems(store)
  const recentTopics = new Map<string, number>()
  for (const e of store.entries) recentTopics.set(e.topicKey, Math.max(recentTopics.get(e.topicKey) ?? 0, e.decidedAtMs))

  const byDecision: Record<string, number> = {}
  const records: InterventionRecord[] = []
  let skipped = 0
  let previewedCount = 0
  for (const s of digest.suggestions) {
    const topicKey = `${s.kind}:${s.target}`
    const last = recentTopics.get(topicKey) ?? 0
    if (nowMs - last < INGEST_DEDUPE_MS) {
      skipped += 1
      continue
    }
    const profile = SUGGESTION_PROFILE[s.kind] ?? { severity: 'info' as const, benefit: 0.4, cost: 0.15 }
    const preview = previews?.get(topicKey)
    const merged = mergeBenefit(profile.benefit, preview)
    if (merged.source === 'preview') previewedCount += 1
    const candidate: InterventionCandidate = {
      id: `iv-${s.kind}-${s.target}-${nowMs.toString(36)}`,
      surface: 'suggestion',
      severity: profile.severity,
      audience: 'human',
      urgency: 'normal',
      topicKey,
      expectedBenefit: merged.benefit,
      attentionCost: profile.cost,
      // 断点由看板事件推断（p27 骑现成断点）：只有信息型干预会因非断点延后
      atBreakpoint: breakpoint.atBreakpoint,
      ...(breakpoint.nextBreakpointAtMs != null ? { nextBreakpointAtMs: breakpoint.nextBreakpointAtMs } : {}),
    }
    const verdict = govern({ nowMs, prefs, candidate, history })
    const rec: InterventionRecord = {
      id: candidate.id,
      surface: candidate.surface,
      severity: candidate.severity,
      audience: candidate.audience,
      urgency: candidate.urgency ?? 'normal',
      topicKey,
      summary: `${s.kind}：${s.note}`.slice(0, 200),
      benefit: candidate.expectedBenefit ?? 0,
      cost: candidate.attentionCost ?? 0,
      decision: verdict.decision,
      reasonCode: verdict.reasonCode,
      reasons: verdict.reasons,
      score: verdict.score,
      ...(verdict.nextWindowAtMs != null ? { nextWindowAtMs: verdict.nextWindowAtMs } : {}),
      decidedAtMs: nowMs,
      source: `delivery:${actor ?? 'sync'}`,
      benefitSource: merged.source,
      // 证据链（P5）：refs 锚定建议来源与断点依据；inference＝一句话触发推断；
      // uncertainty＝预演置信（无预演=medium：静态启发式的固有不确定档）。
      evidenceChain: {
        source: 'delivery-digest',
        refs: [`digest:${s.kind}/${s.target}`, ...(s.note ? [`note:${s.note.slice(0, 80)}`] : [])],
        inference: `看板摘要发现 ${s.kind} 建议（${s.note.slice(0, 60)}），断点推断=${breakpoint.atBreakpoint ? 'at-breakpoint' : 'not-at-breakpoint'}`,
        uncertainty: preview?.confidence ?? 'medium',
      },
      ...(merged.source === 'preview' && preview ? { previewExplanation: preview.explanation } : {}),
    }
    appendIntervention(rec)
    records.push(rec)
    byDecision[verdict.decision] = (byDecision[verdict.decision] ?? 0) + 1
  }
  return { available: true, created: records.length, skipped, byDecision, records, breakpoint, previewedCount }
}

/**
 * 带反事实差值预演的同步编排（P2 慢通道入口）：读建议 → 批量预演（上限/开关内）→
 * syncInterventions 快通道裁决（预演快照注入）。预演全失败/关闭＝空 Map＝纯静态表现状。
 * 快慢分离：本函数只在 REST sync 显式触发；clusterinspector 等既有调用方不受影响。
 */
export async function syncInterventionsWithPreview(nowMs: number = Date.now(), actor?: string): Promise<SyncResult> {
  const { home } = resolveKanbanHome()
  if (!home) return { available: false, reason: '看板数据根缺席', created: 0, skipped: 0, byDecision: {}, records: [] }
  const boards = readAllBoards(home)
  const digest = buildDigest(
    boards.map((b) => ({ slug: b.slug, available: b.available, tasks: b.tasks, events: b.events })),
    { nowSec: Math.floor(nowMs / 1000) },
  )
  const inputs = digest.suggestions.map((s) => ({
    topicKey: `${s.kind}:${s.target}`, kind: s.kind, target: s.target, note: s.note,
  }))
  const previews = await previewSuggestions(inputs)
  return syncInterventions(nowMs, actor, previews)
}

// ── 读数 ─────

export function listInterventions(status?: string, limit = 30) {
  const rows = recentInterventions(limit)
  if (!status || status === 'all') return rows
  if (status === 'pending') return rows.filter((r) => (r.decision === 'deliver' || r.decision === 'escalate') && !r.outcome)
  if (status === 'deferred') return rows.filter((r) => r.decision === 'defer' || r.decision === 'batch')
  return rows.filter((r) => r.decision === status || r.outcome === status)
}

export function feedback(input: { id: string; outcome: string; note?: string; by?: string }) {
  const outcome = String(input.outcome ?? '').trim()
  const allowed = ['accepted', 'rejected', 'ignored', 'modified', 'takeover', 'snoozed']
  if (!allowed.includes(outcome)) return { recorded: false as const, problems: [`outcome 必须是 ${allowed.join('/')}`] }
  return appendFeedback({
    interventionId: String(input.id ?? ''),
    outcome: outcome as (typeof allowed)[number] as never,
    at: Date.now(),
    ...(input.note ? { note: String(input.note).slice(0, 300) } : {}),
    ...(input.by ? { by: String(input.by) } : {}),
  })
}

export function scorecard(acceptedWithEffect = 0): ProactivityScorecard {
  const store: InterventionStore = readLedger()
  return buildScorecard({
    entries: store.entries.map((e) => ({
      id: e.id,
      surface: e.surface,
      severity: e.severity,
      audience: e.audience,
      decision: e.decision,
      reasonCode: e.reasonCode,
      score: e.score,
      decidedAtMs: e.decidedAtMs,
      topicKey: e.topicKey,
      ...(e.evidenceChain ? { evidenceChain: e.evidenceChain } : {}),
    })),
    outcomes: store.feedback.map((f) => ({ interventionId: f.interventionId, outcome: f.outcome, at: f.at })),
    acceptedWithEffect,
  })
}

export function calibrationOf() {
  return calibration(readLedger())
}
