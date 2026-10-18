// overlay/custom/server/toolpipeline/tool-hooks.ts
// P1 工具执行瀑布的 overlay 消费面（2026-10-04 九源轮）。
//
// ekko registry 瀑布（patch 565/566：preExecute 在权限后、postExecute 在结果
// 回填前）+ manager 注入（两处 createRuntime）。钩子链现状（2026-10-08 H3 v1 起）：
// auditHook（观测）→ toolresultguard（结果围栏，默认关）→ enforce-gate（执法门，
// HERMES_TOOL_ENFORCE=1 才生效）。审计面 fail-open 永不阻断；执法面显式开启后
// 可拦（deny 语义见 enforce-gate.ts 三级策略链），未开启时零行为变化。
//
// 2026-10-16 安全轮 M6（预警先行版）：审计账补身份字段 + 按天轮转 + 失败计数。
// 背景：安全检查 E1 判「部分符合」——原账本无会话与身份标识（无法回答"谁调的
// 工具"），且每次 append 全文件读数、超 1000 行整文件重写（并发丢行 + 只留
// 约 2.5 分钟历史，撑不起频次类告警）。本版零行为变化：只加字段、改轮转、
// 加计数，不动任何裁决路径。
import { existsSync, mkdirSync, appendFileSync, readFileSync, statSync, renameSync, unlinkSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { ekkoGuardHook } from '../toolresultguard'
import { ekkoEnforceGateHook } from './enforce-gate'
import { skillGuardHook } from '../skillgov/skill-guard-hook'
import { reportLostSuspensionsOnBoot } from './enforce-approvals'
import {
  argDigest,
  CallSignatureTracker,
  classifyToolError,
  redactSensitive,
  resolveToolContract,
  summarizeArgs,
  type ErrorCategory,
  type ToolContract,
  type ToolSideEffect,
} from '../toolcontract/contract'
import { IdempotencyStore, idempotencyKeyFor } from '../toolcontract/idempotency-store'

export interface ToolExecAuditEntry {
  ts: number
  phase: 'pre' | 'post'
  tool: string
  /** pre：入参键清单（不落值——脱敏纪律）；post：ok 与 error 摘要 */
  inputKeys?: string[]
  ok?: boolean
  error?: string
  /** M6：身份字段（取自上游 AgentToolContext；标识非机密，落账不违反脱敏纪律）。
   *  无头/CLI 运行取不到时为 undefined——账本允许匿名行，不阻断。 */
  sessionId?: string
  userId?: string
  profileId?: string
  runId?: string
  /** 2026-10-18 Harness 可靠性轮：post 与配对 pre 的耗时（ms）。 */
  durationMs?: number
  /** 错误归一类别（只对失败调用写入）。 */
  errorCategory?: ErrorCategory
  /** 该类别在工具契约下是否可重试。 */
  retryable?: boolean
  /** 参数指纹（关联 pre/post、识别重复调用；不可反推参数）。 */
  argDigest?: string
  /** 脱敏后的参数摘要（键名保留、敏感键替换、长值截断）。 */
  argSummary?: Record<string, unknown>
  /** 工具副作用等级（read/write/external）。 */
  sideEffect?: ToolSideEffect
  /** 连续相同调用签名的次数（源文经验阈值 3）。 */
  duplicateStreak?: number
  /** 是否达到重复阈值。 */
  duplicate?: boolean
  /** 幂等键是否命中历史记录（跨重启仍有效）。 */
  idempotencyHit?: boolean
}

/** 单日文件行数上限（超限转 .1/.2 后缀，同 agent.log 轮转命名） */
const DAY_CAP = 5000
/** 保留天数（跨天时 lazy 清理更早文件，无定时器） */
const RETAIN_DAYS = 14

/** 落盘失败计数（fail-open 不阻断工具执行，但失败必须可见——静默失效=审计幻觉） */
let writeFailures = 0

function auditDir(): string {
  const env = process.env.TOOL_EXEC_AUDIT_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'tool-exec-audit')
}

/** 当日账本文件（本地时区日期，与 governance/change-governance-store.ts 的日期切分同款） */
function auditFile(now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return join(auditDir(), `tool-exec-${day}.jsonl`)
}

/** 跨天轮转 + 过期清理（lazy：append 时顺手做，失败不阻断） */
function rotateAndPrune(now = new Date()): void {
  try {
    const dir = auditDir()
    if (!existsSync(dir)) return
    const cutoff = now.getTime() - RETAIN_DAYS * 86_400_000
    for (const name of readdirSync(dir)) {
      const m = name.match(/^tool-exec-(\d{4})-(\d{2})-(\d{2})\.jsonl(?:\.(\d+))?$/)
      if (!m) continue
      const dayMs = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
      if (Number.isFinite(dayMs) && dayMs < cutoff) {
        try { unlinkSync(join(dir, name)) } catch { /* 单文件删失败跳过错过后轮再试 */ }
      }
    }
  } catch { /* 清理失败不阻断 */ }
}

/** 单文件超 DAY_CAP 时向后转缀（.1 最新→数字增大越旧，同 agent.log 语义） */
function rolloverIfFull(file: string): void {
  try {
    let size = 0
    try { size = statSync(file).size } catch { return }
    // 粗估行数（平均行长 ~200B）；超限才精确计数，避免每次 append 全读
    if (size < DAY_CAP * 120) return
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (lines.length <= DAY_CAP) return
    for (let i = 1; ; i++) {
      const rotated = `${file}.${i}`
      if (!existsSync(rotated)) {
        renameSync(file, rotated)
        break
      }
    }
  } catch { /* 轮转失败不阻断：账本继续追加到当前文件 */ }
}

function appendEntry(entry: ToolExecAuditEntry): void {
  try {
    const file = auditFile()
    // 审计目录与文件只给当前用户：同机其他账户不应能改读执行记录（源文 04 节）。
    mkdirSync(auditDir(), { recursive: true, mode: 0o700 })
    rolloverIfFull(file)
    appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 })
    // 跨天/超限的清理与轮转低频触发（每 200 条做一次，避免每 append 读目录）
    if (Math.random() < 1 / 200) rotateAndPrune()
  } catch {
    // fail-open 保持：审计失败不阻断工具执行；但计数可见
    writeFailures += 1
    if (writeFailures === 1 || writeFailures % 50 === 0) {
      import('../govbus/event-log')
        .then(({ appendGovEvent }) => {
          appendGovEvent({
            domain: 'system',
            severity: 'warn',
            type: 'tool.exec-audit.write-failed',
            source: 'toolpipeline/tool-hooks',
            summary: `工具执行审计账落盘失败 ${writeFailures} 次（fail-open 未阻断执行，但该窗口审计有缺）`,
            payload: { failures: writeFailures },
          })
        })
        .catch(() => { /* govbus 不可用：计数仍在进程内可见 */ })
    }
  }
}

/** 观测钩子（v3，2026-10-18 Harness 可靠性轮）：在 v2「pre 记键名、post 记结局」
 *  之上补齐源文 04/05/07 节要求的审计字段：耗时、错误归一类别、可重试性、
 *  参数指纹与脱敏摘要、副作用等级、连续重复调用、幂等键命中。
 *
 *  配对策略：上游钩子不带 tool_call_id，按 `scope(run/session) + 工具名` 维护
 *  FIFO 队列；postExecute 出队最早一条配对。并发同名调用可能错配耗时，但不会
 *  丢行——审计用途可接受，换取零上游接口改动。
 *  纪律不变：不落参数原值；摘要脱敏后截断；审计失败 fail-open。 */
interface AuditContext {
  userId?: string
  sessionId?: string
  profileId?: string
  runId?: string
}

interface PendingCall {
  startedAt: number
  contract: ToolContract
  idempotencyKey: string | null
  idempotencyHit: boolean
}

const pendingCalls = new Map<string, PendingCall[]>()
const PENDING_PER_KEY_CAP = 32
const duplicateTracker = new CallSignatureTracker()
const idempotencyStore = new IdempotencyStore()

function scopeOf(context?: AuditContext): string {
  return context?.runId || context?.sessionId || context?.profileId || 'anonymous'
}

function pendingKeyOf(name: string, context?: AuditContext): string {
  return `${scopeOf(context)}|${name}`
}

function emitRepeatWarning(name: string, streak: number, context: AuditContext | undefined, signature: string): void {
  void import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'security',
        severity: 'warn',
        type: 'tool.call.repeat-signature',
        source: 'toolpipeline/tool-hooks',
        summary: `连续 ${streak} 次相同工具调用（${name}），疑似模型陷入重复循环`,
        payload: { tool: name, streak, signature },
        refs: {
          ...(context?.sessionId ? { sessionId: context.sessionId } : {}),
          ...(context?.runId ? { runId: context.runId } : {}),
        },
      })
    })
    .catch(() => { /* govbus 不可用：审计行仍保留 duplicate 标记 */ })
}

const auditHook = {
  async preExecute(name: string, input: Record<string, unknown>, context?: AuditContext) {
    const contract = resolveToolContract(name)
    const scope = scopeOf(context)
    // 指纹输入先脱敏：审计/幂等账只落哈希，敏感值不进入哈希原文。
    const digestInput = redactSensitive(input, contract.redactKeys)
    const repeat = duplicateTracker.observe(scope, name, digestInput)
    let idempotencyKey: string | null = null
    let idempotencyHit = false
    if (contract.idempotency.mode === 'key' && contract.sideEffect !== 'read') {
      idempotencyKey = idempotencyKeyFor({
        tool: name,
        args: digestInput,
        userId: context?.userId,
        runId: context?.runId,
        ttlMs: contract.idempotency.ttlMs,
        keyFields: contract.idempotency.keyFields,
      })
      idempotencyHit = idempotencyStore.peek(idempotencyKey) !== null
    }

    const key = pendingKeyOf(name, context)
    const queue = pendingCalls.get(key) ?? []
    queue.push({ startedAt: Date.now(), contract, idempotencyKey, idempotencyHit })
    if (queue.length > PENDING_PER_KEY_CAP) queue.shift()
    pendingCalls.set(key, queue)

    appendEntry({
      ts: Date.now(),
      phase: 'pre',
      tool: name,
      inputKeys: Object.keys(input ?? {}).slice(0, 20),
      argDigest: argDigest(digestInput),
      argSummary: summarizeArgs(input, {
        redactKeys: contract.redactKeys,
        maxChars: contract.maxArgSummaryChars,
        // 默认只记形状；排障需要值摘要时显式开启，且仍走敏感键脱敏与截断。
        includeValues: process.env.TOOL_AUDIT_ARG_VALUES === '1',
      }),
      sideEffect: contract.sideEffect,
      duplicateStreak: repeat.streak,
      duplicate: repeat.duplicate || undefined,
      idempotencyHit: idempotencyHit || undefined,
      sessionId: context?.sessionId,
      userId: context?.userId,
      profileId: context?.profileId,
      runId: context?.runId,
    })

    if (repeat.firstDuplicate) emitRepeatWarning(name, repeat.streak, context, repeat.signature)
  },

  async postExecute(name: string, _input: Record<string, unknown>, result: { ok?: boolean; error?: string }, context?: AuditContext) {
    const key = pendingKeyOf(name, context)
    const queue = pendingCalls.get(key)
    const pending = queue?.shift() ?? null
    if (queue && queue.length === 0) pendingCalls.delete(key)

    const now = Date.now()
    const ok = typeof result?.ok === 'boolean' ? result.ok : undefined
    const failed = ok === false
    const info = failed ? classifyToolError(result?.error ?? result, pending?.contract) : null

    // 成功的幂等键落账：后续同键调用即命中（观测层；跳过执行待执行器改造）。
    if (pending?.idempotencyKey && ok !== false) {
      idempotencyStore.complete(pending.idempotencyKey, {
        tool: name,
        ttlMs: pending.contract.idempotency.ttlMs,
        resultDigest: argDigest({ ok: result?.ok, error: result?.error }),
      })
    }

    appendEntry({
      ts: now,
      phase: 'post',
      tool: name,
      ok,
      error: typeof result?.error === 'string' ? result.error.slice(0, 200) : undefined,
      durationMs: pending ? Math.max(0, now - pending.startedAt) : undefined,
      errorCategory: info?.category,
      retryable: info?.retryable,
      sideEffect: pending?.contract.sideEffect,
      idempotencyHit: pending?.idempotencyHit || undefined,
      sessionId: context?.sessionId,
      userId: context?.userId,
      profileId: context?.profileId,
      runId: context?.runId,
    })
  },
}

// toolresultguard P1a（2026-10-06 五文轮）：postExecute 增加注入判定/隔离改写
// （结果回填模型前）。守卫默认关（TRG_ENABLED=0 时零行为变化），超时/离线
// fail-open，S0 预筛兜底——关闭态与既有 v1 观测语义完全一致。
// H3 v1（2026-10-08 六文调研轮）：enforce-gate 执法钩子排末位（紧贴真实执行）——
// 阶梯/风险档/权限模式三级裁决，HERMES_TOOL_ENFORCE=1 才生效（默认零行为变化）。
// "只观测不拦截"的 v1 边界自此收窄为"默认不拦截"（执法面显式开启后可拦）。
// Skill 三段治理（2026-10-13 挂账清偿轮）：skillGuardHook 排泛型围栏后、执法门前——
// skill_view/skill_manage 按注册扫描 verdict 拦 + 装载内容内联 shell 警示
// （SKILLGOV_ENFORCE=1 才执法；观测审计恒开 fail-open）。
export const ekkoToolExecuteHooks = [auditHook, ekkoGuardHook(), skillGuardHook(), ekkoEnforceGateHook()]

// H3 中间态（进程面边界缓解）：钩子装配=server 启动面，扫一遍重启遗留挂起单
// （waitingAt 标记在案→govbus 提醒+清标记；幂等、fail-soft、fire-and-forget）。
void reportLostSuspensionsOnBoot()

/** 读尾部（测试/消费面）。跨日文件按新→旧回读合并，最终按时间正序返回
 *  （保持 v1 契约：entries[0] 最早）。签名与返回类型不变。
 *  覆盖范围声明：本账只记 studio server ekko runtime 的工具调用；agent teams
 *  （hermes -p <profile> chat -q Python 子进程）不经过该链，其工具调用以各
 *  profile 的 state.db 为准（clusterinspector collectProfileToolUsage 面）。 */
export function readToolExecAudit(limit = 100): ToolExecAuditEntry[] {
  try {
    const dir = auditDir()
    if (!existsSync(dir)) return []
    const files = readdirSync(dir)
      .filter((f) => /^tool-exec-\d{4}-\d{2}-\d{2}\.jsonl(\.\d+)?$/.test(f))
      .sort()
      .reverse()
    const out: ToolExecAuditEntry[] = []
    for (const f of files) {
      if (out.length >= limit) break
      try {
        const lines = readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean)
        for (const l of lines.reverse()) {
          if (out.length >= limit) break
          out.push(JSON.parse(l) as ToolExecAuditEntry)
        }
      } catch { /* 单文件读失败跳过 */ }
    }
    return out.reverse()
  } catch {
    return []
  }
}

/** 落盘失败计数（观测面健康指标：>0 即该窗口审计有缺） */
export function toolExecAuditWriteFailures(): number {
  return writeFailures
}

export interface ToolExecAuditQuery {
  /** 回看天数（默认 7，1~90）。 */
  days?: number
  /** 返回条数上限（默认 200，1~5000）。 */
  limit?: number
  tool?: string
  sessionId?: string
  runId?: string
  outcome?: 'ok' | 'error'
  phase?: 'pre' | 'post'
}

export interface ToolExecAuditQueryResult {
  entries: ToolExecAuditEntry[]
  total: number
  byTool: Array<{ tool: string; count: number; errors: number; avgDurationMs: number | null }>
  byOutcome: { ok: number; error: number; unknown: number }
  auditWriteFailures: number
  windowDays: number
}

function dayStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 查询面：按窗口/身份/工具/结果过滤，返回分页明细与聚合。
 *  与 readToolExecAudit 同源同文件格式；坏行跳过、目录缺席返回空（fail-soft）。 */
export function queryToolExecAudit(query: ToolExecAuditQuery = {}, now = Date.now()): ToolExecAuditQueryResult {
  const days = Math.min(90, Math.max(1, Math.round(query.days ?? 7)))
  const limit = Math.min(5_000, Math.max(1, Math.round(query.limit ?? 200)))
  const cutoff = now - days * 86_400_000
  const cutoffDay = dayStamp(cutoff)
  const all: ToolExecAuditEntry[] = []
  try {
    const dir = auditDir()
    if (existsSync(dir)) {
      const files = readdirSync(dir)
        .filter((f) => /^tool-exec-\d{4}-\d{2}-\d{2}\.jsonl(\.\d+)?$/.test(f))
        .filter((f) => f.slice(10, 20) >= cutoffDay)
      for (const f of files) {
        try {
          for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
            if (!line) continue
            try {
              const entry = JSON.parse(line) as ToolExecAuditEntry
              if (typeof entry?.ts === 'number' && entry.ts >= cutoff) all.push(entry)
            } catch { /* 坏行跳过 */ }
          }
        } catch { /* 单文件读失败跳过 */ }
      }
    }
  } catch { /* 目录不可读：按空账返回 */ }

  const filtered = all.filter((e) => {
    if (query.tool && e.tool !== query.tool) return false
    if (query.sessionId && e.sessionId !== query.sessionId) return false
    if (query.runId && e.runId !== query.runId) return false
    if (query.phase && e.phase !== query.phase) return false
    if (query.outcome === 'ok' && !(e.phase === 'post' && e.ok === true)) return false
    if (query.outcome === 'error' && !(e.phase === 'post' && e.ok === false)) return false
    return true
  })

  const byTool = new Map<string, { count: number; errors: number; durations: number[] }>()
  const byOutcome = { ok: 0, error: 0, unknown: 0 }
  for (const e of filtered) {
    const bucket = byTool.get(e.tool) ?? { count: 0, errors: 0, durations: [] }
    bucket.count += 1
    if (e.phase === 'post') {
      if (e.ok === true) byOutcome.ok += 1
      else if (e.ok === false) { byOutcome.error += 1; bucket.errors += 1 }
      else byOutcome.unknown += 1
      if (typeof e.durationMs === 'number') bucket.durations.push(e.durationMs)
    }
    byTool.set(e.tool, bucket)
  }

  filtered.sort((a, b) => b.ts - a.ts)

  return {
    entries: filtered.slice(0, limit),
    total: filtered.length,
    byTool: [...byTool.entries()]
      .map(([tool, b]) => ({
        tool,
        count: b.count,
        errors: b.errors,
        avgDurationMs: b.durations.length
          ? Math.round(b.durations.reduce((s, v) => s + v, 0) / b.durations.length)
          : null,
      }))
      .sort((a, b) => b.count - a.count),
    byOutcome,
    auditWriteFailures: writeFailures,
    windowDays: days,
  }
}

/** 测试隔离。 */
export function _useAuditDirForTests(dir: string): void {
  process.env.TOOL_EXEC_AUDIT_DIR = dir
}

/** 测试专用：重置进程内重复调用追踪与 pending 配对。 */
export function _resetAuditStateForTests(): void {
  duplicateTracker.reset()
  pendingCalls.clear()
}

/** 测试专用：跨天清理与超限转缀的内部入口（生产路径由 appendEntry 低频触发） */
export function _rotateAndPruneForTests(now = new Date()): void {
  rotateAndPrune(now)
}

export function _rolloverIfFullForTests(file: string): void {
  rolloverIfFull(file)
}
