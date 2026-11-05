// simcenter evidence/issues 路由（v0.4 第五批拆分，来自 simcenter-controller，行为不变）。
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

// ── 10. evidence/mark：本族唯一写端点（强校验+路径穿越防护） ──

export const MARK_ROOM_RE = /^![A-Za-z0-9._=-]{1,64}$/
export const MARK_EVENT_RE = /^\$[A-Za-z0-9]{1,24}$/

/** mark 入参强校验（纯函数）：run 字符集/room/event_id 正则/summary 非空≤200。 */
export function validateEvidenceMark(body: unknown):
  { ok: true; run: string; room: string; event_id: string; summary: string } | { ok: false; error: string } {
  const b = body as { run?: unknown; room?: unknown; event_id?: unknown; summary?: unknown } | undefined
  const run = typeof b?.run === 'string' ? b.run : ''
  if (!isValidRun(run)) return { ok: false, error: 'run 参数非法' }
  const room = typeof b?.room === 'string' ? b.room : ''
  if (!MARK_ROOM_RE.test(room)) return { ok: false, error: 'room 非法（^! + [A-Za-z0-9._=-]{1,64}）' }
  const event_id = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!MARK_EVENT_RE.test(event_id)) return { ok: false, error: 'event_id 非法（^$ + [A-Za-z0-9]{1,24}）' }
  const summary = typeof b?.summary === 'string' ? b.summary : ''
  if (!summary.trim()) return { ok: false, error: 'summary 必填' }
  if (summary.length > 200) return { ok: false, error: 'summary 超长（≤200 字符）' }
  return { ok: true, run, room, event_id, summary }
}

/** 穿越防护（纯函数）：mark 文件 resolve 后必须仍在该 run 的 evidence/ 内。 */
export function safeEvidenceFile(root: string, run: string): string | null {
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  const evidDir = resolve(runDir, 'evidence')
  const file = resolve(evidDir, 'message-marks.jsonl')
  return file.startsWith(evidDir + sep) ? file : null
}


// ── 11. issues：issues.log 只读聚合（ISSUE/DISP 解析+处置率） ──

export interface IssueLine { kind: 'issue' | 'disp'; code: string; subject: string; text: string }

/**
 * issues.log 解析（纯函数，测试面）。行格式=simharness mx-lib/aipay-scenario 实测：
 * `ISSUE|<code>|<subject>|<detail>` 与 `DISP|<code>|<subject>|<处置结论>`。
 * 处置率=已处置 ISSUE / ISSUE 全量（DISP 行是对 ISSUE 的处置记录，不重复入分母；
 * 设计正本=治理中心签 2「分母=台账全量」口径，两计数均输出供对账）。
 */
export function parseIssuesLog(text: string): {
  lines: IssueLine[]
  stats: { totalLines: number; totalIssue: number; totalDisp: number; disposed: number; open: number; rate: number | null }
} {
  const raw = text.split('\n').filter(l => l.trim() !== '')
  const issues: IssueLine[] = []
  const disps: IssueLine[] = []
  for (const ln of raw) {
    const m = /^(ISSUE|DISP)\|([^|]*)\|([^|]*)\|(.*)$/.exec(ln.trim())
    if (!m) continue
    const rec: IssueLine = { kind: m[1] === 'ISSUE' ? 'issue' : 'disp', code: m[2].trim(), subject: m[3].trim(), text: m[4].trim() }
    if (rec.kind === 'issue') issues.push(rec)
    else disps.push(rec)
  }
  const disposedCodes = new Set(disps.map(d => d.code))
  const disposed = issues.filter(i => disposedCodes.has(i.code)).length
  return {
    lines: [...issues, ...disps],
    stats: {
      totalLines: raw.length,
      totalIssue: issues.length,
      totalDisp: disps.length,
      disposed,
      open: issues.length - disposed,
      rate: issues.length === 0 ? null : disposed / issues.length,
    },
  }
}


export function mountEvidenceIssuesRoutes(router: Router) {
router.post('/evidence/mark', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const v = validateEvidenceMark(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const runDir = safeRunDir(root, v.run)
  if (!runDir || !existsSync(runDir)) { ctx.status = 400; ctx.body = { error: 'run 参数非法或不存在' }; return }
  const file = safeEvidenceFile(root, v.run)
  if (!file) { ctx.status = 400; ctx.body = { error: '目标路径越界' }; return }
  const evidDir = resolve(runDir, 'evidence')
  mkdirSync(evidDir, { recursive: true })
  const ts = new Date().toISOString()
  appendFileSync(file, `${JSON.stringify({ ts, source: 'server', run: v.run, room: v.room, event_id: v.event_id, summary: v.summary })}\n`, 'utf-8')
  ctx.body = { ok: true, ts, anchor: `evidence/message-marks.jsonl#${v.event_id}` }
})
router.get('/issues', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const runDir = safeRunDir(root, run)
  if (!runDir) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  // 两处都试：run 根 issues.log 与 evidence/issues.log（mx-lib 两代落位兼容）。
  const candidates = [resolve(runDir, 'issues.log'), resolve(runDir, 'evidence', 'issues.log')]
  const file = candidates.find(f => existsSync(f))
  if (!file) { ctx.status = 404; ctx.body = { error: `run ${run} 的 issues.log 不存在（run 根与 evidence/ 均缺席）` }; return }
  const { lines, stats } = parseIssuesLog(readCapped(file) ?? '')
  ctx.body = { run, count: lines.length, lines, stats, source: file }
})
}
