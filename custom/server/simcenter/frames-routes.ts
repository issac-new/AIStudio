// simcenter 帧图廊路由（v0.4 第五批拆分，来自 simcenter-controller，行为不变）。
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

// ── 12/13. 帧图廊：evidence/screenshots 只读枚举与取图（2026-10-19 产品走查批：
//    证据库页签的「帧目录端点未接」补齐。名字一律相对路径，取图走 resolve+startsWith 双闸） ──

const FRAME_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export interface FrameFile {
  /** 相对 evidence/screenshots 的路径（前端取图参数） */
  name: string
  /** 步骤键（文件名前缀，如 uat_done） */
  step: string
  /** before/after（按文件名后缀） */
  phase: 'before' | 'after' | 'unknown'
  size: number
  mtime: number
}

/** 递归枚举截图目录（纯函数；坏目录跳过，不因单个坏文件拖垮整表）。 */
export function listFrameFiles(baseDir: string, rel = ''): FrameFile[] {
  const out: FrameFile[] = []
  const dir = rel ? resolve(baseDir, rel) : baseDir
  let entries: string[] = []
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const abs = resolve(dir, name)
    const relPath = rel ? `${rel}/${name}` : name
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) {
      out.push(...listFrameFiles(baseDir, relPath))
      continue
    }
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
    if (!FRAME_EXT.has(ext)) continue
    const stem = name.slice(0, name.lastIndexOf('.'))
    const phase = /-after$/i.test(stem) ? 'after' : /-before$/i.test(stem) ? 'before' : 'unknown'
    out.push({
      name: relPath,
      step: stem.replace(/-(?:before|after)$/i, '').replace(/-op\d+$/i, ''),
      phase,
      size: st.size,
      mtime: st.mtimeMs,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** 帧根目录（run/evidence/screenshots）；不存在=null（调用方回空列表/404）。 */
function framesBase(root: string, run: string): string | null {
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  const base = resolve(runDir, 'evidence', 'screenshots')
  if (!base.startsWith(resolve(runDir, 'evidence') + sep)) return null
  return existsSync(base) ? base : null
}



export function mountFramesRoutes(router: Router) {
router.get('/frames', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const base = framesBase(root, run)
  if (!base) { ctx.body = { run, frames: [], note: '本次运行没有截图目录' }; return }
  ctx.body = { run, frames: listFrameFiles(base) }
})
router.get('/frame', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  const name = String(ctx.query.name ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const base = framesBase(root, run)
  if (!base) { ctx.status = 404; ctx.body = { error: '本次运行没有截图目录' }; return }
  const abs = resolve(base, name)
  if (!name || !abs.startsWith(base + sep)) { ctx.status = 400; ctx.body = { error: 'name 参数非法（路径越界）' }; return }
  if (!existsSync(abs)) { ctx.status = 404; ctx.body = { error: '帧不存在' }; return }
  const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
  if (!FRAME_EXT.has(ext)) { ctx.status = 415; ctx.body = { error: '不支持的图片类型' }; return }
  ctx.type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
  ctx.body = readFileSync(abs)
})
}
