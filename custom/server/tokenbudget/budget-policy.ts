// overlay/tokenbudget 域：预算策略与事前阻断（2026-10-18 残余项⑤）。
//
// 源文《90% 的 Agent 止步于 Demo》第 08 节：按用户/部门统计成本，超预算切换
// 低成本模型或阻断。现状已有 token 计量与运行清单，但没有“阈值 → 动作”。
//
// 形态：
// - 策略文件（JSON）：`{policies: [{userId?|profileId?, dailyUsd, action}]}`；
//   用户级策略优先于 profile 级。
// - 支出：当日 run manifest + trace 估价（60s 缓存）；未定价模型计入 missingPricedRuns。
// - 动作：warn 只提示；downgrade 返回建议（模型切换属上游路由，裁决层不改模型）；
//   block 在 `HERMES_BUDGET_ENFORCE=1` 时由执法门拒绝工具调用。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { queryRunManifests, runCostFromTrace } from '../runmanifest/run-manifest'

export type BudgetAction = 'warn' | 'downgrade' | 'block'

export interface BudgetPolicy {
  /** 用户级（优先）。 */
  userId?: string
  /** profile 级（用户级缺失时生效）。 */
  profileId?: string
  dailyUsd: number
  action: BudgetAction
}

interface PolicyFile { version: 1; policies: BudgetPolicy[] }

export interface BudgetStatus {
  userId?: string
  profileId?: string
  policy: BudgetPolicy | null
  day: string
  spentUsd: number
  limitUsd: number | null
  ratio: number | null
  /** allow=未超限；warn/downgrade/block=策略动作。 */
  action: 'allow' | BudgetAction
  runs: number
  missingPricedRuns: number
  enforce: boolean
  note: string
}

function policyPath(): string {
  const env = process.env.BUDGET_POLICY_FILE?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes-web-ui', 'budget-policies.json')
}

function readPolicies(): BudgetPolicy[] {
  try {
    if (!existsSync(policyPath())) return []
    const parsed = JSON.parse(readFileSync(policyPath(), 'utf8')) as Partial<PolicyFile>
    return Array.isArray(parsed.policies) ? parsed.policies.filter(isPolicy) : []
  } catch {
    return []
  }
}

function isPolicy(v: unknown): v is BudgetPolicy {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (typeof p.userId === 'string' || typeof p.profileId === 'string')
    && typeof p.dailyUsd === 'number' && p.dailyUsd >= 0
    && (p.action === 'warn' || p.action === 'downgrade' || p.action === 'block')
}

function writePolicies(policies: BudgetPolicy[]): void {
  const file = policyPath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify({ version: 1, policies } satisfies PolicyFile, null, 2), 'utf8')
  renameSync(tmp, file)
}

export function listBudgetPolicies(): BudgetPolicy[] {
  return readPolicies()
}

/** 设置/覆盖策略（userId 优先匹配，profileId 次之；同键覆盖）。 */
export function setBudgetPolicy(policy: BudgetPolicy): BudgetPolicy {
  if (!isPolicy(policy)) throw new Error('策略须含 userId 或 profileId、dailyUsd≥0、action=warn|downgrade|block')
  const policies = readPolicies().filter((p) => {
    if (policy.userId) return p.userId !== policy.userId
    return p.profileId !== policy.profileId || !!p.userId
  })
  policies.push(policy)
  writePolicies(policies)
  return policy
}

export function removeBudgetPolicy(input: { userId?: string; profileId?: string }): boolean {
  const before = readPolicies()
  const after = before.filter((p) => {
    if (input.userId) return p.userId !== input.userId
    if (input.profileId) return p.profileId !== input.profileId
    return true
  })
  if (after.length === before.length) return false
  writePolicies(after)
  return true
}

export function resolveBudgetPolicy(userId?: string, profileId?: string): BudgetPolicy | null {
  const policies = readPolicies()
  if (userId) {
    const byUser = policies.find((p) => p.userId === userId)
    if (byUser) return byUser
  }
  if (profileId) return policies.find((p) => !p.userId && p.profileId === profileId) ?? null
  return null
}

function dayStamp(now = Date.now()): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface SpendCache { at: number; key: string; spentUsd: number; runs: number; missingPricedRuns: number }
let spendCache: SpendCache | null = null
const SPEND_TTL_MS = 60_000

/** 当日支出（run manifest + trace 估价，60s 缓存）。 */
export function todaySpend(userId?: string, profileId?: string, now = Date.now()): { spentUsd: number; runs: number; missingPricedRuns: number } {
  const key = `${userId ?? ''}|${profileId ?? ''}`
  if (spendCache && spendCache.key === key && now - spendCache.at < SPEND_TTL_MS) {
    return { spentUsd: spendCache.spentUsd, runs: spendCache.runs, missingPricedRuns: spendCache.missingPricedRuns }
  }
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const manifests = queryRunManifests({ days: 2, limit: 1_000 }).entries
    .filter((m) => m.startedAt >= dayStart.getTime())
    .filter((m) => (userId ? m.userId === userId : true))
    .filter((m) => (profileId ? m.profileId === profileId : true))
  let spentUsd = 0
  let missingPricedRuns = 0
  for (const m of manifests) {
    const cost = runCostFromTrace(m)
    if (cost.costIdleUsd == null) missingPricedRuns += 1
    else spentUsd += cost.costIdleUsd
  }
  const result = { spentUsd: Math.round(spentUsd * 10000) / 10000, runs: manifests.length, missingPricedRuns }
  spendCache = { at: now, key, ...result }
  return result
}

/** 纯判定：支出是否达到限额，以及超限时的策略动作。 */
export function evaluateBudget(spendUsd: number, limitUsd: number | null, action: BudgetAction): { exceeded: boolean; action: 'allow' | BudgetAction } {
  const exceeded = limitUsd != null && spendUsd >= limitUsd
  return { exceeded, action: exceeded ? action : 'allow' }
}

export function budgetStatus(input: { userId?: string; profileId?: string; now?: number }): BudgetStatus {
  const now = input.now ?? Date.now()
  const policy = resolveBudgetPolicy(input.userId, input.profileId)
  const spend = todaySpend(input.userId, input.profileId, now)
  const limitUsd = policy?.dailyUsd ?? null
  const ratio = limitUsd != null && limitUsd > 0 ? Math.round((spend.spentUsd / limitUsd) * 10000) / 10000 : null
  const decision = policy ? evaluateBudget(spend.spentUsd, limitUsd, policy.action) : { exceeded: false, action: 'allow' as const }
  const exceeded = decision.exceeded
  return {
    userId: input.userId,
    profileId: input.profileId,
    policy,
    day: dayStamp(now),
    spentUsd: spend.spentUsd,
    limitUsd,
    ratio,
    action: decision.action,
    runs: spend.runs,
    missingPricedRuns: spend.missingPricedRuns,
    enforce: process.env.HERMES_BUDGET_ENFORCE === '1',
    note: policy
      ? exceeded
        ? `当日支出 ${spend.spentUsd} USD 已达/超过限额 ${limitUsd} USD，策略动作 ${policy.action}`
        : `当日支出 ${spend.spentUsd} USD，限额 ${limitUsd} USD`
      : '未配置预算策略（只观测，不阻断）',
  }
}

/** 执法门消费：仅当显式开启且策略动作为 block 时返回 true。 */
export function budgetBlocked(input: { userId?: string; profileId?: string }): boolean {
  if (process.env.HERMES_BUDGET_ENFORCE !== '1') return false
  const status = budgetStatus(input)
  return status.action === 'block'
}

export function _resetBudgetCacheForTests(): void {
  spendCache = null
}
