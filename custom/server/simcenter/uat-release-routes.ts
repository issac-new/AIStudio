// simcenter UAT/发布门路由（v0.4 第五批拆分，来自 simcenter-controller，行为不变）。
/**
 * 推演中心控制器族（三中心重构·波 1 服务端契约先行件，X1）——11 端点，前缀 /api/hermes/sim。
 *
 * 定位：推演中心六签的只读/聚合数据面。合并铁律=正身不复制——run-state 解析语义
 * 正身在 observability（631），派发器健康正身在 hermes-agent（634），休眠工作者探针
 * 正身在 hermes-agent（635），本族只做透传/只读/聚合/唯一一次实现的新语义（分支
 * 新鲜度三态）。契约正本=《2026-10-16-sim-center-detailed-design.md》数据契约汇总表。
 *
 * 端点清单（数据源｜铁律）：
 *   GET  /run-state?run=        observability 纯函数透传（同 state.env/TSV）｜正身 631
 *   GET  /journal?run=&tail=    runs/<run>/workflow-journal.ndjson 尾部 N 行｜只读
 *   GET  /topology              四服务 /health 探测（SIM_TOPOLOGY_ENDPOINTS 可覆盖）｜探测代理
 *   GET  /dispatcher-health     SIM_DISPATCHER_HEALTH_CLI 包一层（timeout 10s/1MB）｜正身 634
 *   GET  /sleeping-workers      SIM_SLEEPING_WORKERS_CLI 同上模式｜正身 635
 *   GET  /deliverables?run=     evidence/ 13 类交付物核对（§2.7 清单，宽松匹配）｜聚合
 *   GET  /branches?run=         git for-each-ref+rev-parse 比对+新鲜度三态｜branch_fresh 唯一实现
 *   GET  /anchor?id=            四类锚反查（$/commit/t_/!）｜聚合
 *   GET  /trace?run=            冻结单 AC+测试报告+验收书判词四列｜聚合，缺席如实 null
 *   POST /evidence/mark         证据标记写入：evidence/message-marks.jsonl append｜强校验+穿越防护
 *   GET  /issues?run=           issues.log（run 根或 evidence/ 两处）ISSUE/DISP 解析｜只读聚合
 *   GET  /quality?run=          mutation-score.json+dup-ratio.json 只读聚合｜E/F 件，缺席如实
 *   GET  /uat-verdicts?run=     UAT 判定台账按 AC 聚合（最新+历史+阻断）｜状态机读模型
 *   POST /uat-verdict           UAT 逐 AC 判定（conditional/reject 必填 note）｜append-only
 *   GET  /release-gate?run=     G5 发布门状态机读模型（state/history/allowedActions/can）｜派生
 *   GET  /release-gate/state    GET /release-gate 别名（显式 state 读面）
 *   POST /release-gate          G5 状态迁移 submit/approve/reject/release｜409 非法迁移+幂等
 *   GET  /observer/overview     日常侧推演观察（2026-10-21 挂账实施轮）：当前 SIM run 的
 *                               房间键 + 跨板任务只读聚合（复用 kanban-overview sqlite 快道，
 *                               kanbanDir 指向 SIM hermes）｜fail-soft：SIM 根缺席=available:false
 *
 * 配置（env，单一配置源）：OBS_SIM_ROOT（与 631 同一 env；缺席=503 fail-closed——
 * 生产不开 env 即关，不读任意磁盘路径）；SIM_TOPOLOGY_ENDPOINTS/SIM_DISPATCHER_HEALTH_CLI/
 * SIM_SLEEPING_WORKERS_CLI/SIM_BRANCHES_REPO/SIM_BRANCH_GRACE_MS/SIM_ANCHOR_REPO/SIM_KANBAN_API
 * 为各端点专用门（缺席按各端点 fail-closed/fail-soft 语义处理）。
 * run 参数一律 /^[A-Za-z0-9_.-]{1,64}$/（该字符集仍放行 '..'——路径穿越由
 * safeRunDir 的 resolve+startsWith 二道闸拦）；外部子进程/fetch 全带超时与体积上限，
 * 错误摘要截断 ≤200 字符不外泄整段 stderr。
 * 挂载：B 类 patch 638（bootstrap/routes.ts，同 631/636 模式）。
 */
import type { Context } from 'koa'
import Router from '@koa/router'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, sep } from 'node:path'
import { gateKeys, ledgerSummary, parseStateEnv, stepKeys } from '../observability/observability-controller'
import {
  RELEASE_ACTIONS, RELEASE_ALLOWED, actionOfRecord, applyReleaseAction,
  deriveReleaseState, releasePermissions, validateReleaseActionInput,
  type ReleaseAction, type ReleaseDecision, type ReleaseGateRecord,
} from './release-state'
import {
  UAT_VERDICT_LABEL, aggregateUatByAc, validateUatVerdictFields,
  type UatVerdictKey, type UatVerdictRecord,
} from './uat-state'
import { createKanbanOverview } from '../services/hermes/kanban-overview'
import { fail } from '../lib/http'

import { isValidRun, safeRunDir, simRootOrNull, observerSimRootOrNull, currentRunOf } from './observer-root'
import { ERR_CLIP, clip, gateClosed, readCapped } from './shared'
const execFileP = promisify(execFile)

// ── 9b. UAT 判定台账：run 绑定的人工判定持久化（spec 2026-10-21-g5-uat-state-machine §2） ──
// 类型/标签/聚合纯函数正身在 uat-state.ts；此处保留历史导出面（TracePanel 等消费者不迁移）。

export { UAT_VERDICT_LABEL }
export type { UatVerdictKey, UatVerdictRecord }

/** UAT 判定入参强校验（纯函数）：run 校验 + uat-state 字段校验（conditional 需 note + acknowledged|pending 二选一；reject 需 note）。 */
export function validateUatVerdict(body: unknown):
  { ok: true; run: string; ac: string; verdict: UatVerdictKey; note?: string; acknowledged?: boolean; pending?: boolean } | { ok: false; error: string } {
  const b = body as { run?: unknown } | undefined
  const run = typeof b?.run === 'string' ? b.run : ''
  if (!isValidRun(run)) return { ok: false, error: 'run 参数非法' }
  const fields = validateUatVerdictFields(body)
  if (!fields.ok) return fields
  return {
    ok: true, run, ac: fields.ac, verdict: fields.verdict,
    ...(fields.note ? { note: fields.note } : {}),
    ...(fields.acknowledged ? { acknowledged: true } : {}),
    ...(fields.pending ? { pending: true } : {}),
  }
}

/** 台账落位（穿越防护同 evidence/mark）：runs/<run>/evidence/uat-verdicts.jsonl。 */
export function safeUatLedgerFile(root: string, run: string): string | null {
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  const evidDir = resolve(runDir, 'evidence')
  const file = resolve(evidDir, 'uat-verdicts.jsonl')
  return file.startsWith(evidDir + sep) ? file : null
}

/** 读台账（缺file→null）；坏行跳过（append-only jsonl 容错读）。 */
export function readUatLedger(root: string, run: string): { file: string; records: UatVerdictRecord[] } | null {
  const file = safeUatLedgerFile(root, run)
  if (!file || !existsSync(file)) return null
  const records: UatVerdictRecord[] = []
  for (const ln of (readCapped(file) ?? '').split('\n')) {
    if (!ln.trim()) continue
    try {
      const r = JSON.parse(ln) as UatVerdictRecord
      if (r && typeof r.ac === 'string' && (r.verdict === 'pass' || r.verdict === 'conditional' || r.verdict === 'reject')) {
        records.push(r)
      }
    } catch { /* 坏行丢弃 */ }
  }
  return { file, records }
}

/** 人工判定合并（纯函数）：同一 AC 取 ts 最新的人工记录，label 覆盖 uatVerdict。 */
export function mergeUatVerdicts(
  rows: Array<{ ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }>,
  records: UatVerdictRecord[],
): Array<{ ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }> {
  const latest = new Map<string, UatVerdictRecord>()
  for (const r of records) {
    const prev = latest.get(r.ac)
    if (!prev || Date.parse(r.ts) >= Date.parse(prev.ts)) latest.set(r.ac, r)
  }
  const byAc = new Map(rows.map(r => [r.ac, r]))
  // 台账行不回填为 AC 行——三源全缺席时 trace 整表空属正常（如实呈现）；
  // 台账数据由 /uat-verdicts 独立端点供给 UAT 页签（spec 2026-10-19-studio-p2 §2.1）。
  const out = rows.map(row => {
    const hit = latest.get(row.ac)
    return hit ? { ...row, uatVerdict: UAT_VERDICT_LABEL[hit.verdict] } : row
  })
  // 台账内 ac 不在三源行集合的，附加为"台账补行"（criterion=null）——
  // 保证人工判定面不丢条目，同时不冒充三源提取。
  const extra: Array<{ ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }> = []
  for (const [ac, rec] of latest) {
    if (byAc.has(ac)) continue
    extra.push({ ac, criterion: null, caseResult: null, uatVerdict: UAT_VERDICT_LABEL[rec.verdict] })
  }
  extra.sort((a, b) => Number(a.ac.replace(/^AC-/i, '')) - Number(b.ac.replace(/^AC-/i, '')))
  return [...out, ...extra]
}

function actorOf(ctx: Context): string {
  const user = (ctx.state as { user?: { username?: string } } | undefined)?.user
  return typeof user?.username === 'string' && user.username ? user.username : 'unknown'
}

/** 调用方身份（角色闸）：上游 requireUserJwt 写 ctx.state.user；未启用鉴权=undefined（单用户部署放行）。 */
function callerOf(ctx: Context): { actor: string; role?: string; authenticated: boolean } {
  const user = (ctx.state as { user?: { username?: string; role?: string } } | undefined)?.user
  return {
    actor: typeof user?.username === 'string' && user.username ? user.username : 'unknown',
    role: typeof user?.role === 'string' ? user.role : undefined,
    authenticated: Boolean(user),
  }
}



// ── 9c. G5 发布门状态机：append-only 事件流 + 派生状态（spec 2026-10-21-g5-uat-state-machine §1） ──
// 类型/迁移矩阵/派生/权限正身在 release-state.ts；此处保留旧导出面与存储路径。

export type { ReleaseAction, ReleaseDecision, ReleaseGateRecord }

/**
 * 旧二态决策校验（纯函数，兼容旧调用方/测试）：打回必须给理由；批准 note 可选。
 * @deprecated 新端点用 validateReleaseActionInput（批准需证据锚）。
 */
export function validateReleaseGate(body: unknown):
  { ok: true; run: string; decision: ReleaseDecision; note?: string } | { ok: false; error: string } {
  const b = body as { run?: unknown; decision?: unknown; note?: unknown } | undefined
  const run = typeof b?.run === 'string' ? b.run : ''
  if (!isValidRun(run)) return { ok: false, error: 'run 参数非法' }
  if (b?.decision !== 'approve' && b?.decision !== 'reject') {
    return { ok: false, error: 'decision 须为 approve|reject' }
  }
  const note = typeof b?.note === 'string' ? b.note.trim() : ''
  if (note.length > 300) return { ok: false, error: 'note 超长（≤300 字符）' }
  if (b.decision === 'reject' && !note) return { ok: false, error: '打回必须给理由（note 必填）' }
  return { ok: true, run, decision: b.decision, note: note || undefined }
}

export function safeReleaseGateFile(root: string, run: string): string | null {
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  const evidDir = resolve(runDir, 'evidence')
  const file = resolve(evidDir, 'release-gate.jsonl')
  return file.startsWith(evidDir + sep) ? file : null
}

/** 读台账：旧记录（decision）与新记录（action）都收；未知动作坏行丢弃。 */
export function readReleaseGate(root: string, run: string): { file: string; records: ReleaseGateRecord[] } | null {
  const file = safeReleaseGateFile(root, run)
  if (!file || !existsSync(file)) return null
  const records: ReleaseGateRecord[] = []
  for (const ln of (readCapped(file) ?? '').split('\n')) {
    if (!ln.trim()) continue
    try {
      const r = JSON.parse(ln) as ReleaseGateRecord
      if (r && actionOfRecord(r) !== null) records.push(r)
    } catch { /* 坏行丢弃 */ }
  }
  return { file, records }
}

/** 当前判定（纯函数，旧读面兼容）：最新一条 approve/reject 记录；无则 null。 */
export function latestReleaseDecision(records: ReleaseGateRecord[]): ReleaseGateRecord | null {
  let latest: ReleaseGateRecord | null = null
  for (const r of records) {
    const action = actionOfRecord(r)
    if (action !== 'approve' && action !== 'reject') continue
    if (!latest || Date.parse(r.ts) >= Date.parse(latest.ts)) latest = r
  }
  return latest
}

function releaseGateStateHandler(ctx: Context): void {
  const root = simRootOrNull()
  if (!root) { gateClosed(ctx); return }
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const ledger = readReleaseGate(root, run)
  const records = ledger?.records ?? []
  const derived = deriveReleaseState(records)
  const caller = callerOf(ctx)
  const can = releasePermissions(caller.role, caller.authenticated)
  const decision = derived.latestDecision ? actionOfRecord(derived.latestDecision) : null
  ctx.body = {
    run,
    state: derived.state,
    decision: decision === 'approve' || decision === 'reject' ? decision : null,
    current: derived.latest,
    records,
    history: derived.history,
    allowedActions: RELEASE_ALLOWED[derived.state].filter(action => can[action]),
    stateAllowedActions: RELEASE_ALLOWED[derived.state],
    can,
    source: ledger?.file ?? null,
  }
}

// 显式 state 读面别名：语义相同，便于客户端/外部脚本按状态机命名读取。


export function mountUatReleaseRoutes(router: Router) {
router.get('/uat-verdicts', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const ledger = readUatLedger(root, run)
  const records = ledger?.records ?? []
  const { byAc, summary } = aggregateUatByAc(records)
  ctx.body = {
    run,
    records,
    byAc,
    summary,
    blocked: summary.blocked > 0,
    blockedAcs: byAc.filter(a => a.blocked).map(a => a.ac),
    source: ledger?.file ?? null,
  }
})
router.post('/uat-verdict', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const v = validateUatVerdict(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const runDir = safeRunDir(root, v.run)
  if (!runDir || !existsSync(runDir)) { ctx.status = 400; ctx.body = { error: 'run 参数非法或不存在' }; return }
  const file = safeUatLedgerFile(root, v.run)
  if (!file) { ctx.status = 400; ctx.body = { error: '目标路径越界' }; return }
  mkdirSync(resolve(runDir, 'evidence'), { recursive: true })
  const rec: UatVerdictRecord = {
    ts: new Date().toISOString(),
    actor: actorOf(ctx),
    run: v.run,
    ac: v.ac,
    verdict: v.verdict,
    ...(v.note ? { note: v.note } : {}),
    ...(v.acknowledged ? { acknowledged: true } : {}),
    ...(v.pending ? { pending: true } : {}),
  }
  appendFileSync(file, `${JSON.stringify(rec)}\n`, 'utf-8')
  ctx.body = { ok: true, record: rec, anchor: `evidence/uat-verdicts.jsonl#${v.ac}` }
})
router.get('/release-gate', releaseGateStateHandler)
router.get('/release-gate/state', releaseGateStateHandler)
router.post('/release-gate', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const body = ctx.request.body as { run?: unknown } | undefined
  const run = typeof body?.run === 'string' ? body.run : ''
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const v = validateReleaseActionInput(body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const action = v.value.action
  const caller = callerOf(ctx)
  const can = releasePermissions(caller.role, caller.authenticated)
  if (!can[action]) {
    fail(ctx, 403, '发布审批动作仅 super_admin 或 release 角色可执行', { code: 'forbidden' })
    return
  }
  const runDir = safeRunDir(root, run)
  if (!runDir || !existsSync(runDir)) { ctx.status = 400; ctx.body = { error: 'run 参数非法或不存在' }; return }
  const file = safeReleaseGateFile(root, run)
  if (!file) { ctx.status = 400; ctx.body = { error: '目标路径越界' }; return }
  const ledger = readReleaseGate(root, run)
  const records = ledger?.records ?? []
  const derived = deriveReleaseState(records)
  const next = applyReleaseAction(derived.state, action)
  if (next === null) {
    fail(ctx, 409, `当前状态 ${derived.state} 不允许动作 ${action}`, {
      code: 'invalid_transition',
      extra: { state: derived.state, action },
    })
    return
  }
  // 同态重复（重复提交/批准/驳回/发布）：不追加重复事件，回当前状态。
  if (next === derived.state) {
    ctx.body = { ok: true, idempotent: true, state: next, action, record: null, current: derived.latest }
    return
  }
  mkdirSync(resolve(runDir, 'evidence'), { recursive: true })
  const rec: ReleaseGateRecord = {
    ts: new Date().toISOString(),
    actor: caller.actor,
    run,
    action,
    ...(v.value.note ? { note: v.value.note } : {}),
    ...(v.value.anchor ? { anchor: v.value.anchor } : {}),
    ...(action === 'approve' || action === 'reject' ? { decision: action } : {}),
  }
  appendFileSync(file, `${JSON.stringify(rec)}\n`, 'utf-8')
  const after = deriveReleaseState([...records, rec])
  ctx.body = { ok: true, idempotent: false, state: after.state, action, record: rec, anchor: 'evidence/release-gate.jsonl' }
})
}
