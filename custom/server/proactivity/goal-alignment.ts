// overlay/proactivity 域：目标持续对齐台账（阿里技术《Personal Agent 落地思考》吸收轮 2026-10-26）。
//
// 文章 §2.2③/§6.1：周期越长目标越会漂（优先级变/上游决策变/想法变），Agent 拿着三周前的
// 理解一路往前推是长期主动最危险的失败方式——L4 想往上走，除初始目标外还需要持续对齐机制：
// 在关键节点重新确认「目标还是这个吗」。本文件=确认台账（append-only，每次确认留痕不覆盖）
// + 新鲜度判定（纯函数）+ 落盘（autonomy-ladder 同款原子写/坏档隔离先例）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { AlignmentStatusName } from './proactivity-model'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

export interface GoalConfirmation {
  at: number
  by?: string
  note?: string
}

export interface GoalAlignmentEntry {
  /** 稳定标识（如 milestone:xxx、profile:goal-yyy）。 */
  goalId: string
  /** 目标一句话（呈现面用，不承载验收规则全文）。 */
  goalSummary: string
  createdAt: number
  /** 确认台账：append-only，每次确认 push 一条（不覆盖历史——审批留痕先例）。 */
  confirmations: GoalConfirmation[]
  /** 目标契约（补丁 696：hermes /goal 创建时透传——completion contract=验收规则即 L4 升仓判据）。 */
  contract?: { goalExplicit: boolean; acceptanceCriteria: boolean }
}

export interface AlignmentPolicy {
  /** 距上次确认超过该天数=stale（文章「几周周期会漂」→周级再确认）。 */
  maxConfirmAgeDays: number
  /** 从未确认的宽限：新建目标=创建即对齐，宽限期内不算 never-confirmed 风险。 */
  neverConfirmedGraceDays: number
}

export const DEFAULT_ALIGNMENT_POLICY: AlignmentPolicy = { maxConfirmAgeDays: 7, neverConfirmedGraceDays: 1 }

const DAY_MS = 86_400_000

export interface AlignmentStatus {
  status: AlignmentStatusName
  lastConfirmedAt: number | null
  daysSinceConfirm: number | null
  reason: string
}

/** 新鲜度判定（纯函数，测试面）。 */
export function alignmentStatus(
  entry: GoalAlignmentEntry,
  now: number = Date.now(),
  policy: AlignmentPolicy = DEFAULT_ALIGNMENT_POLICY,
): AlignmentStatus {
  const last = entry.confirmations.length
    ? entry.confirmations[entry.confirmations.length - 1]!.at
    : null
  if (last === null) {
    const ageDays = (now - entry.createdAt) / DAY_MS
    if (ageDays > policy.neverConfirmedGraceDays) {
      return {
        status: 'never-confirmed',
        lastConfirmedAt: null,
        daysSinceConfirm: null,
        reason: `目标创建 ${ageDays.toFixed(1)} 天从未与人确认——先显式对齐再让 Agent 按它推进`,
      }
    }
    return { status: 'fresh', lastConfirmedAt: null, daysSinceConfirm: null, reason: '新建目标宽限期内（创建即对齐）' }
  }
  const days = (now - last) / DAY_MS
  if (days > policy.maxConfirmAgeDays) {
    return {
      status: 'stale',
      lastConfirmedAt: last,
      daysSinceConfirm: days,
      reason: `距上次确认 ${days.toFixed(1)} 天（>${policy.maxConfirmAgeDays}）——目标可能已漂移，重新确认后再推进`,
    }
  }
  return { status: 'fresh', lastConfirmedAt: last, daysSinceConfirm: days, reason: `距上次确认 ${days.toFixed(1)} 天，在再确认周期内` }
}

// ── 校验 ─────────────────────────────────────────────────────────────

const GOAL_ID_RE = /^[A-Za-z0-9._:-]{1,120}$/
export const GOAL_SUMMARY_MAX = 200
export const CONFIRM_NOTE_MAX = 200

export function validateGoalInput(v: { goalId?: unknown; goalSummary?: unknown }): string[] {
  const problems: string[] = []
  if (typeof v.goalId !== 'string' || !GOAL_ID_RE.test(v.goalId)) {
    problems.push('goalId 须为 1-120 位安全字符（如 milestone:xxx）')
  }
  if (typeof v.goalSummary !== 'string' || !v.goalSummary.trim() || v.goalSummary.length > GOAL_SUMMARY_MAX) {
    problems.push(`goalSummary 须为 1-${GOAL_SUMMARY_MAX} 字非空文本`)
  }
  return problems
}

// ── 存储（autonomy-ladder 同款：原子写 + 坏档隔离 + env 覆盖）──────────

interface StoreShape { entries: GoalAlignmentEntry[] }

function storeDir(): string {
  const env = process.env.HERMES_GOAL_ALIGNMENT_DIR?.trim()
  if (env) return resolve(env)
  return underWebUi('proactivity')
}

function storePath(): string {
  return join(storeDir(), 'alignment.json')
}

function normalize(raw: unknown): GoalAlignmentEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<GoalAlignmentEntry>
  if (typeof e.goalId !== 'string' || !GOAL_ID_RE.test(e.goalId)) return null
  const confirmations = Array.isArray(e.confirmations)
    ? e.confirmations.filter(
        (c): c is GoalConfirmation =>
          !!c && typeof c === 'object' && typeof (c as GoalConfirmation).at === 'number',
      )
    : []
  const contract = e.contract as Partial<{ goalExplicit: unknown; acceptanceCriteria: unknown }> | undefined
  return {
    goalId: e.goalId,
    goalSummary: typeof e.goalSummary === 'string' ? e.goalSummary : '',
    createdAt: typeof e.createdAt === 'number' ? e.createdAt : Date.now(),
    confirmations,
    ...(contract && typeof contract.goalExplicit === 'boolean' && typeof contract.acceptanceCriteria === 'boolean'
      ? { contract: { goalExplicit: contract.goalExplicit, acceptanceCriteria: contract.acceptanceCriteria } }
      : {}),
  }
}

function load(): StoreShape {
  const file = storePath()
  if (!existsSync(file)) return { entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as StoreShape
    if (parsed && Array.isArray(parsed.entries)) {
      return { entries: parsed.entries.map(normalize).filter((e): e is GoalAlignmentEntry => e !== null) }
    }
  } catch { /* 坏档：隔离留档再从空起步（对齐 autonomy-ladder 先例） */ }
  try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* 隔离失败不阻断 */ }
  return { entries: [] }
}

function save(s: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(storePath(), s)
}

export function listAlignments(): GoalAlignmentEntry[] {
  return load().entries.slice().sort((a, b) => a.goalId.localeCompare(b.goalId))
}

export function getAlignment(goalId: string): GoalAlignmentEntry | null {
  return load().entries.find((e) => e.goalId === goalId) ?? null
}

/** 新建或改写目标摘要（确认台账保留不动；createdAt 只在新建时落）。govbus 事件由控制器层发。 */
export function upsertAlignment(input: { goalId: string; goalSummary: string }): GoalAlignmentEntry {
  const problems = validateGoalInput(input)
  if (problems.length > 0) throw new Error(problems.join('；'))
  const s = load()
  const existing = s.entries.find((e) => e.goalId === input.goalId)
  if (existing) {
    existing.goalSummary = input.goalSummary.trim()
    save(s)
    return existing
  }
  const entry: GoalAlignmentEntry = {
    goalId: input.goalId,
    goalSummary: input.goalSummary.trim(),
    createdAt: Date.now(),
    confirmations: [],
  }
  s.entries.push(entry)
  save(s)
  return entry
}

/** 记一次目标确认（append-only；漂移防线的「重新确认」动作）。 */
export function confirmAlignment(
  goalId: string,
  info: { by?: string; note?: string } = {},
): GoalAlignmentEntry | null {
  const s = load()
  const entry = s.entries.find((e) => e.goalId === goalId)
  if (!entry) return null
  const confirmation: GoalConfirmation = {
    at: Date.now(),
    ...(info.by ? { by: info.by } : {}),
    ...(info.note && info.note.trim() ? { note: info.note.trim().slice(0, CONFIRM_NOTE_MAX) } : {}),
  }
  entry.confirmations.push(confirmation)
  save(s)
  return entry
}

export function removeAlignment(goalId: string): boolean {
  const s = load()
  const idx = s.entries.findIndex((e) => e.goalId === goalId)
  if (idx < 0) return false
  s.entries.splice(idx, 1)
  save(s)
  return true
}

/** 测试隔离。 */
export function _useAlignmentDirForTests(dir: string): void {
  process.env.HERMES_GOAL_ALIGNMENT_DIR = dir
}

export function _resetAlignmentDirForTests(): void {
  delete process.env.HERMES_GOAL_ALIGNMENT_DIR
}
