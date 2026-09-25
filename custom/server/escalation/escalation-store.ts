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
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

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
  return join(escalationDir(), `${id.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
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
  writeFileSync(escFile(req.escalationId), JSON.stringify(req, null, 2))
}

/** 发起升级（幂等 escalationId）。 */
export function requestEscalation(req: Omit<EscalationRequest, 'at' | 'state'> & { at?: number }): EscalationRequest {
  const existing = loadEscalation(req.escalationId)
  if (existing) return existing
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
