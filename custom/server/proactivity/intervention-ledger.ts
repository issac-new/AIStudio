// overlay/proactivity 域：介入台账与校准读数（2026-11-03 主动式 AI 综述吸收轮）。
//
// 综述第 4 命题：接受/拒绝/忽略/修改/接管都是反馈，但含义要结合上下文解释；只奖励「用户接受了」
// 会训练出更能说但更没用的系统。因此本台账把「决策」与「反馈」分成两个 append-only 事件面：
//   - 决策由治理者产生（deliver/defer/batch/suppress/escalate），永不改写；
//   - 反馈用户在事后追加（accepted/rejected/ignored/modified/takeover/snoozed），追加不改历史。
// 校准读数只做「呈报与建议」，不自动改用户显式偏好（spec D7：控制感优先）。
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import type {
  GovernorReasonCode,
  InterventionAudience,
  InterventionDecision,
  InterventionOutcome,
  InterventionSeverity,
  InterventionSurface,
  InterventionUrgency,
} from './intervention-governor'

export interface InterventionRecord {
  id: string
  surface: InterventionSurface
  severity: InterventionSeverity
  audience: InterventionAudience
  urgency: InterventionUrgency
  topicKey: string
  /** 摘要（呈现面用；不承载长正文）。 */
  summary: string
  benefit: number
  cost: number
  decision: InterventionDecision
  reasonCode: GovernorReasonCode
  reasons: string[]
  score: number
  nextWindowAtMs?: number
  decidedAtMs: number
  /** 来源标识（如 delivery-suggestion / manual），便于回溯谁发起的候选。 */
  source?: string
}

export interface InterventionFeedback {
  interventionId: string
  outcome: InterventionOutcome
  at: number
  by?: string
  note?: string
}

export interface InterventionStore {
  version: 1
  entries: InterventionRecord[]
  feedback: InterventionFeedback[]
}

const MAX_ENTRIES = 500
const MAX_FEEDBACK = 1000

export function storeFile(): string {
  const env = process.env.INTERVENTION_LEDGER_PATH?.trim()
  if (env) return resolve(env)
  const dir = process.env.HERMES_GOAL_ALIGNMENT_DIR?.trim()
  return dir ? join(resolve(dir), 'interventions.json') : underWebUi('proactivity/interventions.json')
}

function emptyStore(): InterventionStore {
  return { version: 1, entries: [], feedback: [] }
}

function sanitize(raw: unknown): InterventionStore {
  const obj = (raw ?? {}) as Partial<InterventionStore>
  return {
    version: 1,
    entries: Array.isArray(obj.entries) ? (obj.entries as InterventionRecord[]) : [],
    feedback: Array.isArray(obj.feedback) ? (obj.feedback as InterventionFeedback[]) : [],
  }
}

/** 读台账：坏档改名隔离（`.corrupt-<ts>`）后按空库继续，绝不静默覆写。 */
export function readLedger(): InterventionStore {
  const file = storeFile()
  if (!existsSync(file)) return emptyStore()
  try {
    return sanitize(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    try {
      renameSync(file, `${file}.corrupt-${Date.now()}`)
    } catch {
      /* 隔离失败也不覆写 */
    }
    return emptyStore()
  }
}

function writeLedger(store: InterventionStore): void {
  const file = storeFile()
  mkdirSync(dirname(file), { recursive: true })
  atomicWriteJson(file, store, { mode: 0o600 })
}

/** 追加决策记录（环形上限；超限丢最旧，保留最近 500 条）。 */
export function appendIntervention(rec: InterventionRecord): InterventionStore {
  const store = readLedger()
  store.entries.push(rec)
  if (store.entries.length > MAX_ENTRIES) store.entries = store.entries.slice(-MAX_ENTRIES)
  writeLedger(store)
  return store
}

/** 追加反馈（不改写决策；同一条可多次追加，以最后一次为准）。 */
export function appendFeedback(fb: InterventionFeedback): { ok: boolean; problems: string[]; store?: InterventionStore } {
  const store = readLedger()
  if (!store.entries.some((e) => e.id === fb.interventionId)) {
    return { ok: false, problems: [`未知干预：${fb.interventionId}`] }
  }
  store.feedback.push(fb)
  if (store.feedback.length > MAX_FEEDBACK) store.feedback = store.feedback.slice(-MAX_FEEDBACK)
  writeLedger(store)
  return { ok: true, problems: [], store }
}

/** 决策 → 治理者历史项（供 govern() 消费；outcome 取该条最后一次反馈）。 */
export function historyItems(store: InterventionStore = readLedger(), windowMs = 48 * 3_600_000) {
  const now = Date.now()
  const latest = new Map<string, InterventionFeedback>()
  for (const fb of store.feedback) latest.set(fb.interventionId, fb)
  return store.entries
    .filter((e) => now - e.decidedAtMs <= windowMs)
    .map((e) => ({
      id: e.id,
      surface: e.surface,
      severity: e.severity,
      audience: e.audience,
      topicKey: e.topicKey,
      decidedAtMs: e.decidedAtMs,
      decision: e.decision,
      outcome: (latest.get(e.id)?.outcome ?? null) as InterventionOutcome | null,
    }))
}

export interface SurfaceCalibration {
  surface: InterventionSurface
  decided: number
  delivered: number
  accepted: number
  rejected: number
  ignored: number
  modified: number
  takeover: number
  snoozed: number
  /** 已反馈条数（分母：反馈率本身也是读数）。 */
  withFeedback: number
  acceptanceRate: number | null
  ignoreRate: number | null
  /** 平均反馈延迟（小时）；无反馈为 null。 */
  avgFeedbackHours: number | null
  /** 建议退避小时数（拒绝占比越高越久；无样本回 null，不猜）。 */
  suggestedBackoffHours: number | null
}

function rate(n: number, d: number): number | null {
  return d > 0 ? Number((n / d).toFixed(4)) : null
}

/** 校准读数（按面；纯派生，不写盘）。 */
export function calibration(store: InterventionStore = readLedger()): SurfaceCalibration[] {
  const latest = new Map<string, InterventionFeedback>()
  for (const fb of store.feedback) latest.set(fb.interventionId, fb)
  const surfaces = [...new Set(store.entries.map((e) => e.surface))]
  return surfaces
    .sort()
    .map((surface) => {
      const rows = store.entries.filter((e) => e.surface === surface)
      const delivered = rows.filter((e) => e.decision === 'deliver' || e.decision === 'escalate')
      const fbs = delivered
        .map((e) => latest.get(e.id))
        .filter((f): f is InterventionFeedback => !!f)
      const count = (o: InterventionOutcome) => fbs.filter((f) => f.outcome === o).length
      const withFeedback = fbs.length
      const accepted = count('accepted')
      const rejected = count('rejected')
      const latencies = delivered
        .map((e) => {
          const f = latest.get(e.id)
          return f ? (f.at - e.decidedAtMs) / 3_600_000 : null
        })
        .filter((x): x is number => x != null && x >= 0)
      const rejectionRate = withFeedback > 0 ? rejected / withFeedback : null
      return {
        surface,
        decided: rows.length,
        delivered: delivered.length,
        accepted,
        rejected,
        ignored: count('ignored'),
        modified: count('modified'),
        takeover: count('takeover'),
        snoozed: count('snoozed'),
        withFeedback,
        acceptanceRate: rate(accepted, withFeedback),
        ignoreRate: rate(count('ignored'), withFeedback),
        avgFeedbackHours: latencies.length ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)) : null,
        suggestedBackoffHours:
          rejectionRate == null || withFeedback < 4 ? null : Math.round(Math.min(72, 12 * (1 + 2 * rejectionRate))),
      }
    })
}

/** 最近决策（呈现面用；按时间倒序）。 */
export function recentInterventions(limit = 30, store: InterventionStore = readLedger()) {
  const latest = new Map<string, InterventionFeedback>()
  for (const fb of store.feedback) latest.set(fb.interventionId, fb)
  return [...store.entries]
    .sort((a, b) => b.decidedAtMs - a.decidedAtMs)
    .slice(0, Math.max(1, Math.min(200, limit)))
    .map((e) => ({ ...e, outcome: latest.get(e.id)?.outcome ?? null, feedbackAt: latest.get(e.id)?.at ?? null }))
}

/** 测试钩子：清空台账（仅测试用，生产不导出到控制器）。 */
export function _resetLedgerForTests(): void {
  writeLedger(emptyStore())
}
