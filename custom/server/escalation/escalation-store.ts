// overlay/escalation 域：agent→coordinator 权限升级协议（routa §七#7 吸收，矩阵 §3.6 P1）。
//
// routa 语义（agent-tools.ts:1421-1559 + permission-store.ts:34-78）：
// - agent 运行中发现"这事我没权限"→ 发升级请求（requestPermission）：
//   请求的 scope（想干什么）+ **urgency 三档**（normal|urgent|critical）；
// - coordinator（人）批/拒（respondToPermission）；**批准可附带沙箱约束**
//   （沙箱约束并实时改写策略——"批准即学习"家族，联动 402 审批域规则）；
// - listPendingPermissions：待决队列可见。
//
// 与 402 审批域关系：402 是工具调用前的判定（allow/deny/ask 规则求值），本域是
// agent 主动发起的**权限申请**（运行中升级）。批准带 constraints 时联动 402 规则
// （addRule），实现 routa "批准可附带沙箱约束并实时改写策略"。
// 存储：每升级请求一份 JSON（幂等 escalationId），HERMES_ESCALATION_DIR 降级同款。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { createHash } from 'crypto'

export const ESCALATION_URGENCIES = ['normal', 'urgent', 'critical'] as const
export type EscalationUrgency = (typeof ESCALATION_URGENCIES)[number]

export interface EscalationRequest {
  escalationId: string
  /** 发起 agent（member|agent 收件人同款 polymorphic 简化为 agent id）。 */
  fromAgent: string
  /** 想申请的权限 scope（工具名/argv 前缀——与 402 ScopeCandidate 同形）。 */
  scope: { tool: string; argvPrefix?: string }
  urgency: EscalationUrgency
  /** 为什么需要（routa requestPermission 带 reason）。 */
  reason: string
  taskId?: string
  at: number
  state: 'pending' | 'approved' | 'denied'
  decision?: {
    by: string
    at: number
    note?: string
    /** 批准附带的沙箱约束（批准即学习：联动 402 规则）。 */
    sandboxConstraints?: Array<{ tool: string; argvPrefix?: string; list: 'allow' | 'deny' | 'ask' }>
  }
  /**
   * 机制归因（甲2，2026-09-30 调研落地）：裁决后结案时回答"为什么原有机制没提前
   * 处理它"——责任人缺的是信息/权限/能力/资源/反馈哪一样（文章第四节五问词表化）。
   * gap=none 表示机制本就无需提前处理（一次性正常升级）。
   */
  attribution?: {
    gap: MechanismGap
    note?: string
    by: string
    at: number
  }
}

/** 机制归因词表（五流对齐：缺信息/缺权限/缺能力/缺资源/缺反馈 + 无断点）。 */
export const MECHANISM_GAPS = ['information', 'authority', 'capability', 'resource', 'feedback', 'none'] as const
export type MechanismGap = (typeof MECHANISM_GAPS)[number]

export function isMechanismGap(v: unknown): v is MechanismGap {
  return typeof v === 'string' && (MECHANISM_GAPS as readonly string[]).includes(v)
}

/** 归因闸（enforce 模式）：同 (fromAgent, scope.tool) 有已裁决未归因的升级时拒新。 */
export class AttributionGateError extends Error {
  constructor(public blockedBy: string) {
    super(`前次升级 ${blockedBy} 已裁决但未做机制归因——先补归因再发起新升级（GOVERNANCE_ATTRIBUTION_ENFORCE）`)
    this.name = 'AttributionGateError'
  }
}

const MAX_REQUESTS = 200

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.esc-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function escalationDir(): string {
  const env = process.env.HERMES_ESCALATION_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.escalation')
  return join(homedir(), '.hermes-web-ui', 'escalation')
}

export function isEscalationUrgency(v: unknown): v is EscalationUrgency {
  return typeof v === 'string' && (ESCALATION_URGENCIES as readonly string[]).includes(v)
}

function escFile(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]/g, '_')
  // 清洗改写过 id 时必须带原 id 摘要后缀：否则 a/b 与 a_b 落同一文件，后写覆写先写
  // （幂等检查靠 raw.escalationId 区分不命中即覆写=丢已存在条目，含已裁决记录）
  const suffix = safe === id ? '' : `-${createHash('sha1').update(id).digest('hex').slice(0, 8)}`
  return join(escalationDir(), `${safe}${suffix}.json`)
}

export function loadEscalation(id: string): EscalationRequest | null {
  try {
    const raw = JSON.parse(readFileSync(escFile(id), 'utf8'))
    if (raw && raw.escalationId === id) return raw as EscalationRequest
  } catch { /* 坏/无文件 fail-soft */ }
  return null
}

function save(req: EscalationRequest): void {
  mkdirSync(escalationDir(), { recursive: true })
  // tmp+rename 原子写：裸 writeFileSync 半写会产出坏 JSON，被 loadEscalation 的
  // fail-soft 吞掉=该升级无声离开 pending 队列
  const file = escFile(req.escalationId)
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(req, null, 2))
  renameSync(tmp, file)
}

/** 发起升级（幂等 escalationId）。enforce 模式下同 scope 有未归因前科即拒（甲2 复发纪律）。 */
export function requestEscalation(req: Omit<EscalationRequest, 'at' | 'state'> & { at?: number }): EscalationRequest {
  const existing = loadEscalation(req.escalationId)
  if (existing) return existing
  if (process.env.GOVERNANCE_ATTRIBUTION_ENFORCE === '1') {
    const blocker = listDecided().find(
      (e) => e.fromAgent === req.fromAgent && e.scope.tool === req.scope.tool && !e.attribution,
    )
    if (blocker) throw new AttributionGateError(blocker.escalationId)
  }
  const full: EscalationRequest = { ...req, at: req.at ?? Date.now(), state: 'pending' }
  save(full)
  return full
}

/** 待决队列（routa listPendingPermissions 语义）；urgency 高在前。 */
const URGENCY_RANK: Record<EscalationUrgency, number> = { critical: 0, urgent: 1, normal: 2 }

export function listPending(): EscalationRequest[] {
  const out: EscalationRequest[] = []
  try {
    if (!existsSync(escalationDir())) return out
    const { readdirSync } = require('fs') as typeof import('fs')
    for (const f of readdirSync(escalationDir())) {
      if (!f.endsWith('.json')) continue
      const req = loadEscalation(f.slice(0, -5))
      if (req && req.state === 'pending') out.push(req)
    }
  } catch { /* 目录缺席/坏行跳过 */ }
  return out.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.at - b.at)
}

/** 全量升级（org-diagnosis 用：pending+已裁决都算人工介入事件）。 */
export function listAll(): EscalationRequest[] {
  const out: EscalationRequest[] = []
  try {
    if (!existsSync(escalationDir())) return out
    const { readdirSync } = require('fs') as typeof import('fs')
    for (const f of readdirSync(escalationDir())) {
      if (!f.endsWith('.json')) continue
      const req = loadEscalation(f.slice(0, -5))
      if (req) out.push(req)
    }
  } catch { /* 目录缺席/坏行跳过 */ }
  return out.sort((a, b) => a.at - b.at)
}

/** 已裁决（结案）的升级——机制归因的责任面。 */
export function listDecided(): EscalationRequest[] {
  return listAll().filter((e) => e.state !== 'pending')
}

/** 裁决（一次定音；approved 可附 sandboxConstraints——联动 402 由调用方做）。 */
export function decideEscalation(
  id: string, verdict: 'approved' | 'denied', decision: Omit<NonNullable<EscalationRequest['decision']>, 'at'> & { at?: number },
): EscalationRequest | { error: string } {
  const req = loadEscalation(id)
  if (!req) return { error: '升级请求不存在' }
  if (req.state !== 'pending') return { error: '升级请求已裁决（一次定音）' }
  req.state = verdict
  req.decision = { ...decision, at: decision.at ?? Date.now() }
  save(req)
  return req
}

/**
 * 机制归因（甲2）：已裁决的升级结案时补"为什么原有机制没提前处理"的断点判定。
 * 一次定音（与 decide 同款纪律）；pending 不允许归因（结果未出，归因无据）。
 */
export function attributeEscalation(
  id: string, gap: MechanismGap, by: string, note?: string,
): EscalationRequest | { error: string } {
  const req = loadEscalation(id)
  if (!req) return { error: '升级请求不存在' }
  if (req.state === 'pending') return { error: '升级请求未裁决，先裁决再归因（结果未出归因无据）' }
  if (req.attribution) return { error: '已归因（一次定音）' }
  req.attribution = { gap, note: note?.trim() || undefined, by, at: Date.now() }
  save(req)
  return req
}

export interface RecurrenceGroup {
  /** 复发键：scope.tool（同工具反复升级=同类问题）。 */
  tool: string
  incidents: number
  /** 断点归因分布（gap≠none 才计为机制断点）。 */
  byGap: Partial<Record<MechanismGap, number>>
  /** 未归因条数（复发但根因不明——比复发本身更重的断点信号）。 */
  unattributed: number
  lastAt: number
}

/**
 * 同类问题复发分析（甲2）：按 scope.tool 聚合已裁决升级——文章第九节自检问句
 * "同样的问题下一次再发生，还需要我亲自出来解决吗"的机械形态。incidents≥2 且
 * gap≠none 占比高 → 同类问题在依赖同一次次人工协调，机制没有迭代。
 */
export function recurrenceByScope(): Map<string, RecurrenceGroup> {
  const groups = new Map<string, RecurrenceGroup>()
  for (const e of listDecided()) {
    const key = e.scope.tool
    const g = groups.get(key) ?? { tool: key, incidents: 0, byGap: {}, unattributed: 0, lastAt: 0 }
    g.incidents += 1
    g.lastAt = Math.max(g.lastAt, e.at)
    if (e.attribution) {
      if (e.attribution.gap !== 'none') g.byGap[e.attribution.gap] = (g.byGap[e.attribution.gap] ?? 0) + 1
    } else {
      g.unattributed += 1
    }
    groups.set(key, g)
  }
  return groups
}
