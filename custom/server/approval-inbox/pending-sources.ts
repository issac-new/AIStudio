/**
 * 人工审批收件箱·待审聚合共享读模块（批三 T3，spec 2026-11-21-ai-native-orgworkbench-batch3 D3）。
 *
 * 从 pending-controller.ts 原样提取（行为零变化，既有测试套件即回归锁）：
 * collectPendingItems() 五源聚合（文件队列 / deferred / HumanGate / mx 通道 / 执法审批
 * ＋ fleet tap / 评审卡）及其私有读函数、形状解析常量。提取动机：决策议程
 * （orgworkbench/agenda.ts）复用同一聚合——单一事实源，五源读取逻辑不复制第二份。
 *
 * 归属边界：本文件只放「读」——decide 裁决、响应回写、双签闸等写面仍在 controller。
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { buildFleetSnapshotFromTap } from '../services/hermes/fleet-tap'
import { listReviews } from '../review/review-store'
import { classifyApprovalRisk, type ApprovalRiskTier } from './risk-tier'
import { analyzeCommandImpact, type CommandImpact } from './impact-preview'
import { listPendingEnforceApprovals } from '../toolpipeline/enforce-approvals'
import { listHumanGatePending } from './human-gate'
import { hermesHome } from '../lib/paths'

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
export function parseOutcomeRef(v: unknown): OutcomeRef | undefined {
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
export function outcomeRefUnverified(rec: { outcome_ref?: unknown; outcome_unverified?: boolean } | null | undefined): boolean {
  if (!rec) return false
  if (rec.outcome_unverified === true) return true
  return rec.outcome_ref != null && parseOutcomeRef(rec.outcome_ref) === undefined
}

// ── studio-file 审批传输队列（fleet 命令审批 live 源，patch 490 + 插件配套）──
// worker 插件把（已脱敏）审批请求追加 <HERMES_HOME>/approvals/queue.jsonl 并轮询
// responses/<request_id>.json；本端读队列、写响应。无响应文件且未超时 = 待审。
export interface FileQueueEntry {
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

export function approvalsDirs(): string[] {
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

export function readPendingFileQueue(): PendingItem[] {
  const outAll: PendingItem[] = []
  for (const dir of approvalsDirs()) outAll.push(...readOneQueue(dir))
  return outAll
}

// ── 延迟工具调用审批源（Always-on Agents P6，2026-11-16）──
// 审批超时的挂起记录落 <HERMES_HOME>/approvals/deferred.json；本端只列 pending，
// 裁决写 responses/<request_id>.json（gateway watcher 轮询后唤醒原会话）。
export interface DeferredRecord {
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

export function readDeferredQueue(): PendingItem[] {
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

// ── mx 审批通道（backlog ③ 审批面统一·产品侧读+裁决，2026-10-06）──
// harness（Matrix/推演）审批请求经 <approvals>/mx-requests.jsonl 入队（每行
// {eid,title,detail,sessionId?,profile?,createdAt}，eid=Matrix $event_id 全局幂等锚）；
// 裁决走 mx: decide 分支写 mx-responses/<safe-eid>.json（tmp+rename 原子，与
// fleetfile 同款），harness 侧轮询消费（③b）。防双通道重批三重幂等闸：
// ①approved.events 行首 eid 命中（Matrix 反应通道已批）②mx-responses 响应文件在
// （本通道已批）③decide 分支二次复核（读路径与裁决路径同口径）。
export interface MxRequestEntry {
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
export function mxSafeEid(eid: string): string {
  return eid.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** approved.events 各目录已裁决 eid 集（行首请求 eid 列；读失败=空集不阻断） */
export function mxDecidedEids(): Set<string> {
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
export function readMxApprovalChannel(): PendingItem[] {
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

/** 待审聚合三源合并（不排序；供 pending 路由与自动放行扫描共用）。 */
export function collectPendingItems(): PendingItem[] {
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
