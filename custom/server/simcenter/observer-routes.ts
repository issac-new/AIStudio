// simcenter observer 路由（v0.4 第五批拆分，来自 simcenter-controller，行为不变）。
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

// ── 日常侧推演观察（2026-10-21 挂账实施轮）──────────────────────────────
// 与 simRootOrNull 的 fail-closed 不同：观察面是 fail-soft——宿主日常未配
// OBS_SIM_ROOT 时按固定候选位探测（env 显式优先，其后工作区约定位），全部缺席
// 返回 available:false，不报错、不读任意路径。
// （候选/解析正身亦在 ./observer-root.ts，见文件头注。）

/** state.env 中房间键提取（纯函数）：值形如 !local:server 的键值对。 */
export function simRoomKeysOf(state: Record<string, string>): Array<{ key: string; roomId: string }> {
  const out: Array<{ key: string; roomId: string }> = []
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'string' && /^![^:\s]+:\S+$/.test(value.trim())) {
      out.push({ key, roomId: value.trim() })
    }
  }
  return out
}

/** 当前 run 解析（纯读）正身在 ./observer-root.ts（2026-10-23 抽出）。 */

/** 觨演侧看板只读聚合实例：sqlite 快道直读 SIM hermes（不 spawn CLI、不装 watcher）。
 *  回落 deps 全部空实现——快道读不了时如实空板，不碰宿主 CLI。 */
let _simKanbanOverview: ReturnType<typeof createKanbanOverview> | null = null
let _simKanbanRoot = ''
function simKanbanOverview(root: string): ReturnType<typeof createKanbanOverview> {
  if (!_simKanbanOverview || _simKanbanRoot !== root) {
    _simKanbanRoot = root
    _simKanbanOverview = createKanbanOverview({
      listBoards: async () => [],
      listTasks: async () => [],
      watchEvents: (() => { throw new Error('sim observer 只读，不装看板 watcher') }) as never,
      killWatch: () => {},
      kanbanDir: () => resolve(root, 'hermes'),
    })
  }
  return _simKanbanOverview
}

// ── 12. observer/overview：日常侧推演观察聚合 ──

/** 503 fail-closed 统一回包（631 同款断言面：响应体带提示）。 */

// ── 12b. observer/sessions：跨实例只读检索推演会话（2026-10-27 立项）──
// 数据面=SIM 根 hermes/profiles/<profile>/state.db 的 sessions 表（node:sqlite
// readOnly 直读，与推演网关并发写共存——kanban 快道同款先例）。SIM 根缺席
// fail-soft available:false（弹窗不显示推演组，日常面不受影响）。60s 结果缓存
// +single-flight 挡连续击键；空关键词不返回全量（防倾倒）。
export interface ObserverSessionHit {
  id: string
  profile: string
  chatType: string
  displayName: string
}

const OBSERVER_SESSIONS_LIMIT_DEFAULT = 50
const OBSERVER_SESSIONS_LIMIT_MAX = 200
const OBSERVER_SESSIONS_CACHE_TTL_MS = 60_000
const observerSessionsCache = new Map<string, { fetchedAt: number; results: ObserverSessionHit[] }>()

/** 测试面：清空检索缓存（避免用例间缓存串扰）。 */
export function __resetObserverSessionsCache(): void {
  observerSessionsCache.clear()
}

function readObserverSessions(root: string, q: string, limit: number): ObserverSessionHit[] {
  // node:sqlite 按需加载（node ≥22.5；老版本 node 直接空回落）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite')
  const profilesDir = resolve(root, 'hermes', 'profiles')
  const needle = `%${q.toLowerCase()}%`
  const out: ObserverSessionHit[] = []
  let profileNames: string[] = []
  try {
    profileNames = readdirSync(profilesDir).filter(d => !d.startsWith('.') && !d.startsWith('_'))
  } catch {
    return out
  }
  for (const profile of profileNames) {
    if (out.length >= limit) break
    const dbPath = resolve(profilesDir, profile, 'state.db')
    if (!existsSync(dbPath)) continue
    let db: any = null
    try {
      db = new DatabaseSync(dbPath, { readOnly: true })
      const rows = db.prepare(
        'select id, chat_type, display_name, session_key from sessions'
        + ' where lower(coalesce(display_name,\'\')) like ? or lower(coalesce(session_key,\'\')) like ? or lower(id) like ?'
        + ' order by rowid desc limit ?',
      ).all(needle, needle, needle, limit - out.length) as any[]
      for (const r of rows) {
        out.push({
          id: String(r.id ?? ''),
          profile,
          chatType: String(r.chat_type ?? ''),
          displayName: String(r.display_name ?? r.session_key ?? r.id ?? ''),
        })
      }
    } catch {
      // 单 profile 库缺席/损坏/表缺失：跳过该 profile（fail-soft 局部降级）
    } finally {
      try { db?.close() } catch { /* 已关 */ }
    }
  }
  return out
}


/** fetch 带超时（AbortController；超时/网络错误按 fail-soft 抛出由调用方统一处理）。 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function mountObserverRoutes(router: Router) {
router.get('/observer/overview', async (ctx: Context) => {
  const root = observerSimRootOrNull()
  if (!root) {
    ctx.body = { available: false, reason: '未找到推演根：SIM_OBSERVER_ROOT/OBS_SIM_ROOT 未配置且默认位置不存在' }
    return
  }
  try {
    const run = currentRunOf(root)
    const state = run.stateFile && existsSync(run.stateFile)
      ? parseStateEnv(readFileSync(run.stateFile, 'utf8'))
      : {}
    // 收官闸（2026-10-26 侧栏徽标准确性轮）：retro_done（G6 终局标记）已落 = 推演
    // 收官，日常观察面关闭——已收官 run 的看板卡不再灌进日常工作台（run22 10-22
    // 收官后仍以 available:true 供 81 张模拟卡，侧栏③④/看板/工作台待办数被模拟卡
    // 淹没的实录）。历史查询走 run-state/evidence 族端点，不经过观察面。
    if (state.retro_done) {
      ctx.body = { available: false, reason: `推演 ${run.runId} 已收官（retro_done）——日常观察面关闭，历史见 run-state/evidence`, runId: run.runId }
      return
    }
    const rooms = simRoomKeysOf(state)
    const startedAtRaw = Number(state.run_started_at ?? 0)
    const overview = await simKanbanOverview(root).getOverview()
    ctx.body = {
      available: true,
      runId: run.runId,
      posture: state.posture || 'standard',
      startedAt: startedAtRaw > 0 ? (startedAtRaw < 1e12 ? startedAtRaw * 1000 : startedAtRaw) : null,
      rooms,
      boards: overview.boards,
      tasks: overview.tasks,
      fetchedAt: Date.now(),
    }
  } catch (err) {
    ctx.body = { available: false, reason: clip(err instanceof Error ? err.message : String(err), ERR_CLIP) }
  }
})
router.get('/observer/sessions', (ctx: Context) => {
  const root = observerSimRootOrNull()
  if (!root) {
    ctx.body = { available: false, reason: '未找到推演根：SIM_OBSERVER_ROOT/OBS_SIM_ROOT 未配置且默认位置不存在' }
    return
  }
  const q = String(ctx.query.q ?? '').trim().toLowerCase()
  const limitRaw = Number(ctx.query.limit ?? OBSERVER_SESSIONS_LIMIT_DEFAULT)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.floor(limitRaw), OBSERVER_SESSIONS_LIMIT_MAX)
    : OBSERVER_SESSIONS_LIMIT_DEFAULT
  if (!q) {
    ctx.body = { available: true, results: [], fetchedAt: Date.now(), cached: false }
    return
  }
  const hit = observerSessionsCache.get(q)
  if (hit && Date.now() - hit.fetchedAt < OBSERVER_SESSIONS_CACHE_TTL_MS) {
    ctx.body = { available: true, results: hit.results.slice(0, limit), fetchedAt: hit.fetchedAt, cached: true }
    return
  }
  const results = readObserverSessions(root, q, limit)
  observerSessionsCache.set(q, { fetchedAt: Date.now(), results })
  ctx.body = { available: true, results, fetchedAt: Date.now(), cached: false }
})
}
