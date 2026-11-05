// simcenter settings/quality 路由（v0.4 第五批拆分，来自 simcenter-controller，行为不变）。
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

// ── 10. settings：推演引擎参数读写对（B8，设计正本 E28 四区）──
// 例外声明：simcenter 族以只读聚合为纲，本对是唯一的服务端状态写面（引擎参数
// 四键，非数据面聚合）；持久化 <home>/runtime/sim-settings.json，受控键集外
// 一律 400。消费方=推演设置页（/app/sim/settings）与 harness 开轮参数读取。

export interface SimSettings {
  posture_default?: 'strict' | 'standard' | 'demo'
  observation_window_seconds?: number
  clearance_policy?: 'block' | 'warn'
  approval_escalate_minutes?: number
}

export const SIM_SETTINGS_DEFAULTS: Required<SimSettings> = {
  posture_default: 'standard',
  observation_window_seconds: 1200,
  clearance_policy: 'block',
  approval_escalate_minutes: 30,
}

/** 设置校验（纯函数，测试面）：只认四键，部分更新合法；值域越界=400 语义。 */
export function validateSimSettings(body: unknown): { ok: true; patch: SimSettings } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: '请求体须为对象' }
  const patch: SimSettings = {}
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    switch (k) {
      case 'posture_default':
        if (v !== 'strict' && v !== 'standard' && v !== 'demo') return { ok: false, error: 'posture_default ∈ strict|standard|demo' }
        patch.posture_default = v
        break
      case 'observation_window_seconds':
        if (!Number.isInteger(v) || (v as number) < 30 || (v as number) > 3600) return { ok: false, error: 'observation_window_seconds ∈ 30-3600 整数秒' }
        patch.observation_window_seconds = v as number
        break
      case 'clearance_policy':
        if (v !== 'block' && v !== 'warn') return { ok: false, error: 'clearance_policy ∈ block|warn（block=未清拒开新轮，机械执法缺省）' }
        patch.clearance_policy = v
        break
      case 'approval_escalate_minutes':
        if (!Number.isInteger(v) || (v as number) < 5 || (v as number) > 1440) return { ok: false, error: 'approval_escalate_minutes ∈ 5-1440 整数分钟' }
        patch.approval_escalate_minutes = v as number
        break
      default:
        return { ok: false, error: `未知键 ${k}（只认 posture_default/observation_window_seconds/clearance_policy/approval_escalate_minutes）` }
    }
  }
  return { ok: true, patch }
}

function simSettingsFile(): string {
  const home = process.env.HERMES_WEB_UI_HOME || process.env.HOME || '.'
  return resolve(home, 'runtime', 'sim-settings.json')
}

function loadSimSettings(): SimSettings {
  try { return JSON.parse(readFileSync(simSettingsFile(), 'utf-8')) as SimSettings } catch { return {} }
}



// ── 12. quality：AI 产出质量证据只读聚合（三篇调研轮 E/F 件，方案正本 V8.35 §5.8.2 判据执行产物）──
// 读 run 的 mutation-score.json 与 dup-ratio.json（simharness mx-mutation-score.mjs /
// mx-dup-ratio.mjs --out 产物；两处候选=run 根与 evidence/，照 issues 模式）。
// 缺席/坏形状=present:false 如实呈现不硬凑（N1）；verdict 透传工具原判（单一事实源）。

export type QualityMetricKind = 'mx-mutation-score' | 'mx-dup-ratio'

export interface QualityMetricView {
  present: boolean
  reason?: 'file-absent' | 'parse-error' | 'shape-error'
  candidates?: string[]
  source?: string
  tool?: string
  status?: string
  verdict?: string
  score?: number | null
  ratio?: number | null
  threshold?: number
  total?: number
  killed?: number
  survived?: number
  timeout?: number
  incrementLines?: number
  duplicateLines?: number
  blocks?: number
  ts?: string
}

/** 证据 JSON → 指标视图（纯函数，测试面）：tool/status/verdict 三锚校验，
 *  缺席=null→file-absent；数值字段缺席透传 undefined 不猜。 */
export function parseQualityMetric(text: string | null, expectTool: QualityMetricKind): QualityMetricView {
  if (text === null) return { present: false, reason: 'file-absent' }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { present: false, reason: 'parse-error' } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { present: false, reason: 'shape-error' }
  const r = raw as Record<string, unknown>
  if (r.tool !== expectTool || typeof r.status !== 'string' || typeof r.verdict !== 'string') {
    return { present: false, reason: 'shape-error' }
  }
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const numOrNull = (v: unknown): number | null | undefined => (v === null ? null : num(v))
  const base: QualityMetricView = {
    present: true,
    tool: expectTool,
    status: r.status,
    verdict: r.verdict,
    ts: typeof r.ts === 'string' ? r.ts : undefined,
  }
  if (expectTool === 'mx-mutation-score') {
    return { ...base, score: numOrNull(r.score), threshold: num(r.threshold), total: num(r.total), killed: num(r.killed), survived: num(r.survived), timeout: num(r.timeout) }
  }
  return { ...base, ratio: numOrNull(r.ratio), threshold: num(r.threshold), incrementLines: num(r.incrementLines), duplicateLines: num(r.duplicateLines), blocks: Array.isArray(r.blocks) ? r.blocks.length : undefined }
}


export function mountSettingsQualityRoutes(router: Router) {
router.get('/settings', (ctx: Context) => {
  ctx.body = { values: { ...SIM_SETTINGS_DEFAULTS, ...loadSimSettings() }, defaults: SIM_SETTINGS_DEFAULTS }
})
router.put('/settings', (ctx: Context) => {
  const v = validateSimSettings(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const merged = { ...loadSimSettings(), ...v.patch }
  const f = simSettingsFile()
  mkdirSync(resolve(f, '..'), { recursive: true })
  writeFileSync(f, JSON.stringify(merged, null, 1), 'utf-8')
  ctx.body = { values: { ...SIM_SETTINGS_DEFAULTS, ...merged } }
})
router.get('/quality', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const runDir = safeRunDir(root, run)
  if (!runDir) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  const readMetric = (file: string): { text: string | null; found: string | null; candidates: string[] } => {
    const candidates = [resolve(runDir, 'evidence', file), resolve(runDir, file)]
    const found = candidates.find(f => existsSync(f)) ?? null
    return { text: found ? readCapped(found) : null, found, candidates }
  }
  const mut = readMetric('mutation-score.json')
  const dup = readMetric('dup-ratio.json')
  const mutation: QualityMetricView = { ...parseQualityMetric(mut.text, 'mx-mutation-score'), ...(mut.found ? { source: mut.found } : { candidates: mut.candidates }) }
  const duplication: QualityMetricView = { ...parseQualityMetric(dup.text, 'mx-dup-ratio'), ...(dup.found ? { source: dup.found } : { candidates: dup.candidates }) }
  ctx.body = { run, mutation, duplication }
})
}
