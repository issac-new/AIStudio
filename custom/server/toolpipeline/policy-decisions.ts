// overlay/toolpipeline 域：执法放行决策账（2026-10-18 P0-2）。
//
// 背景：enforce-gate 的拒绝走 govbus security/high，放行却只返回 verdict——
// 事故复盘能回答“拦了什么”，回答不了“为什么放行”。源文《90% 的 Agent 止步于
// Demo》04 节要求“不管通过还是失败都留记录”。
//
// 形态选择：独立 JSONL，不进 govbus。执法门每次工具调用都会裁决，写 govbus
// （CAP 2000）会冲掉真正的安全事件；独立账本可查询、可按天轮转、可聚合。
// 只记结论与规则，不记参数原值。fail-soft：写失败不阻断工具执行，计数可见。
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export interface PolicyDecisionEntry {
  ts: number
  tool: string
  userId?: string
  profileId?: string
  sessionId?: string
  runId?: string
  /** 是否处于执法态（未开总闸/无配置的放行不落账）。 */
  enforcing: boolean
  allow: boolean
  rule: string
  /** 声明式策略规则 id（policy-* 裁决时写入；回答「当时生效的是哪条策略」）。 */
  policyRuleId?: string
  risk?: 'low' | 'medium' | 'high'
  /** 拒绝原因摘要（≤200 字符）。 */
  reason?: string
}

const DAY_CAP = 5000
const RETAIN_DAYS = 14
let writeFailures = 0

export function policyDecisionDir(): string {
  const env = process.env.POLICY_DECISION_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'tool-policy-decisions')
}

function dayStamp(ms = Date.now()): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function decisionFile(ms = Date.now()): string {
  return join(policyDecisionDir(), `policy-decisions-${dayStamp(ms)}.jsonl`)
}

function prune(now = Date.now()): void {
  try {
    const dir = policyDecisionDir()
    if (!existsSync(dir)) return
    const cutoff = now - RETAIN_DAYS * 86_400_000
    for (const name of readdirSync(dir)) {
      const m = name.match(/^policy-decisions-(\d{4})-(\d{2})-(\d{2})\.jsonl$/)
      if (!m) continue
      const at = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
      if (Number.isFinite(at) && at < cutoff) {
        try { unlinkSync(join(dir, name)) } catch { /* 单文件失败跳过 */ }
      }
    }
  } catch { /* 清理失败不阻断 */ }
}

function capDayFile(file: string): void {
  try {
    if (!existsSync(file)) return
    // 粗估：平均行 ~180B；超过 2× 上限才精确计数，避免每次裁决全读
    if (statSync(file).size < DAY_CAP * 180 * 2) return
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (lines.length <= DAY_CAP) return
    const keep = lines.slice(lines.length - DAY_CAP)
    // 覆盖写当日文件：保留尾部 DAY_CAP 行（裁决账允许丢最旧行，不允许整文件无限增长）
    writeFileSync(file, keep.join('\n') + '\n', { mode: 0o600 })
  } catch { /* 裁剪失败继续追加 */ }
}

/** 追加一条执法决策（fail-soft）。测试环境未显式指定目录时不写（避免污染真实 home）。 */
export function appendPolicyDecision(entry: Omit<PolicyDecisionEntry, 'ts'> & { ts?: number }): void {
  if (process.env.NODE_ENV === 'test' && !process.env.POLICY_DECISION_DIR) return
  try {
    mkdirSync(policyDecisionDir(), { recursive: true, mode: 0o700 })
    const file = decisionFile(entry.ts ?? Date.now())
    const full: PolicyDecisionEntry = { ts: entry.ts ?? Date.now(), ...entry }
    appendFileSync(file, JSON.stringify(full) + '\n', { mode: 0o600 })
    if (Math.random() < 1 / 200) prune()
    capDayFile(file)
  } catch {
    writeFailures += 1
  }
}

export interface PolicyDecisionQuery {
  days?: number
  limit?: number
  tool?: string
  userId?: string
  sessionId?: string
  runId?: string
  outcome?: 'allow' | 'deny'
}

export interface PolicyDecisionQueryResult {
  entries: PolicyDecisionEntry[]
  total: number
  byRule: Array<{ rule: string; count: number; denied: number }>
  byOutcome: { allow: number; deny: number }
  writeFailures: number
  windowDays: number
}

export function queryPolicyDecisions(query: PolicyDecisionQuery = {}, now = Date.now()): PolicyDecisionQueryResult {
  const days = Math.min(90, Math.max(1, Math.round(query.days ?? 7)))
  const limit = Math.min(5_000, Math.max(1, Math.round(query.limit ?? 200)))
  const cutoff = now - days * 86_400_000
  const cutoffDay = dayStamp(cutoff)
  const all: PolicyDecisionEntry[] = []
  try {
    const dir = policyDecisionDir()
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        if (!/^policy-decisions-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue
        if (name.slice(17, 27) < cutoffDay) continue
        try {
          for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
            if (!line) continue
            try {
              const entry = JSON.parse(line) as PolicyDecisionEntry
              if (typeof entry?.ts === 'number' && entry.ts >= cutoff) all.push(entry)
            } catch { /* 坏行跳过 */ }
          }
        } catch { /* 单文件失败跳过 */ }
      }
    }
  } catch { /* 目录不可读按空账 */ }

  const filtered = all.filter((e) => {
    if (query.tool && e.tool !== query.tool) return false
    if (query.userId && e.userId !== query.userId) return false
    if (query.sessionId && e.sessionId !== query.sessionId) return false
    if (query.runId && e.runId !== query.runId) return false
    if (query.outcome === 'allow' && !e.allow) return false
    if (query.outcome === 'deny' && e.allow) return false
    return true
  })

  const byRule = new Map<string, { count: number; denied: number }>()
  const byOutcome = { allow: 0, deny: 0 }
  for (const e of filtered) {
    const b = byRule.get(e.rule) ?? { count: 0, denied: 0 }
    b.count += 1
    if (!e.allow) b.denied += 1
    byRule.set(e.rule, b)
    byOutcome[e.allow ? 'allow' : 'deny'] += 1
  }

  filtered.sort((a, b) => b.ts - a.ts)
  return {
    entries: filtered.slice(0, limit),
    total: filtered.length,
    byRule: [...byRule.entries()]
      .map(([rule, b]) => ({ rule, count: b.count, denied: b.denied }))
      .sort((a, b) => b.count - a.count),
    byOutcome,
    writeFailures,
    windowDays: days,
  }
}

export function policyDecisionWriteFailures(): number {
  return writeFailures
}

/** 测试隔离。 */
export function _usePolicyDecisionDirForTests(dir: string): void {
  process.env.POLICY_DECISION_DIR = dir
}
