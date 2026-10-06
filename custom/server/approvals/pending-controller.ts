/**
 * 人工审批收件箱 REST（/api/approvals/*）——P1 §二（2026-09-28 产品 UI 缺陷修复）。
 *
 * GET  /api/approvals/pending            待审聚合（fleet 命令审批 + 评审域未裁决）
 * POST /api/approvals/:id/decide         就地裁决（id 前缀路由到对应域，决策落历史）
 * GET  /api/approvals/history?limit=50   决策历史（时间+操作人+对象+结果）
 * GET  /api/approvals/spotcheck          待抽检清单（低风险自动放行的事后回看）
 * POST /api/approvals/spotcheck/:id/resolve  抽检处置（confirm 认可 / veto 误放行回灌）
 *
 * V4.1 §七 抽检器（2026-09-29）：pending 聚合前先跑低风险自动放行（autopass.ts，
 * 纯只读命令过宽限期自动 once 放行 + 确定性抽检入队），人审聚焦 high/medium。
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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { buildFleetSnapshotFromTap, respondFleetApproval } from '../services/hermes/fleet-tap'
import { loadReview, setVerdict, listReviews } from '../review/review-store'
import { isReviewVerdict, type ReviewVerdict } from '../review/review-store'
import { appendApprovalLog, queryApprovalLog } from './approval-log'
import { classifyApprovalRisk, type ApprovalRiskTier } from './risk-tier'
import { autopassEnabled, isAutopassCandidate, recordAutoPass, listOpenSpotchecks, listResolvedSpotchecks, resolveSpotcheck } from './autopass'
import { analyzeCommandImpact, type CommandImpact } from './impact-preview'

const router = new Router({ prefix: '/api/approvals' })

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
}

function approvalsDirs(): string[] {
  // 队列目录集：显式 env > 根 home + 全部 profile home（worker 的 HERMES_HOME
  // 是 profile home，传输按其入队——studio 侧全扫聚合，decide 回写同目录）。
  const env = process.env.HERMES_APPROVALS_QUEUE_DIR?.trim()
  if (env) return [env]
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
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
      })
    }
  }
  return out
}

/** mx 请求所在目录（decide 回写响应用）；找不到 = null。 */
function mxRequestDirOf(eid: string): string | null {
  for (const dir of approvalsDirs()) {
    const queue = join(dir, 'mx-requests.jsonl')
    try {
      for (const line of readFileSync(queue, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          if ((JSON.parse(trimmed) as MxRequestEntry).eid === eid) return dir
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
  mkdirSync(respDir, { recursive: true })
  const file = join(respDir, `${requestId}.json`)
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify({ request_id: requestId, digest, choice, decided_at: Date.now(), actor }), 'utf8')
  renameSync(tmp, file)
  return { ok: true }
}

/** 待审聚合三源合并（不排序；供 pending 路由与自动放行扫描共用）。 */
function collectPendingItems(): PendingItem[] {
  const items: PendingItem[] = []
  // 文件队列源（patch 490 unattended 传输；读失败不阻断其余聚合）
  try { items.push(...readPendingFileQueue()) } catch { /* 队列不可读忽略 */ }

  // mx 通道源（backlog ③：Matrix/harness 审批事件翻成 PendingItem，eid 幂等防双通道重批）
  try { items.push(...readMxApprovalChannel()) } catch { /* mx 通道不可读忽略 */ }

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

// V4.1 抽检器：扫描节流（并发 pending 查询不重复放行；1s 内只扫一次）
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

router.get('/pending', async (ctx) => {
  const pre = collectPendingItems()
  // V4.1 抽检器：聚合前先放行低风险项（放行后重取，人审只看 high/medium）
  const acted = await runAutoPassScan(pre)
  const items = acted > 0 ? collectPendingItems() : pre

  // V4-N1：高危置顶，同档内按时间新→旧
  const tierOrder: Record<ApprovalRiskTier, number> = { high: 0, medium: 1, low: 2 }
  items.sort((a, b) => (tierOrder[a.risk] - tierOrder[b.risk]) || (b.createdAt - a.createdAt))
  ctx.body = { ok: true, items, ts: Date.now() }
})

const FLEET_CHOICES = new Set(['once', 'session', 'always', 'deny'])

router.post('/:id/decide', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { decision?: unknown; note?: unknown; title?: unknown }
  const decision = String(body.decision ?? '')
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined
  const actor = actorOf(ctx as never)
  const id = String(ctx.params.id ?? '')

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
    try {
      const sessions = buildFleetSnapshotFromTap()
      const sess = sessions?.find((s) => s.id === sessionId)
      const appr = sess?.approvals?.find((a) => a.approval_id === approvalId)
      if (appr) risk = classifyApprovalRisk({ kind: 'command', detail: appr.preview || '', title: sess?.title })
    } catch { /* 快照不可用则档位留空，不阻断裁决 */ }
    const result = await respondFleetApproval(approvalId, decision)
    if (!result.resolved) {
      ctx.status = 409
      ctx.body = result
      return
    }
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'command', targetId: approvalId,
      targetTitle: `${sessionId} · ${approvalId}`, decision, note, risk,
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
    const dir = mxRequestDirOf(eid)
    if (!dir) {
      ctx.status = 404
      ctx.body = { ok: false, detail: '审批请求不在 mx 通道（已裁决或不存在）' }
      return
    }
    // 幂等闸②：本通道已批（响应文件在）
    const respFile = join(dir, 'mx-responses', `${mxSafeEid(eid)}.json`)
    if (existsSync(respFile)) {
      ctx.status = 409
      ctx.body = { ok: false, detail: '该审批已经收件箱裁决（响应文件在案），一次定音' }
      return
    }
    mkdirSync(join(dir, 'mx-responses'), { recursive: true })
    const tmp = `${respFile}.tmp-${process.pid}-${Date.now()}`
    writeFileSync(tmp, JSON.stringify({ request_id: eid, decision, decided_at: Date.now(), actor, channel: 'inbox' }), 'utf8')
    renameSync(tmp, respFile)
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'command', targetId: eid,
      targetTitle: note || eid, decision, note,
    })
    ctx.body = { ok: true, entry }
    return
  }

  if (id.startsWith('fleetfile:')) {
    const requestId = id.slice('fleetfile:'.length)
    if (!FLEET_CHOICES.has(decision)) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'fleetfile 决策须为 once|session|always|deny' }
      return
    }
    // 响应文件带 digest 绑定（worker 侧校验 request_id+digest，宿主再校验一次）
    if (!writeFleetFileResponse(requestId, decision, actor).ok) {
      ctx.status = 404
      ctx.body = { ok: false, detail: '审批请求不在队列（已超时或不存在）' }
      return
    }
    const entry = await appendApprovalLog({
      id, actor, targetKind: 'command', targetId: requestId,
      targetTitle: note || requestId, decision, note,
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

  ctx.status = 400
  ctx.body = { ok: false, detail: 'id 前缀须为 fleet: 或 review:' }
})

router.get('/history', async (ctx) => {
  const limit = Number(ctx.query.limit ?? 50)
  ctx.body = { ok: true, entries: queryApprovalLog(Number.isFinite(limit) ? limit : 50) }
})

// ── 2026-10-04 影响面预览（Blast Radius）：任意命令的破坏性影响面解析 ──
// pending 聚合已内嵌 impact；本端点供聊天侧审批卡等消费方按需取（纯解析无 IO）。
router.post('/impact-preview', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { command?: unknown }
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
  const body = (ctx.request.body ?? {}) as { verdict?: unknown; note?: unknown }
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

export const approvalsRoutes = router
