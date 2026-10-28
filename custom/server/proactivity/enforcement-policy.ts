// overlay/proactivity 域：两轴执法策略存储（挂账清偿批 H4，2026-10-26）。
//
// per-profile 两轴策略（横轴 level + 目标契约 + 关联对齐台账 goalId），落
// ~/.hermes-web-ui/proactivity/policy.json（与 alignment.json 同目录，D6）。
// 消费方：toolpipeline/enforce-gate 第四级策略源（总闸 HERMES_PROACTIVITY_ENFORCE=1
// 且本存储有条目才执法——只收紧不放宽）。裁决本体复用 proactivity-model.assess()
// 单一事实源，本文件只做存储与事实装配（level/contract/goalStatus）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import type { GoalContract, ProblemDefinerLevel, AlignmentStatusName } from './proactivity-model'
import { PROBLEM_DEFINER_LEVELS } from './proactivity-model'
import { getAlignment, alignmentStatus, _useAlignmentDirForTests, _resetAlignmentDirForTests } from './goal-alignment'
import { atomicWriteJson } from '../lib/fs-store'

export interface ProactivityPolicyEntry {
  /** 配置对象：profile 名（对齐 ladder target 语义）。 */
  profile: string
  level: ProblemDefinerLevel
  contract?: GoalContract
  /** 关联长期目标（对齐台账 goalId；缺省=不参与漂移判定）。 */
  goalId?: string
  updatedAt: number
  updatedBy?: string
  note?: string
}

/** enforce-gate 消费面（goalStatus 已解析；纯数据无 IO）。 */
export interface ProactivityPolicyLite {
  level: ProblemDefinerLevel
  contract?: GoalContract
  goalStatus?: AlignmentStatusName
}

interface StoreShape { entries: ProactivityPolicyEntry[] }

function storeDir(): string {
  const env = process.env.HERMES_GOAL_ALIGNMENT_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'proactivity')
}

function storePath(): string {
  return join(storeDir(), 'policy.json')
}

function normalize(raw: unknown): ProactivityPolicyEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<ProactivityPolicyEntry>
  if (typeof e.profile !== 'string' || !e.profile.trim()) return null
  if (typeof e.level !== 'string' || !(PROBLEM_DEFINER_LEVELS as readonly string[]).includes(e.level)) return null
  const contract = e.contract as Partial<GoalContract> | undefined
  return {
    profile: e.profile.trim(),
    level: e.level as ProblemDefinerLevel,
    ...(contract && typeof contract.goalExplicit === 'boolean' && typeof contract.acceptanceCriteria === 'boolean'
      ? { contract: { goalExplicit: contract.goalExplicit, acceptanceCriteria: contract.acceptanceCriteria } }
      : {}),
    ...(typeof e.goalId === 'string' && e.goalId ? { goalId: e.goalId } : {}),
    updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : Date.now(),
    ...(typeof e.updatedBy === 'string' && e.updatedBy ? { updatedBy: e.updatedBy } : {}),
    ...(typeof e.note === 'string' && e.note ? { note: e.note } : {}),
  }
}

function load(): StoreShape {
  const file = storePath()
  if (!existsSync(file)) return { entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as StoreShape
    if (parsed && Array.isArray(parsed.entries)) {
      return { entries: parsed.entries.map(normalize).filter((e): e is ProactivityPolicyEntry => e !== null) }
    }
  } catch { /* 坏档：隔离留档再从空起步（域内先例） */ }
  try { renameSync(file, `${file}.corrupt-${Date.now()}`) } catch { /* 隔离失败不阻断 */ }
  return { entries: [] }
}

function save(s: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  atomicWriteJson(storePath(), s)
}

export function validatePolicyInput(v: {
  profile?: unknown
  level?: unknown
  contract?: unknown
  goalId?: unknown
}): string[] {
  const problems: string[] = []
  if (typeof v.profile !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(v.profile)) {
    problems.push('profile 须为 1-120 位安全字符（profile 名）')
  }
  if (typeof v.level !== 'string' || !(PROBLEM_DEFINER_LEVELS as readonly string[]).includes(v.level)) {
    problems.push(`level 须为 ${PROBLEM_DEFINER_LEVELS.join('/')}`)
  }
  if (v.contract !== undefined) {
    const c = v.contract as Record<string, unknown>
    if (typeof c.goalExplicit !== 'boolean' || typeof c.acceptanceCriteria !== 'boolean') {
      problems.push('contract 须含布尔 goalExplicit 与 acceptanceCriteria')
    }
  }
  if (v.goalId !== undefined && v.goalId !== '' && (typeof v.goalId !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(v.goalId))) {
    problems.push('goalId 须为 1-120 位安全字符或空')
  }
  return problems
}

export function listPolicies(): ProactivityPolicyEntry[] {
  return load().entries.slice().sort((a, b) => a.profile.localeCompare(b.profile))
}

export function getPolicy(profile: string): ProactivityPolicyEntry | null {
  return load().entries.find((e) => e.profile === profile) ?? null
}

export function upsertPolicy(input: Omit<ProactivityPolicyEntry, 'updatedAt'> & { updatedBy?: string }): ProactivityPolicyEntry {
  const problems = validatePolicyInput(input)
  if (problems.length > 0) throw new Error(problems.join('；'))
  const s = load()
  const entry: ProactivityPolicyEntry = {
    profile: input.profile,
    level: input.level,
    ...(input.contract ? { contract: input.contract } : {}),
    ...(input.goalId ? { goalId: input.goalId } : {}),
    updatedAt: Date.now(),
    ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
    ...(input.note ? { note: input.note } : {}),
  }
  const idx = s.entries.findIndex((e) => e.profile === input.profile)
  if (idx >= 0) s.entries[idx] = entry
  else s.entries.push(entry)
  save(s)
  return entry
}

export function removePolicy(profile: string): boolean {
  const s = load()
  const idx = s.entries.findIndex((e) => e.profile === profile)
  if (idx < 0) return false
  s.entries.splice(idx, 1)
  save(s)
  return true
}

/**
 * enforce-gate 消费面：解析策略条目为裁决事实（goalStatus 从对齐台账取，
 * 台账缺该目标=不参与漂移判定——fail-soft 不猜数）。内部异常 fail-open 返回 null
 * （缺配置不执法，不装已治理）。goalStatus 仅在 L4 有 goalId 且台账有条目时解析。
 */
export function proactivityPolicyForProfile(profile: string | undefined | null): ProactivityPolicyLite | null {
  if (!profile) return null
  try {
    const entry = getPolicy(profile)
    if (!entry) return null
    let goalStatus: AlignmentStatusName | undefined
    if (entry.level === 'L4' && entry.goalId) {
      const goal = getAlignment(entry.goalId)
      if (goal) goalStatus = alignmentStatus(goal).status
    }
    return { level: entry.level, ...(entry.contract ? { contract: entry.contract } : {}), ...(goalStatus ? { goalStatus } : {}) }
  } catch {
    return null
  }
}

/** 测试隔离（与 goal-alignment 同 env 同目录——D6）。 */
export { _useAlignmentDirForTests as _usePolicyDirForTests, _resetAlignmentDirForTests as _resetPolicyDirForTests }
