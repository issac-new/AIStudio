// overlay/custom/server/controllers/sim/fleet-utilization.ts
// 舰队利用率遥测端点（自我觉察 spec §4 舰队层，docs/superpowers/specs/2026-10-29-agent-self-reflection.md
// 第 4 条）：把单 agent 觉察信号（agent.log 'API call #' 心跳）上卷到舰队面——按角色域
// 呈现「在编工位 × 活跃工位 × 饱和度 + 闲置容量」，供导演派发与人类监督参考。
// 利用率≠KPI（不造无用功）：只做如实呈现＋闲置容量可见，不做任何考核语义。
//
// 数据面：SIM 根（OBS_SIM_ROOT 优先，回落 SIM_ROOT）下 hermes/profiles/<name>/logs/agent.log
// 的 'API call #' 行——有界尾部扫（每文件 ≤256KB，禁全量读大文件，实测单文件 ≥4.7MB）。
// 语义：profiles/<name> 目录在场=在编（staffed）；最近一次 API 调用 ≤15min=活跃（active）、
// ≤60min=近期（recent）；饱和度=活跃/在编。日志缺席/无 API 行=如实无活动数据，不猜数。
//
// fail-soft（读模型，N1）：env 缺席或根不存在→200 {available:false}，不报错不猜数——
// 宿主日常未配推演根时客户端整条隐藏；单 profile 日志损坏只降级该 profile。
// 挂载：patch 704（bootstrap/routes.ts，同 562 run-progress 模式）。
import Router from '@koa/router'
import type { Context } from 'koa'
import { closeSync, fstatSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { ok, unavailable } from '../../lib/http'

/** 活跃窗：最近一次 API 调用距 now ≤15min 记活跃（spec §4「在编×活跃×饱和度」口径）。 */
export const ACTIVE_WINDOW_MS = 15 * 60 * 1000
/** 近期窗：≤60min 记近期（第二档松口径，供阶段切换时看闲置趋势）。 */
export const RECENT_WINDOW_MS = 60 * 60 * 1000
/** 单文件有界尾读上限（256KB）：API 心跳行间距为秒-分级，尾部足够覆盖活跃/近期判定；
 *  更久以前的活动本端点不关心，不为此全量读大文件。 */
export const TAIL_MAX_BYTES = 256 * 1024

/** 角色域表（唯一事实源）：prefix 命中=同名或 prefix+'-' 前缀（同前缀全族扫描，
 *  如 chen/chen-researcher/chen-csw-pay-core 均入研发域）。未列前缀（如 wei 评审族）
 *  不入任何域——本端点按 spec §4 九域口径聚合，不扩权。 */
export const FLEET_DOMAINS: ReadonlyArray<{ key: string; label: string; prefixes: string[] }> = [
  { key: 'orchestration', label: '编排', prefixes: ['fanfan'] },
  { key: 'requirements', label: '需求', prefixes: ['bella'] },
  { key: 'architecture', label: '架构', prefixes: ['arch'] },
  { key: 'security', label: '安全', prefixes: ['secops'] },
  { key: 'dev', label: '研发', prefixes: ['chen', 'hu', 'lin', 'xiao'] },
  { key: 'frontend', label: '前端', prefixes: ['mei'] },
  { key: 'testing', label: '测试', prefixes: ['qi', 'fei'] },
  { key: 'ops', label: '运维', prefixes: ['ops'] },
  { key: 'audit', label: '审计', prefixes: ['audit'] },
]

export interface FleetDomainStat {
  domain: string
  label: string
  staffed: number
  active: number
  recent: number
  /** 域内最近一次 API 调用距 now 的秒数（最小值）；无任何活动数据=null 如实缺席 */
  lastActivityAgoSec: number | null
  /** 饱和度=active/staffed 四舍五入百分比；staffed=0 记 0 */
  saturationPct: number
}

// type alias（非 interface）：lib/http ok(ctx, data) 收 Record<string, unknown>，
// interface 无隐式索引签名会被 tsc 拒收；type alias 的对象字面量形态有。
export type FleetUtilizationBody = {
  available: true
  domains: FleetDomainStat[]
  fleet: { staffed: number; active: number; saturationPct: number; idleCapacity: number }
  windows: { activeMin: number; recentMin: number }
  fetchedAt: number
  cached?: boolean
}

/** profile 名 → 域 key（纯函数）：同名或 '-' 分隔前缀命中；不入任何域返回 null。 */
export function matchProfileDomain(name: string): string | null {
  for (const d of FLEET_DOMAINS) {
    for (const p of d.prefixes) {
      if (name === p || name.startsWith(`${p}-`)) return d.key
    }
  }
  return null
}

/** 'API call #' 心跳行时间戳解析（纯函数）：行首 `YYYY-MM-DD HH:mm:ss,SSS` 按**本地时**
 *  解析（日志由本机 hermes-agent 写、本端点同机读，时区一致）；非 API 行/坏行返回 null。
 *  实测行样例（ncwk-sim-mux hermes/profiles/fanfan/logs/agent.log）：
 *  `2026-10-29 10:24:52,912 INFO [...] agent.conversation_loop: API call #9: model=...` */
export function parseApiCallTimestamp(line: string): number | null {
  if (!line.includes('API call #')) return null
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})[,.](\d{3})/.exec(line)
  if (!m) return null
  const [y, mo, d, h, mi, s, ms] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7])]
  const ts = new Date(y, mo - 1, d, h, mi, s, ms)
  // 回环校验：Date 会把 2026-13-99 之类越界分量静默滚动成合法日期——拒绝，不猜
  if (
    ts.getFullYear() !== y || ts.getMonth() !== mo - 1 || ts.getDate() !== d
    || ts.getHours() !== h || ts.getMinutes() !== mi || ts.getSeconds() !== s
  ) return null
  const time = ts.getTime()
  return Number.isFinite(time) ? time : null
}

/** 尾部文本 → 最近一次 API 调用时间（纯函数）：取最后一条命中行（尾读天然含最新行）。 */
export function lastApiCallFromTail(tail: string): number | null {
  let last: number | null = null
  for (const line of tail.split('\n')) {
    const ts = parseApiCallTimestamp(line)
    if (ts !== null) last = ts
  }
  return last
}

/** 有界尾读（≤maxBytes）：从文件末尾读一块；起点在文件中间时首行是截断半行，丢弃。 */
export function readTail(file: string, maxBytes = TAIL_MAX_BYTES): string | null {
  let fd: number | null = null
  try {
    fd = openSync(file, 'r')
    const size = fstatSync(fd).size
    const len = Math.min(size, maxBytes)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    const text = buf.toString('utf8')
    if (size > len) {
      const nl = text.indexOf('\n')
      return nl >= 0 ? text.slice(nl + 1) : ''
    }
    return text
  } catch {
    return null
  } finally {
    if (fd !== null) { try { closeSync(fd) } catch { /* 已关 */ } }
  }
}

/** 推演根解析（fail-soft 门）：OBS_SIM_ROOT 优先、SIM_ROOT 回落；缺席/不存在=null。
 *  与 simcenter 的 503 fail-closed 门不同：本端点是观察读模型，env 缺席=客户端隐藏条，
 *  不算故障。显式 env 语义与 observer-root 候选序保持一致（不做盘位启发探测——
 *  本端点按任务口径只认显式 env，避免宿主日常误读任意磁盘路径）。 */
export function fleetSimRootOrNull(): string | null {
  const root = (process.env.OBS_SIM_ROOT ?? process.env.SIM_ROOT ?? '').trim()
  if (!root) return null
  try {
    return statSync(root).isDirectory() ? root : null
  } catch {
    return null
  }
}

/** 单次扫描（纯读聚合，测试面）：列 profiles 目录→按域聚合在编与尾部心跳。 */
export function scanFleetUtilization(root: string, now: number): FleetUtilizationBody {
  // profile 目录枚举（观察面先例：跳过 . 与 _ 前缀的非角色目录）
  let names: string[] = []
  try {
    names = readdirSync(resolve(root, 'hermes', 'profiles'), { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
      .map(d => d.name)
  } catch {
    names = []
  }
  // 每 profile 的最近一次 API 心跳（日志缺席/无命中=无数据，不猜）
  const lastTs = new Map<string, number>()
  for (const name of names) {
    if (matchProfileDomain(name) === null) continue
    const tail = readTail(resolve(root, 'hermes', 'profiles', name, 'logs', 'agent.log'))
    const ts = tail === null ? null : lastApiCallFromTail(tail)
    if (ts !== null) lastTs.set(name, ts)
  }
  // 域聚合：九域固定输出（staffed=0 如实呈 0/0），fleet 汇总=闲置容量的派生基座
  const domains: FleetDomainStat[] = FLEET_DOMAINS.map(({ key, label }) => {
    const members = names.filter(n => matchProfileDomain(n) === key)
    let active = 0
    let recent = 0
    let lastAgoSec: number | null = null
    for (const n of members) {
      const ts = lastTs.get(n)
      if (ts === undefined) continue
      const ago = Math.max(0, Math.round((now - ts) / 1000))
      if (now - ts <= ACTIVE_WINDOW_MS) active++
      if (now - ts <= RECENT_WINDOW_MS) recent++
      if (lastAgoSec === null || ago < lastAgoSec) lastAgoSec = ago
    }
    const staffed = members.length
    return {
      domain: key,
      label,
      staffed,
      active,
      recent,
      lastActivityAgoSec: lastAgoSec,
      saturationPct: staffed > 0 ? Math.round((active / staffed) * 100) : 0,
    }
  })
  const staffed = domains.reduce((s, d) => s + d.staffed, 0)
  const active = domains.reduce((s, d) => s + d.active, 0)
  return {
    available: true,
    domains,
    fleet: {
      staffed,
      active,
      saturationPct: staffed > 0 ? Math.round((active / staffed) * 100) : 0,
      idleCapacity: staffed - active,
    },
    windows: { activeMin: ACTIVE_WINDOW_MS / 60000, recentMin: RECENT_WINDOW_MS / 60000 },
    fetchedAt: now,
  }
}

// ── 30s 结果缓存（observer/sessions 同款先例）：挡多客户端/短轮询重复盘扫；测试经
//    __resetFleetUtilizationCache 清缓存避免用例间串扰。 ──
const CACHE_TTL_MS = 30_000
let cache: { root: string; body: FleetUtilizationBody } | null = null

/** 测试面：清空扫描缓存。 */
export function __resetFleetUtilizationCache(): void {
  cache = null
}

export function createFleetUtilizationRouter(): Router {
  const router = new Router()
  router.get('/api/sim/fleet-utilization', (ctx: Context) => {
    const root = fleetSimRootOrNull()
    if (!root) {
      // K19：读模型降级走 lib/http 统一出口（200 + ok:true + available:false + note）
      unavailable(ctx, '未配置推演根：OBS_SIM_ROOT/SIM_ROOT 缺席或路径不存在')
      return
    }
    if (cache && cache.root === root && Date.now() - cache.body.fetchedAt < CACHE_TTL_MS) {
      ok(ctx, { ...cache.body, cached: true })
      return
    }
    try {
      const body = scanFleetUtilization(root, Date.now())
      cache = { root, body }
      ok(ctx, body)
    } catch (err) {
      // 读模型 fail-soft：扫描异常如实缺席（note 截断 ≤200 字符，不外泄整段堆栈）
      const msg = err instanceof Error ? err.message : String(err)
      unavailable(ctx, `舰队利用率扫描失败：${msg.slice(0, 200)}`)
    }
  })
  return router
}

export default createFleetUtilizationRouter()
