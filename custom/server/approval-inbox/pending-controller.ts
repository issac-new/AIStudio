/**
 * 人工审批收件箱 REST（/api/approvals/*）——P1 §二（2026-09-28 产品 UI 缺陷修复）。
 *
 * GET  /api/approvals/pending            待审聚合（fleet 命令审批 + 评审域未裁决）
 * POST /api/approvals/autopass/scan      显式自动放行扫描（唯一触发点，返回 {ok,acted}）
 * POST /api/approvals/:id/decide         就地裁决（id 前缀路由到对应域，决策落历史）
 * GET  /api/approvals/history?limit=50   决策历史（时间+操作人+对象+结果）
 * GET  /api/approvals/spotcheck          待抽检清单（低风险自动放行的事后回看）
 * POST /api/approvals/spotcheck/:id/resolve  抽检处置（confirm 认可 / veto 误放行回灌）
 *
 * V4.1 §七 抽检器（2026-09-29 起，2026-11-05 P0 Task 4 改造）：低风险自动放行
 * （autopass.ts，纯只读命令过宽限期自动 once 放行 + 确定性抽检入队）不再挂在
 * GET 读请求上——读端点（/pending、/pending-summary）零副作用，扫描只由显式
 * 写命令 POST /autopass/scan 触发（客户端读面前置调用），人审聚焦 high/medium。
 *
 * 数据源复用既有域（不另起炉灶）：
 *   - fleet 命令审批：services/hermes/fleet-tap（buildFleetSnapshotFromTap 的
 *     sessions[].approvals；decide 走 respondFleetApproval，与 /api/hermes/fleet/approval 同源）
 *   - 评审卡：review/review-store（verdict 未落的 ReviewRecord；decide 走 setVerdict，
 *     与 /api/review/:id/verdict 同源——approve/request_changes 自动落 evidence）
 * 决策历史：approvals/approval-log（append-only；actor 取 ctx.state.user.username，
 * 与 fleet/review 控制器同源取法，body 自报身份不可信）。
 *
 * 挂载：B 类 patch 488 在 bootstrap/routes.ts（与 477/482 同款两行）。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { buildFleetSnapshotFromTap, respondFleetApproval } from '../services/hermes/fleet-tap'
import { loadReview, setVerdict, listReviews } from '../review/review-store'
import { isReviewVerdict, type ReviewVerdict } from '../review/review-store'
import { appendApprovalLog, queryApprovalLog, verifyApprovalChain } from './approval-log'
import { classifyApprovalRisk, type ApprovalRiskTier } from './risk-tier'
import { autopassEnabled, isAutopassCandidate, recordAutoPass, listOpenSpotchecks, listResolvedSpotchecks, resolveSpotcheck } from './autopass'
import { analyzeCommandImpact, type CommandImpact } from './impact-preview'
import { decideEnforceApprovalGuarded, listPendingEnforceApprovals } from '../toolpipeline/enforce-approvals'
// overlay[orggov-dualsign]（2026-11-05 收口）：高风险批准双签真拦。
// 只在「风险档可重算」的审批分支生效（enf:/fleet:）；其余分支判不了档位，不猜也不假装拦。
import { decideDualSignGate } from '../autonomygov/dualsign'
import { listDualSignSigners, listOutcomeDualSign, recordDualSignGap, recordDualSignSigner, recordOutcomeDualSign } from '../autonomygov/store'
// 批一 Task 12：outcome 绑定条目的合同门（stale 409）与 owner/verifier 双签门——
// 签署人集合=合同字段（ownerPersonId/verificationOwnerId），不再仅 fleet:/enf: 风险档分支。
import { getContract } from '../outcome/outcome-store'
import { getPerson } from '../agentidentity/people'
import type { OutcomeContract } from '../outcome/types'
import { listHumanGatePending, humanGateRouter, decide as humanGateDecide } from './human-gate'
import { atomicWriteJson } from '../lib/fs-store'
import { fail, ok } from '../lib/http'
import { hermesHome } from '../lib/paths'
import { requirePlatformSuperAdmin } from '../platform/authz/policy'

const router = new Router({ prefix: '/api/approvals' })
// 六源归属协议未齐前整个收件箱（含嵌套 human-gate）限 super_admin；
// router.use 必须先于本文件全部路由声明，拒绝先于 pending 自动放行与任何裁决写入。
router.use(requirePlatformSuperAdmin)

export interface PendingItem {
  id: string
  kind: 'command' | 'review'
  title: string
  detail: string
  sessionId?: string
  profile?: string
  taskId?: string
  domain?: string
  baseRef?: string
  choices?: string[]
  createdAt: number
  /** V4-N1 风险档（服务端权威分类；high 红标逐条裁决 / low 可自动通过+抽检） */
  risk: ApprovalRiskTier
  /** 2026-10-04 影响面预览（Blast Radius）：高危命令裁决前列受影响目标；
   *  null/缺省 = 非破坏性模式或解析不适用（不假装零影响）。纯模式解析无 IO。 */
  impact?: CommandImpact | null
  /** 批一 Task 12：条目源记录携带 outcome_ref（T11 agent 侧随 gateway/deferred 条目下发）
   *  时的合同绑定上下文；缺省=无 outcome 绑定，行为与批一前一致。 */
  outcomeRef?: OutcomeRef
  /** 批二 Task 2：outcome 绑定「有线索但不可证」（fleet tap 字段读取瞬态抛错，或
   *  outcome_ref 在但形状解不出）——不回退成「无绑定」放行（旧路径落风险档闸/单签
   *  直决= fail-open）；autopass 拒、decide 批准类 409 outcome_unavailable。 */
  outcomeUnverified?: boolean
  /** high+one-way 格（decision-matrix evaluateOutcomeAction）标记：decide 走
   *  owner+verifier 双签门（两笔不同 actor 顺序批准才 resolved）。 */
  dualSignRequired?: boolean
}

/** outcome 绑定引用（vendor/hermes-agent/tools/approval.py outcome_ref 同形；
 *  verificationOwnerId 为合同正身字段名——与 outcome/types.ts 逐字一致）。 */
export interface OutcomeRef {
  outcomeId: string
  contractVersion: number
  ownerPersonId?: string | null
  verificationOwnerId?: string | null
}

/** 源记录携带的 outcome_ref 宽容解析：形状不对视同无绑定（不猜数）。 */
function parseOutcomeRef(v: unknown): OutcomeRef | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const r = v as Record<string, unknown>
  if (typeof r.outcomeId !== 'string' || !r.outcomeId.trim()) return undefined
  if (typeof r.contractVersion !== 'number' || !Number.isInteger(r.contractVersion) || r.contractVersion < 1) return undefined
  return {
    outcomeId: r.outcomeId,
    contractVersion: r.contractVersion,
    ...(typeof r.ownerPersonId === 'string' && r.ownerPersonId ? { ownerPersonId: r.ownerPersonId } : {}),
    ...(typeof r.verificationOwnerId === 'string' && r.verificationOwnerId ? { verificationOwnerId: r.verificationOwnerId } : {}),
  }
}

/** 批二 Task 2：outcome 绑定「有线索但不可证」判定——fleet tap 标记的读取瞬态失败
 *  （outcome_unverified），或非空 outcome_ref 解析不出（形状不合法），皆为真。此类
 *  条目不得按「无绑定」放行（互斥分流要求先证明无绑定才能落风险档闸），聚合面标
 *  PendingItem.outcomeUnverified、autopass 拒、decide 批准类 409 outcome_unavailable。 */
function outcomeRefUnverified(rec: { outcome_ref?: unknown; outcome_unverified?: boolean } | null | undefined): boolean {
  if (!rec) return false
  if (rec.outcome_unverified === true) return true
  return rec.outcome_ref != null && parseOutcomeRef(rec.outcome_ref) === undefined
}

function actorOf(ctx: { state?: { user?: { username?: string } } }): string {
  return ctx.state?.user?.username ?? 'anonymous'
}

// ── studio-file 审批传输队列（fleet 命令审批 live 源，patch 490 + 插件配套）──
// worker 插件把（已脱敏）审批请求追加 <HERMES_HOME>/approvals/queue.jsonl 并轮询
// responses/<request_id>.json；本端读队列、写响应。无响应文件且未超时 = 待审。
interface FileQueueEntry {
  request_id: string
  digest: string
  command: string
  description: string
  surface?: string
  allowed_choices?: string[]
  timeout_seconds?: number
  enqueued_at?: number
  /** 批一 Task 12：outcome-scoped 命令审批随条目下发（gateway data 经 worker 插件入队）。 */
  outcome_ref?: unknown
  dual_sign_required?: boolean
}

function approvalsDirs(): string[] {
  // 队列目录集：显式 env > 根 home + 全部 profile home（worker 的 HERMES_HOME
  // 是 profile home，传输按其入队——studio 侧全扫聚合，decide 回写同目录）。
  const env = process.env.HERMES_APPROVALS_QUEUE_DIR?.trim()
  if (env) return [env]
  const home = process.env.HERMES_HOME?.trim() || hermesHome()
  const dirs = [join(home, 'approvals')]
  try {
    for (const name of readdirSync(join(home, 'profiles'))) {
      const d = join(home, 'profiles', name, 'approvals')
      if (existsSync(d)) dirs.push(d)
    }
  } catch { /* profiles 目录不存在（非 sim 部署）忽略 */ }
  return dirs
}

function readPendingFileQueue(): PendingItem[] {
  const outAll: PendingItem[] = []
  for (const dir of approvalsDirs()) outAll.push(...readOneQueue(dir))
  return outAll
}

// ── 延迟工具调用审批源（Always-on Agents P6，2026-11-16）──
// 审批超时的挂起记录落 <HERMES_HOME>/approvals/deferred.json；本端只列 pending，
// 裁决写 responses/<request_id>.json（gateway watcher 轮询后唤醒原会话）。
interface DeferredRecord {
  id: string
  session_key?: string
  session_id?: string
  request_id: string
  tool?: string
  preview?: string
  risk?: string
  created_at?: number
  expires_at?: number
  status?: string
  /** 批一 Task 12（tools/deferred_calls.py record_deferred 同形）：outcome-scoped
   *  守卫超时挂起携带合同引用与双签标记，收件箱据此识别需双签的待决条目。 */
  outcome_ref?: unknown
  dual_sign_required?: boolean
}

function readDeferredQueue(): PendingItem[] {
  const items: PendingItem[] = []
  const now = Date.now()
  for (const dir of approvalsDirs()) {
    const file = join(dir, 'deferred.json')
    if (!existsSync(file)) continue
    let rows: DeferredRecord[]
    try { rows = JSON.parse(readFileSync(file, 'utf8')) as DeferredRecord[] } catch { continue }
    if (!Array.isArray(rows)) continue
    for (const r of rows) {
      if (!r || r.status !== 'pending' || !r.id || !r.request_id) continue
      if (typeof r.expires_at === 'number' && r.expires_at * 1000 <= now) continue
      // 已答（响应文件在）不再列——watcher settle 前的窗口不重复呈现
      if (existsSync(join(dir, 'responses', `${r.request_id}.json`))) continue
      const created = typeof r.created_at === 'number' ? Math.round(r.created_at * 1000) : now
      const detail = r.preview || r.tool || r.request_id
      items.push({
        id: `deferredfile:${r.id}`,
        kind: 'command',
        title: `延迟审批（${r.tool || '工具'}）`,
        detail,
        ...(r.session_id ? { sessionId: r.session_id } : {}),
        choices: ['once', 'deny'],
        createdAt: created,
        risk: classifyApprovalRisk({ kind: 'command', detail }),
        impact: analyzeCommandImpact(detail),
        ...outcomeAnnotationOf(r),
      })
    }
  }
  return items
}

/** 批一 Task 12：源记录 outcome 绑定字段 → PendingItem 标注（null/缺省=无绑定）。
 *  批二 Task 2：绑定线索在但不可证（tap 读取瞬态抛错/引用形状不合法）→ 标
 *  outcomeUnverified，不回退成「无绑定」（fail-open 收口：autopass/decide 面同拒）。 */
function outcomeAnnotationOf(rec: { outcome_ref?: unknown; dual_sign_required?: boolean; outcome_unverified?: boolean }): {
  outcomeRef?: OutcomeRef
  dualSignRequired?: boolean
  outcomeUnverified?: boolean
} {
  const outcomeRef = parseOutcomeRef(rec.outcome_ref)
  if (!outcomeRef) return outcomeRefUnverified(rec) ? { outcomeUnverified: true } : {}
  return { outcomeRef, ...(rec.dual_sign_required === true ? { dualSignRequired: true } : {}) }
}

/** 写延迟审批响应（无 digest 绑定——delayed 记录本身是事实源；先到先得由 watcher settle）。
 *  返回 boolean（Result 联合的失败字面量会触发 K19 棘轮，新代码不新增）。 */
function writeDeferredResponse(deferredId: string, choice: string, actor: string): boolean {
  for (const dir of approvalsDirs()) {
    const file = join(dir, 'deferred.json')
    if (!existsSync(file)) continue
    let rows: DeferredRecord[]
    try { rows = JSON.parse(readFileSync(file, 'utf8')) as DeferredRecord[] } catch { continue }
    const rec = Array.isArray(rows) ? rows.find((r) => r.id === deferredId && r.status === 'pending') : undefined
    if (!rec) continue
    const respDir = join(dir, 'responses')
    const respFile = join(respDir, `${rec.request_id}.json`)
    if (existsSync(respFile)) continue // 已答：幂等拒绝（先到先得）
    mkdirSync(respDir, { recursive: true })
    atomicWriteJson(respFile, {
      request_id: rec.request_id, choice, decided_at: Date.now(), actor,
    })
    return true
  }
  return false
}

// ── mx 审批通道（backlog ③ 审批面统一·产品侧读+裁决，2026-10-06）──
// harness（Matrix/推演）审批请求经 <approvals>/mx-requests.jsonl 入队（每行
// {eid,title,detail,sessionId?,profile?,createdAt}，eid=Matrix $event_id 全局幂等锚）；
// 裁决走 mx: decide 分支写 mx-responses/<safe-eid>.json（tmp+rename 原子，与
// fleetfile 同款），harness 侧轮询消费（③b）。防双通道重批三重幂等闸：
// ①approved.events 行首 eid 命中（Matrix 反应通道已批）②mx-responses 响应文件在
// （本通道已批）③decide 分支二次复核（读路径与裁决路径同口径）。
interface MxRequestEntry {
  eid: string
  title?: string
  detail?: string
  sessionId?: string
  profile?: string
  createdAt?: number
  /** 批一 Task 12 复审 I-2：harness 入队时随带的 outcome 绑定（806 字段名），decide 同门。 */
  outcome_ref?: unknown
  dual_sign_required?: boolean
}

/** Matrix $event_id 含 $/: 等文件名不安全字符——响应文件名统一转义（harness ③b 同约定） */
function mxSafeEid(eid: string): string {
  return eid.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** approved.events 各目录已裁决 eid 集（行首请求 eid 列；读失败=空集不阻断） */
function mxDecidedEids(): Set<string> {
  const eids = new Set<string>()
  for (const dir of approvalsDirs()) {
    try {
      for (const line of readFileSync(join(dir, 'approved.events'), 'utf8').split('\n')) {
        const e = line.trim().split(/\s+/)[0]
        if (e) eids.add(e)
      }
    } catch { /* 台账缺失忽略 */ }
  }
  return eids
}

/** mx 通道待审源：入队请求 −（反应通道已批 ∪ 本通道已批） */
function readMxApprovalChannel(): PendingItem[] {
  const decided = mxDecidedEids()
  const out: PendingItem[] = []
  for (const dir of approvalsDirs()) {
    const queue = join(dir, 'mx-requests.jsonl')
    if (!existsSync(queue)) continue
    let lines: string[] = []
    try { lines = readFileSync(queue, 'utf8').split('\n') } catch { continue }
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let entry: MxRequestEntry
      try { entry = JSON.parse(trimmed) as MxRequestEntry } catch { continue }
      if (!entry.eid || decided.has(entry.eid)) continue
      if (existsSync(join(dir, 'mx-responses', `${mxSafeEid(entry.eid)}.json`))) continue
      out.push({
        id: `mx:${entry.eid}`,
        kind: 'command',
        title: entry.title || entry.eid,
        detail: entry.detail || '',
        ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
        ...(entry.profile ? { profile: entry.profile } : {}),
        createdAt: entry.createdAt ?? 0,
        risk: classifyApprovalRisk({ kind: 'command', detail: entry.detail || '', title: entry.title || entry.eid }),
        ...outcomeAnnotationOf(entry),
      })
    }
  }
  return out
}

/** mx 请求条目定位（decide 回写响应与 Task 12 outcome 门共读）；找不到 = null。 */
function findMxEntry(eid: string): { dir: string; entry: MxRequestEntry } | null {
  for (const dir of approvalsDirs()) {
    const queue = join(dir, 'mx-requests.jsonl')
    try {
      for (const line of readFileSync(queue, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const entry = JSON.parse(trimmed) as MxRequestEntry
          if (entry.eid === eid) return { dir, entry }
        } catch { continue }
      }
    } catch { continue }
  }
  return null
}

/** 该请求所在的队列目录（decide 回写响应用）；找不到 = null。 */
function queueDirOfRequest(requestId: string): string | null {
  for (const dir of approvalsDirs()) {
    const queue = join(dir, 'queue.jsonl')
    try {
      for (const line of readFileSync(queue, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const entry = JSON.parse(trimmed) as FileQueueEntry
          if (entry.request_id === requestId) return dir
        } catch { continue }
      }
    } catch { continue }
  }
  return null
}

function readOneQueue(dir: string): PendingItem[] {
  const queue = join(dir, 'queue.jsonl')
  if (!existsSync(queue)) return []
  const now = Date.now()
  const out: PendingItem[] = []
  let lines: string[] = []
  try {
    lines = readFileSync(queue, 'utf8').split('\n')
  } catch { return [] }
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let entry: FileQueueEntry
    try { entry = JSON.parse(trimmed) as FileQueueEntry } catch { continue }
    if (!entry.request_id || !entry.digest) continue
    // 已答（响应文件在）或已超时（timeout 从入队起算，宽限 30s 消化延迟）不再列
    if (existsSync(join(dir, 'responses', `${entry.request_id}.json`))) continue
    const ttl = (typeof entry.timeout_seconds === 'number' ? entry.timeout_seconds : 300) * 1000
    const enqueued = typeof entry.enqueued_at === 'number' ? entry.enqueued_at : 0
    if (enqueued && now - enqueued > ttl + 30_000) continue
    out.push({
      id: `fleetfile:${entry.request_id}`,
      kind: 'command',
      // V4.1 抽检器：文件队列源同走服务端权威分类（rm/push 等仍 high 人审；
      // 纯只读命令 low → 可自动放行+抽检；分不明细的兜底 medium 不低判）
      risk: classifyApprovalRisk({ kind: 'command', detail: entry.command || entry.description || '' }),
      title: `${entry.surface || 'unattended worker'} 的命令审批`,
      detail: entry.command || entry.description || entry.request_id,
      choices: (entry.allowed_choices && entry.allowed_choices.length ? entry.allowed_choices : ['once', 'session', 'deny']),
      createdAt: enqueued || now,
      impact: analyzeCommandImpact(entry.command || ''),
      ...outcomeAnnotationOf(entry),
    })
  }
  return out
}

/** 写文件队列审批响应（digest 绑定；decide 路由与低风险自动放行共用同一实现）。 */
function writeFleetFileResponse(requestId: string, choice: string, actor: string): { ok: true } | { ok: false } {
  const dir = queueDirOfRequest(requestId)
  if (!dir) return { ok: false }
  const queue = join(dir, 'queue.jsonl')
  let digest = ''
  try {
    for (const line of readFileSync(queue, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const entry = JSON.parse(trimmed) as FileQueueEntry
        if (entry.request_id === requestId && entry.digest) { digest = entry.digest; break }
      } catch { continue }
    }
  } catch { /* 队列不可读 */ }
  if (!digest) return { ok: false }
  const respDir = join(dir, 'responses')
  const file = join(respDir, `${requestId}.json`)
  // 批一 Task 12 复审 I-1：已答幂等拒绝（先到先得，writeDeferredResponse 先例）——
  // 防双签流程中 deny 后补签覆盖翻盘、resolved 后单方改写 session/always。
  if (existsSync(file)) return { ok: false }
  mkdirSync(respDir, { recursive: true })
  atomicWriteJson(file, { request_id: requestId, digest, choice, decided_at: Date.now(), actor })
  return { ok: true }
}

/** 按 request_id 找文件队列条目（Task 12 decide 门读 outcome 绑定用）；找不到 = null。 */
function findQueueEntry(requestId: string): FileQueueEntry | null {
  for (const dir of approvalsDirs()) {
    try {
      for (const line of readFileSync(join(dir, 'queue.jsonl'), 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const entry = JSON.parse(trimmed) as FileQueueEntry
          if (entry.request_id === requestId) return entry
        } catch { continue }
      }
    } catch { continue }
  }
  return null
}

/** 按 deferred id 找 pending 延迟记录（Task 12 decide 门读 outcome 绑定用）；找不到 = null。 */
function findDeferredRecord(deferredId: string): DeferredRecord | null {
  for (const dir of approvalsDirs()) {
    const file = join(dir, 'deferred.json')
    if (!existsSync(file)) continue
    try {
      const rows = JSON.parse(readFileSync(file, 'utf8')) as DeferredRecord[]
      if (!Array.isArray(rows)) continue
      const rec = rows.find((r) => r && r.id === deferredId && r.status === 'pending')
      if (rec) return rec
    } catch { continue }
  }
  return null
}

/** deferred 记录的响应文件是否已在（已答判定；复审 I-1 先于双签门检查，
 *  防已决条目仍报「待第二签」）。 */
function deferredResponseExists(deferredId: string): boolean {
  for (const dir of approvalsDirs()) {
    const file = join(dir, 'deferred.json')
    if (!existsSync(file)) continue
    try {
      const rows = JSON.parse(readFileSync(file, 'utf8')) as DeferredRecord[]
      if (!Array.isArray(rows)) continue
      const rec = rows.find((r) => r && r.id === deferredId)
      if (rec && rec.request_id && existsSync(join(dir, 'responses', `${rec.request_id}.json`))) return true
    } catch { continue }
  }
  return false
}

/** 待审聚合三源合并（不排序；供 pending 路由与自动放行扫描共用）。 */
function collectPendingItems(): PendingItem[] {
  const items: PendingItem[] = []
  // 文件队列源（patch 490 unattended 传输；读失败不阻断其余聚合）
  try { items.push(...readPendingFileQueue()) } catch { /* 队列不可读忽略 */ }
  // 延迟工具调用源（Always-on P6）：审批超时挂起项，跨重启可见
  try { items.push(...readDeferredQueue()) } catch { /* deferred 账本不可读忽略 */ }

  // HumanGate 前置批准源（run22 复盘②）：发布评审前置发起的人工批准请求——
  // 批准与评判决词解耦，环形依赖（评审等批准/批准等评审）产品面断根。
  try { items.push(...listHumanGatePending()) } catch { /* hgate 源缺席忽略 */ }

  // mx 通道源（backlog ③：Matrix/harness 审批事件翻成 PendingItem，eid 幂等防双通道重批）
  try { items.push(...readMxApprovalChannel()) } catch { /* mx 通道不可读忽略 */ }
  // 执法审批桥源（H3 收口轮）：执法门"需人工确认"类挂单（consume-on-pass 一单一执行）
  try {
    for (const r of listPendingEnforceApprovals()) {
      items.push({
        id: r.id,
        kind: 'command',
        title: `执法门·${r.tool}（${r.rule === 'ladder-approval-point' ? '阶梯确认点' : 'RA 档'}）`,
        detail: `${r.inputPreview}｜profile ${r.profileId || '—'}｜批准后 agent 重试即放行（一单一执行）`,
        profile: r.profileId || undefined,
        choices: ['approve', 'reject'],
        createdAt: r.createdAt,
        risk: r.risk,
      })
    }
  } catch { /* 执法审批源不可读不阻断其余聚合 */ }

  // fleet 命令审批（agent 工具调用等）
  try {
    const sessions = buildFleetSnapshotFromTap()
    for (const session of sessions ?? []) {
      for (const approval of session.approvals ?? []) {
        items.push({
          id: `fleet:${session.id}:${approval.approval_id}`,
          kind: 'command',
          title: session.title || session.id,
          detail: approval.preview || approval.approval_id,
          sessionId: session.id,
          profile: session.profile,
          choices: approval.choices,
          createdAt: session.lastActiveAt || 0,
          risk: classifyApprovalRisk({ kind: 'command', detail: approval.preview || '', title: session.title }),
          impact: analyzeCommandImpact(approval.preview || ''),
          // 批一 Task 12 复审 I-2：fleet tap 透传的 outcome 绑定同标注（含 autopass 拒绝面）
          ...outcomeAnnotationOf(approval),
        })
      }
    }
  } catch { /* fleet 源不可用（未装配）不阻断其余聚合 */ }

  // 评审域未裁决卡
  try {
    for (const rec of listReviews()) {
      if (rec.verdict) continue
      // 2026-10-03 走查 L3：title/detail 不再拼中文（服务端无 locale 语境，
      // EN 模式漏中文）——title 发纯 ID、detail 发语义 token，本地化交给
      // 前端消费方（ApprovalPanel / GovDocsReviewView 按 kind=review 补前缀）。
      items.push({
        id: `review:${rec.reviewId}`,
        kind: 'review',
        title: rec.taskId ?? rec.reviewId,
        detail: rec.domain === 'baseline' ? `baseline ${rec.baseRef ?? ''}` : 'uncommitted',
        taskId: rec.taskId,
        domain: rec.domain,
        baseRef: rec.baseRef,
        createdAt: rec.createdAt,
        risk: classifyApprovalRisk({ kind: 'review', title: rec.taskId || rec.reviewId, detail: '', domain: rec.domain }),
      })
    }
  } catch { /* review 源不可用不阻断 */ }
  return items
}

// V4.1 抽检器：扫描节流（并发扫描请求不重复放行；1s 内只扫一次）
let lastAutopassScan = 0

/** 低风险自动放行扫描：候选（纯只读命令且过宽限期）执行 once 放行 + 记账入抽检。 */
async function runAutoPassScan(items: PendingItem[]): Promise<number> {
  if (!autopassEnabled()) return 0
  const now = Date.now()
  if (now - lastAutopassScan < 1_000) return 0
  lastAutopassScan = now
  let acted = 0
  for (const item of items) {
    if (!isAutopassCandidate(item, now)) continue
    try {
      if (item.id.startsWith('fleet:')) {
        const rest = item.id.slice('fleet:'.length)
        const sep = rest.indexOf(':')
        if (sep <= 0) continue
        const result = await respondFleetApproval(rest.slice(sep + 1), 'once')
        if (!result.resolved) continue
      } else if (item.id.startsWith('fleetfile:')) {
        if (!writeFleetFileResponse(item.id.slice('fleetfile:'.length), 'once', 'system').ok) continue
      } else {
        continue
      }
      recordAutoPass({ id: item.id, title: item.title, detail: item.detail, profile: item.profile })
      acted++
    } catch { /* 单条放行失败不阻断其余 */ }
  }
  return acted
}

// P0 Task 4（2026-11-05）：自动放行的唯一显式触发点（写命令）。GET 读面零副作用，
// 客户端读函数前置调用本端点； acted=本次扫描实际放行条数（含开关关闭与节流窗口内 0）。
router.post('/autopass/scan', async (ctx) => {
  const acted = await runAutoPassScan(collectPendingItems())
  ctx.body = { ok: true, acted }
})

// 读端点（P0 Task 4）：纯读零副作用——不再内嵌自动放行扫描，低风险项由
// POST /autopass/scan 显式放行后经下一次读取自然消失。
router.get('/pending', async (ctx) => {
  const items = collectPendingItems()
  // V4-N1：高危置顶，同档内按时间新→旧
  const tierOrder: Record<ApprovalRiskTier, number> = { high: 0, medium: 1, low: 2 }
  items.sort((a, b) => (tierOrder[a.risk] - tierOrder[b.risk]) || (b.createdAt - a.createdAt))
  ctx.body = { ok: true, items, ts: Date.now() }
})

// P2 审批汇总单一契约（spec 2026-10-19-studio-p2 §2.3）：同一聚合管线的计数投影——
// 概览/阶段页/收件箱的计数面从此一处取数，不再各自拼装导致口径漂移。
export interface PendingSummary {
  total: number
  command: number
  review: number
  enforce: number
  byRisk: Record<ApprovalRiskTier, number>
  ts: number
}

/** 计数投影（纯函数，测试面）：kind 前缀归域（fleet/fleetfile→command；enf→enforce）。 */
export function summarizePendingItems(items: PendingItem[]): PendingSummary {
  const byRisk: Record<ApprovalRiskTier, number> = { high: 0, medium: 0, low: 0 }
  let command = 0
  let review = 0
  let enforce = 0
  for (const it of items) {
    byRisk[it.risk ?? 'medium']++
    if (it.id.startsWith('enf:')) enforce++
    else if (it.kind === 'review') review++
    else command++
  }
  return { total: items.length, command, review, enforce, byRisk, ts: Date.now() }
}

// 读端点（P0 Task 4）：纯读零副作用，与 /pending 同一聚合管线（spec 2026-10-19-studio-p2 §2.3）。
router.get('/pending-summary', async (ctx) => {
  const items = collectPendingItems()
  ctx.body = { ok: true, ...summarizePendingItems(items) }
})

const FLEET_CHOICES = new Set(['once', 'session', 'always', 'deny'])

/**
 * 双签闸（2026-11-05 收口）：高风险批准须两个不同签署人，或单操作员显式豁免。
 *
 * 返回 false 时已写好 409 响应；返回 true 时若闸适用则已记下本次签署。
 * 开关：AUTONOMY_DUAL_SIGN=off 关闭（默认开；真实审批库 high=0 实测不卡存量）。
 */
function enforceDualSign(
  ctx: Context,
  opts: { targetId: string; risk: string | undefined; decision: string; waiver: unknown },
): boolean {
  const enabled = (process.env.AUTONOMY_DUAL_SIGN ?? '').trim().toLowerCase() !== 'off'
  const actor = actorOf(ctx as never)
  const gate = decideDualSignGate({
    targetId: opts.targetId,
    actor,
    risk: opts.risk,
    decision: opts.decision,
    waiver: typeof opts.waiver === 'string' ? opts.waiver : undefined,
    priorSigners: listDualSignSigners(opts.targetId),
    enabled,
  })
  if (!gate.allow) {
    // 关键语义：被拦下的这次「尝试批准」本身就是第一签——必须落账，
    // 否则第二个人来签时看到的还是 0 签，永远凑不成双签（自锁死）。
    if (gate.applicable) recordDualSignSigner(opts.targetId, actor)
    fail(ctx, 409, gate.reason, {
      code: gate.code,
      extra: {
        signers: gate.signers,
        scope: 'dual-sign 仅覆盖风险档可重算的审批分支（执法门/命令流）；其余分支不判',
      },
    })
    return false
  }
  if (gate.applicable) {
    recordDualSignSigner(opts.targetId, actor)
    if (gate.waived) {
      recordDualSignGap({
        at: Date.now(),
        changeId: opts.targetId,
        klass: 'high-risk-approval',
        signers: gate.signers,
        reason: gate.reason,
        source: 'approval-decide/waiver',
      })
    }
  }
  return true
}

// ── 批一 Task 12：outcome 绑定条目的裁决门（合同门 + owner/verifier 双签门）──
// 适用面：条目源记录携带 outcome_ref 的收件箱条目（deferredfile:/fleetfile:——T11
// gateway pending 与 deferred.json 下发面）。无绑定条目不经本门，行为回归不变。

/** actor（服务端身份 username）→ 合同签署角色映射：people.emails 含 actor（大小写
 *  不敏感）或本地同名（person.name===actor）；owner 先于 verifier。映射失败=null——
 *  该 actor 无权签该条目（不猜：名册缺席/身份对不上都如实拒）。 */
function actorOutcomeRole(actor: string, contract: OutcomeContract): 'owner' | 'verifier' | null {
  const name = actor.trim()
  if (!name) return null
  const lower = name.toLowerCase()
  const seats: Array<[string | undefined, 'owner' | 'verifier']> = [
    [contract.ownerPersonId, 'owner'],
    [contract.verificationOwnerId, 'verifier'],
  ]
  for (const [personId, role] of seats) {
    if (!personId) continue
    let person: { name: string; emails: string[]; active: boolean } | null = null
    try { person = getPerson(personId) } catch { person = null }
    if (!person) continue
    // 复审 M-3：停用名册成员无签署权（activePersonIds 先例——责任座只在 active 名册上）
    if (person.active !== true) continue
    if (person.emails.some((e) => typeof e === 'string' && e.toLowerCase() === lower) || person.name === name) {
      return role
    }
  }
  return null
}

/**
 * outcome 绑定裁决门：contractVersion 与当前合同不符 → 409 `stale_contract`；
 * 批二 Task 2 合同状态门——cancelled/settled 终态不再承接批准类裁决（409
 * `outcome_not_active`，与 dispatch 面对齐），否决类（deny/reject）照常放行（否决
 * 不设门：收紧方向不加门槛，且 deny 不放行命令、无绕行面）；
 * dual_sign_required → owner 与 verifier 两笔不同 actor 顺序批准——第一签（任意一角色）
 * 落签署账后仍 pending（409 `dual-sign-required`），第二签须另一角色且不同 actor 才
 * 放行（同人两票/单签不生效；映射失败 403 `not_outcome_signer`）。否决类决策不设
 * 双签（收紧方向不加门槛）；合同不可读 409 `outcome_unavailable`（fail-closed 不猜）。
 *
 * 返回 false 时已写好 4xx 响应；返回 true 时放行既有 decide 流程（响应照写、历史
 * 落账由调用方带 outcome 引用）。
 */
function enforceOutcomeBinding(
  ctx: Context,
  opts: {
    itemId: string
    actor: string
    decision: string
    outcomeRef: OutcomeRef
    dualSignRequired: boolean
  },
): boolean {
  const { itemId, actor, decision, outcomeRef, dualSignRequired } = opts
  const contract = getContract(outcomeRef.outcomeId)
  if (!contract) {
    fail(ctx, 409, `outcome 合同 ${outcomeRef.outcomeId} 不可读（不存在或坏档已隔离），拒绝裁决`, {
      code: 'outcome_unavailable',
      extra: { outcomeId: outcomeRef.outcomeId },
    })
    return false
  }
  if (contract.version !== outcomeRef.contractVersion) {
    fail(ctx, 409,
      `合同版本已更新（条目绑定 v${outcomeRef.contractVersion} ≠ 当前 v${contract.version}），拒绝旧版本裁决`,
      {
        code: 'stale_contract',
        extra: {
          outcomeId: outcomeRef.outcomeId,
          itemContractVersion: outcomeRef.contractVersion,
          currentContractVersion: contract.version,
        },
      })
    return false
  }
  // 批二 Task 2 合同状态门：cancelled/settled 终态合同不再承接批准类裁决（与 dispatch
  // 面 outcome_not_active 对齐）；否决类（deny/reject）照常放行——否决不设门。
  if ((contract.status === 'cancelled' || contract.status === 'settled')
    && decision !== 'deny' && decision !== 'reject') {
    fail(ctx, 409,
      `outcome 合同 ${outcomeRef.outcomeId} 已${contract.status === 'cancelled' ? '取消' : '结算'}（终态），不再承接批准类裁决`,
      {
        code: 'outcome_not_active',
        extra: { outcomeId: outcomeRef.outcomeId, contractStatus: contract.status },
      })
    return false
  }
  // 否决类不设双签（与 enforceDualSign 同取舍）；非双签格（矩阵 high+one-way 以外）单签即决
  if (!dualSignRequired || decision === 'deny' || decision === 'reject') return true

  const role = actorOutcomeRole(actor, contract)
  if (!role) {
    fail(ctx, 403,
      `签署人 ${actor} 无法映射到合同 ${outcomeRef.outcomeId} 的 owner（${contract.ownerPersonId}）/verifier（${contract.verificationOwnerId}），无权签署该条目`,
      { code: 'not_outcome_signer', extra: { outcomeId: outcomeRef.outcomeId } })
    return false
  }
  // 复审 M-2：签署台账按当前合同版本过滤——合同升级后旧版本签署不凑对（双签
  // 须两笔都核验过当前版本；旧签残留只作历史，不参与判定）。
  const prior = listOutcomeDualSign(itemId).filter((p) => p.contractVersion === contract.version)
  const byRole = (r: 'owner' | 'verifier') => prior.find((p) => p.role === r) ?? null
  const mine = byRole(role)
  const other: 'owner' | 'verifier' = role === 'owner' ? 'verifier' : 'owner'
  const otherRec = byRole(other)
  const rolesNow: Record<string, string | null> = {
    owner: byRole('owner')?.actor ?? (role === 'owner' ? actor : null),
    verifier: byRole('verifier')?.actor ?? (role === 'verifier' ? actor : null),
  }
  if (mine && otherRec) {
    // 双角色已齐（常态在第二签即放行；防台账残留双写重复放行）
    return true
  }
  if (otherRec) {
    // 第二签：另一角色已签——同人两票不生效（actor 跨角色映射的退化名册同样拒）
    if (otherRec.actor === actor) {
      fail(ctx, 409, `双签须两笔不同 actor：${actor} 已以 ${other} 角色签署，不得再签 ${role}`, {
        code: 'dual-sign-required',
        extra: { outcomeId: outcomeRef.outcomeId, signers: prior.map((p) => p.actor), roles: rolesNow },
      })
      return false
    }
    recordOutcomeDualSign(itemId, { role, actor, at: Date.now(), contractVersion: contract.version })
    return true
  }
  if (mine) {
    // 该角色已签（同人重复或同角色另一映射人）：仍 pending，等另一角色
    fail(ctx, 409, `${role} 角色已由 ${mine.actor} 签署，双签仍缺 ${other}——单签/同人两票不生效`, {
      code: 'dual-sign-required',
      extra: {
        outcomeId: outcomeRef.outcomeId,
        signers: prior.map((p) => p.actor),
        roles: rolesNow,
        scope: 'outcome high+one-way 双签：owner 与 verifier 两笔不同 actor 顺序批准',
      },
    })
    return false
  }
  // 第一签（该角色未签）：落签署账后仍 pending——不写响应文件，条目留收件箱待第二签
  recordOutcomeDualSign(itemId, { role, actor, at: Date.now(), contractVersion: contract.version })
  fail(ctx, 409, `双签第一签已记录（${role}=${actor}），待 ${other} 角色第二签后条目才生效`, {
    code: 'dual-sign-required',
    extra: {
      outcomeId: outcomeRef.outcomeId,
      signers: [...prior.map((p) => p.actor), actor],
      roles: rolesNow,
      scope: 'outcome high+one-way 双签：owner 与 verifier 两笔不同 actor 顺序批准',
    },
  })
  return false
}

router.post('/:id/decide', async (ctx) => {
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as { decision?: unknown; note?: unknown; title?: unknown; waiver?: unknown }
  const decision = String(body.decision ?? '')
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined
  const actor = actorOf(ctx as never)
  const id = String(ctx.params.id ?? '')

  if (id.startsWith('enf:')) {
    if (decision !== 'approve' && decision !== 'reject') {
      ctx.status = 400
      ctx.body = { ok: false, detail: '执法审批决策须为 approve|reject' }
      return
    }
    // 2026-11-05 双签闸：先取该批单服务端风险档（判前不落裁决），高风险批准须双签。
    const pendingRec = listPendingEnforceApprovals(500).find((r) => r.id === id)
    if (!enforceDualSign(ctx, {
      targetId: id, risk: pendingRec?.risk, decision, waiver: (body as { waiver?: unknown }).waiver,
    })) return

    // W2 审批口径收口：执法批单走闸门裁决——具名主体必填、发起人不得自批。
    const guarded = decideEnforceApprovalGuarded(id, decision, actor)
    if (guarded.tag === 'error') {
      ctx.status = guarded.code === 'not-found' ? 404 : guarded.code === 'actor-required' ? 401 : 403
      ctx.body = { ok: false, code: guarded.code, detail: guarded.detail }
      return
    }
    const rec = guarded.rec
    if (rec.status === 'pending') {
      ctx.status = 409
      ctx.body = { ok: false, detail: '执法审批单状态异常（仍 pending）' }
      return
    }
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'command', targetId: id,
      targetTitle: `执法门·${rec.tool}`, decision, note, risk: rec.risk,
    })
    ctx.body = { ok: true, entry }
    return
  }

  if (id.startsWith('fleet:')) {
    const rest = id.slice('fleet:'.length)
    const sep = rest.indexOf(':')
    if (sep <= 0 || !FLEET_CHOICES.has(decision)) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'fleet 决策须为 once|session|always|deny，id 形如 fleet:<sessionId>:<approvalId>' }
      return
    }
    const sessionId = rest.slice(0, sep)
    const approvalId = rest.slice(sep + 1)
    // V4-N1：裁决前服务端重算风险档入台账（不信客户端自报档位）
    let risk: ApprovalRiskTier | undefined
    let fleetOutcomeRef: OutcomeRef | undefined
    let fleetDualSign = false
    // 批二 Task 2：快照读取瞬态失败不再退风险档闸放行（旧路径 risk 留空→双签闸
    // 不适用=无门直放 fail-open）。绑定不可证（快照抛错/条目不在快照/绑定字段读不
    // 出解不出）按「有绑定但不可证」处理：批准类 409 outcome_unavailable（宁可 409
    // 不放行，不猜）；否决类照常放行（否决不设门，deny 不放行命令、无绕行面）。
    let fleetUnverified = false
    try {
      const sessions = buildFleetSnapshotFromTap()
      const sess = sessions?.find((s) => s.id === sessionId)
      const appr = sess?.approvals?.find((a) => a.approval_id === approvalId)
      if (appr) {
        risk = classifyApprovalRisk({ kind: 'command', detail: appr.preview || '', title: sess?.title })
        fleetOutcomeRef = parseOutcomeRef(appr.outcome_ref)
        fleetDualSign = appr.dual_sign_required === true
        fleetUnverified = outcomeRefUnverified(appr)
      } else {
        // 条目不在快照（事件窗旋转/瞬态）——绑定状态不可证，批准类不放行
        fleetUnverified = true
      }
    } catch {
      fleetUnverified = true
    }
    if (fleetUnverified && decision !== 'deny') {
      fail(ctx, 409,
        `fleet 审批 ${approvalId} 的 outcome 绑定不可证（tap 快照读取异常或条目不在快照），拒绝批准类裁决`,
        {
          code: 'outcome_unavailable',
          extra: { approvalId, sessionId, scope: '绑定不可证时宁可 409，不退风险档闸猜' },
        })
      return
    }
    // 批一 Task 12 复审 I-2：outcome 绑定条目（tap 透传 outcome_ref）以合同门为权威
    // ——角色绑定双签强于风险档双签，绑定条目不再叠 risk-tier 闸（防双闸复合把双签
    // 拖成三请求）；未绑定条目照旧走风险档闸。
    if (fleetOutcomeRef) {
      if (!enforceOutcomeBinding(ctx, {
        itemId: id, actor, decision, outcomeRef: fleetOutcomeRef, dualSignRequired: fleetDualSign,
      })) return
    } else if (!enforceDualSign(ctx, {
      targetId: id, risk, decision, waiver: (body as { waiver?: unknown }).waiver,
    })) return

    const result = await respondFleetApproval(approvalId, decision)
    if (!result.resolved) {
      ctx.status = 409
      ctx.body = result
      return
    }
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'command', targetId: approvalId,
      targetTitle: `${sessionId} · ${approvalId}`, decision, note, risk,
      ...(fleetOutcomeRef ? { outcomeRef: { outcomeId: fleetOutcomeRef.outcomeId, contractVersion: fleetOutcomeRef.contractVersion } } : {}),
    })
    ctx.body = { ok: true, entry }
    return
  }

  if (id.startsWith('mx:')) {
    const eid = id.slice('mx:'.length)
    if (!eid || !FLEET_CHOICES.has(decision)) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'mx 决策须为 once|session|always|deny，id 形如 mx:<eid>' }
      return
    }
    // 幂等闸①：Matrix 反应通道已批（approved.events 在案）——一次定音，禁双通道重批
    if (mxDecidedEids().has(eid)) {
      ctx.status = 409
      ctx.body = { ok: false, detail: '该审批已经 Matrix 反应通道裁决（approved.events 在案），一次定音' }
      return
    }
    const found = findMxEntry(eid)
    if (!found) {
      ctx.status = 404
      ctx.body = { ok: false, detail: '审批请求不在 mx 通道（已裁决或不存在）' }
      return
    }
    // 幂等闸②：本通道已批（响应文件在）
    const respFile = join(found.dir, 'mx-responses', `${mxSafeEid(eid)}.json`)
    if (existsSync(respFile)) {
      ctx.status = 409
      ctx.body = { ok: false, detail: '该审批已经收件箱裁决（响应文件在案），一次定音' }
      return
    }
    // 批一 Task 12 复审 I-2：outcome 绑定条目走同一合同门＋owner/verifier 双签门
    // （第一签仍 pending 不写响应；单签不得绕版本门）。
    // 批二 Task 2：绑定线索在但解不出 → 「有绑定但不可证」，批准类 409（deny 放行）。
    const mxOutcomeRef = parseOutcomeRef(found.entry.outcome_ref)
    if (decision !== 'deny' && outcomeRefUnverified(found.entry)) {
      fail(ctx, 409, `mx 审批 ${eid} 的 outcome 绑定不可读（引用形状不合法），拒绝批准类裁决`, {
        code: 'outcome_unavailable',
        extra: { eid },
      })
      return
    }
    if (mxOutcomeRef && !enforceOutcomeBinding(ctx, {
      itemId: id, actor, decision, outcomeRef: mxOutcomeRef,
      dualSignRequired: found.entry.dual_sign_required === true,
    })) return
    mkdirSync(join(found.dir, 'mx-responses'), { recursive: true })
    atomicWriteJson(respFile, { request_id: eid, decision, decided_at: Date.now(), actor, channel: 'inbox' })
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'command', targetId: eid,
      targetTitle: note || eid, decision, note,
      ...(mxOutcomeRef ? { outcomeRef: { outcomeId: mxOutcomeRef.outcomeId, contractVersion: mxOutcomeRef.contractVersion } } : {}),
    })
    ctx.body = { ok: true, entry }
    return
  }

  if (id.startsWith('deferredfile:')) {
    const deferredId = id.slice('deferredfile:'.length)
    const choice = decision === 'deny' ? 'deny' : decision === 'once' || decision === 'always' || decision === 'session' ? 'once' : ''
    if (!choice) {
      fail(ctx, 400, 'deferredfile 决策须为 once|deny')
      return
    }
    // 批一 Task 12：outcome 绑定条目先过合同门（stale 409）＋owner/verifier 双签门
    // （第一签落账仍 pending，不写响应文件；无绑定条目不经本门，行为回归不变）。
    // 复审 I-1：已答条目（响应文件在）先到先得——先于双签门报「已裁决」，
    // 防已决条目仍报「待第二签」误导（deny 即决后补签不得翻盘）。
    if (deferredResponseExists(deferredId)) {
      fail(ctx, 404, '延迟审批已裁决（响应文件在案，先到先得），不得覆盖')
      return
    }
    const dRec = findDeferredRecord(deferredId)
    const dOutcomeRef = parseOutcomeRef(dRec?.outcome_ref)
    // 批二 Task 2：绑定线索在但解不出 → 「有绑定但不可证」，批准类 409（deny 放行）。
    if (choice !== 'deny' && outcomeRefUnverified(dRec)) {
      fail(ctx, 409, `延迟审批 ${deferredId} 的 outcome 绑定不可读（引用形状不合法），拒绝批准类裁决`, {
        code: 'outcome_unavailable',
        extra: { deferredId },
      })
      return
    }
    if (dOutcomeRef && !enforceOutcomeBinding(ctx, {
      itemId: id, actor, decision: choice, outcomeRef: dOutcomeRef,
      dualSignRequired: dRec?.dual_sign_required === true,
    })) return
    if (!writeDeferredResponse(deferredId, choice, actor)) {
      fail(ctx, 404, '延迟审批不在账本（已裁决/已过期/不存在）')
      return
    }
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'command', targetId: deferredId,
      targetTitle: note || deferredId, decision: choice, note,
      ...(dOutcomeRef ? { outcomeRef: { outcomeId: dOutcomeRef.outcomeId, contractVersion: dOutcomeRef.contractVersion } } : {}),
    })
    ok(ctx, { entry })
    return
  }

  if (id.startsWith('fleetfile:')) {
    const requestId = id.slice('fleetfile:'.length)
    if (!FLEET_CHOICES.has(decision)) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'fleetfile 决策须为 once|session|always|deny' }
      return
    }
    // 批一 Task 12：outcome 绑定条目走同一门（gateway data 经 worker 插件入队携带 outcome_ref）。
    // 复审 I-1：已答条目（响应文件在）先到先得——先于双签门报「已裁决」，防翻盘窗。
    const qDir = queueDirOfRequest(requestId)
    if (qDir && existsSync(join(qDir, 'responses', `${requestId}.json`))) {
      ctx.status = 404
      ctx.body = { ok: false, detail: '该审批已裁决（响应文件在案，先到先得），不得覆盖' }
      return
    }
    const qEntry = findQueueEntry(requestId)
    const qOutcomeRef = parseOutcomeRef(qEntry?.outcome_ref)
    // 批二 Task 2：绑定线索在但解不出 → 「有绑定但不可证」，批准类 409（deny 放行）。
    if (decision !== 'deny' && outcomeRefUnverified(qEntry)) {
      fail(ctx, 409, `审批 ${requestId} 的 outcome 绑定不可读（引用形状不合法），拒绝批准类裁决`, {
        code: 'outcome_unavailable',
        extra: { requestId },
      })
      return
    }
    if (qOutcomeRef && !enforceOutcomeBinding(ctx, {
      itemId: id, actor, decision, outcomeRef: qOutcomeRef,
      dualSignRequired: qEntry?.dual_sign_required === true,
    })) return
    // 响应文件带 digest 绑定（worker 侧校验 request_id+digest，宿主再校验一次）；
    // writeFleetFileResponse 内另有已答幂等拒绝（并发双写兜底）。
    if (!writeFleetFileResponse(requestId, decision, actor).ok) {
      ctx.status = 404
      ctx.body = { ok: false, detail: '审批请求不在队列（已超时或不存在）' }
      return
    }
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'command', targetId: requestId,
      targetTitle: note || requestId, decision, note,
      ...(qOutcomeRef ? { outcomeRef: { outcomeId: qOutcomeRef.outcomeId, contractVersion: qOutcomeRef.contractVersion } } : {}),
    })
    ctx.body = { ok: true, entry }
    return
  }

  if (id.startsWith('kanban:')) {
    // 看板审批：状态迁移由看板 API 完成，这里只落历史（客户端先 decide 再 patch）
    const targetId = id.slice('kanban:'.length)
    if (!targetId || (decision !== 'approve' && decision !== 'request_changes')) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'kanban 决策须为 approve|request_changes，id 形如 kanban:<taskId>' }
      return
    }
    const targetTitle = typeof body.title === 'string' ? body.title.slice(0, 200) : (note || targetId)
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'kanban', targetId,
      targetTitle, decision, note,
      risk: classifyApprovalRisk({ kind: 'kanban', title: targetTitle }),
    })
    ctx.body = { ok: true, entry }
    return
  }

  if (id.startsWith('review:')) {
    const reviewId = id.slice('review:'.length)
    if (!isReviewVerdict(decision) || decision === 'comment') {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'review 决策须为 approve|request_changes' }
      return
    }
    const rec = loadReview(reviewId)
    if (!rec) {
      ctx.status = 404
      ctx.body = { ok: false, detail: '评审不存在或已归档' }
      return
    }
    if (rec.verdict) {
      ctx.status = 409
      ctx.body = { ok: false, detail: '该评审已裁决（一次定音）' }
      return
    }
    const verdict = decision as ReviewVerdict
    const updated = setVerdict(reviewId, verdict, note, actor)
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'review', targetId: reviewId,
      targetTitle: rec.taskId || reviewId, decision: verdict, note,
      risk: classifyApprovalRisk({ kind: 'review', title: rec.taskId || reviewId, domain: rec.domain, detail: rec.baseRef }),
    })
    ctx.body = { ok: true, review: updated, entry }
    return
  }

  // HumanGate 批准单（2026-10-31 活体验证补路由）：listHumanGatePending 把批准单投进
  // 收件箱（kind=review），但 decide 端点此前无 hgate: 分支——UI 批准按钮落 400
  // 「id 前缀须为 fleet: 或 review:」，strict 真人链在收件箱侧断点（实拍实录：
  // 点击成功却无历史记录，回落驱动 decide 才落账）。裁决走 human-gate store 权威
  // decide（appendApprovalLog＋HUMAN_GATE_EVENTS 投影同源，single source）。
  if (id.startsWith('hgate:')) {
    // 2026-10-31 恢复轮随批 K19 收敛：新块一律走 lib/http（fail/ok），存量键名不改
    if (decision !== 'approve' && decision !== 'reject') {
      fail(ctx, 400, 'hgate 决策须为 approve|reject')
      return
    }
    try {
      const req = humanGateDecide(id, decision, actor, note)
      if (!req) {
        fail(ctx, 404, '批准单不存在或已裁决')
        return
      }
      ok(ctx, { request: req, ...(req.warnings ? { warnings: req.warnings } : {}) })
    } catch (error) {
      const e = error as Error & { status?: number; code?: string }
      fail(ctx, e.status ?? 500, e.message, e.code ? { code: e.code } : {})
    }
    return
  }

  ctx.status = 400
  ctx.body = { ok: false, detail: 'id 前缀须为 fleet: / review: / hgate:' }
})

router.get('/history', async (ctx) => {
  const limit = Number(ctx.query.limit ?? 50)
  // targetId（2026-11-04 N02）：按审批对象精确反查，过滤在截断之前——台账增长后
  // 「最近 N 条」窗口会把目标记录挤出去，造成「未落账」误判。
  const targetId = typeof ctx.query.targetId === 'string' ? ctx.query.targetId : undefined
  ctx.body = {
    ok: true,
    entries: queryApprovalLog(Number.isFinite(limit) ? limit : 50, targetId),
  }
})

// 审批决策日志前向链校验（AGT 吸收轮 B，2026-10-21）：防篡改对账——改写历史/
// 删除中插/伪造追加在断点现形；CAP 裁剪/前链时代记录如实标注，不算篡改。
router.get('/history/chain', async (ctx) => {
  try {
    ctx.body = { ok: true, ...verifyApprovalChain() }
  } catch (e) {
    fail(ctx, 500, e instanceof Error ? e.message : String(e))
  }
})

// ── 2026-10-04 影响面预览（Blast Radius）：任意命令的破坏性影响面解析 ──
// pending 聚合已内嵌 impact；本端点供聊天侧审批卡等消费方按需取（纯解析无 IO）。
router.post('/impact-preview', async (ctx) => {
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as { command?: unknown }
  const command = typeof body.command === 'string' ? body.command.slice(0, 2000) : ''
  if (!command.trim()) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'command 必填（待解析的完整 shell 命令）' }
    return
  }
  ctx.body = { ok: true, command, impact: analyzeCommandImpact(command) }
})

// ── V4.1 §七 抽检器端点：低风险自动放行的事后回看与处置 ──

router.get('/spotcheck', async (ctx) => {
  const limit = Number(ctx.query.limit ?? 20)
  const n = Number.isFinite(limit) ? limit : 20
  ctx.body = { ok: true, items: listOpenSpotchecks(n), resolved: listResolvedSpotchecks(n) }
})

router.post('/spotcheck/:id/resolve', async (ctx) => {
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as { verdict?: unknown; note?: unknown }
  const verdict = String(body.verdict ?? '')
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined
  if (verdict !== 'confirm' && verdict !== 'veto') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'verdict 须为 confirm|veto' }
    return
  }
  const item = resolveSpotcheck(String(ctx.params.id ?? ''), verdict, actorOf(ctx as never), note)
  if (!item) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '抽检项不存在或已处置（一次定音）' }
    return
  }
  ctx.body = { ok: true, item }
})

/** 仅测试用：清空自动放行扫描节流（并发用例各自独立计时）。 */
export function _resetAutopassScanThrottleForTests(): void {
  lastAutopassScan = 0
}

// HumanGate 前置批准路由子挂载（run22 复盘②）：与收件箱同一 /api/approvals 前缀，
// 免改上游挂载 patch——human-gate 创建/列表/裁决三端点随 approvalsRoutes 一体上线。
// 2026-10-22 走查批：改 '/human-gate' 路径挂载＋子路由无前缀（原绝对前缀嵌套=双前缀 404）。
router.use('/human-gate', humanGateRouter.routes(), humanGateRouter.allowedMethods())
export const approvalsRoutes = router
