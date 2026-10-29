// overlay/custom/server/controllers/sim/__tests__/fleet-utilization.test.ts
// 舰队利用率遥测守门（自我觉察 spec §4 舰队层）：
//   1) 心跳行解析纯函数——实测日志行形态（本地时逗号毫秒）、非 API 行/坏行拒绝
//   2) profile→域映射——同前缀全族（chen-csw-* 入研发）、伪前缀不误吞（chenx→null）、
//      未列族（wei）不入域
//   3) 有界尾读——超限文件只扫尾部且丢弃截断首行；大文件场景心跳仍可检出
//   4) 端点 fail-soft——env 缺席=available:false；SIM_ROOT 回落；聚合数字自夹具实测
//   5) 30s 缓存——窗内复打返回 cached:true，测试钩子可清
import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  ACTIVE_WINDOW_MS, RECENT_WINDOW_MS, TAIL_MAX_BYTES,
  __resetFleetUtilizationCache, createFleetUtilizationRouter,
  fleetSimRootOrNull, lastApiCallFromTail, matchProfileDomain, parseApiCallTimestamp, readTail, scanFleetUtilization,
} from '../fleet-utilization'

/** now(ms) → 实测日志行首时间格式（本地时 + 逗号毫秒），夹具行生成器。 */
function logTs(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())},${p(d.getMilliseconds(), 3)}`
}

/** 单条 API 心跳行（实测形态誊写：ncwk-sim-mux fanfan agent.log）。 */
function apiLine(ms: number, seq: number): string {
  return `${logTs(ms)} INFO [20261029_101553_a8656209] agent.conversation_loop: API call #${seq}: model=glm-5.3 provider=custom in=93663 out=2575 latency=45.5s`
}

const SAVED_ENV: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined): void {
  if (!(key in SAVED_ENV)) SAVED_ENV[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterEach(() => {
  for (const [k, v] of Object.entries(SAVED_ENV)) setEnv(k, v)
  for (const k of Object.keys(SAVED_ENV)) delete SAVED_ENV[k]
  __resetFleetUtilizationCache()
})

describe('心跳行解析（纯函数）', () => {
  it("实测行形态解析为本地时毫秒（'API call #' 命中 + 行首时间戳）", () => {
    const line = '2026-10-29 10:24:52,912 INFO [x] agent.conversation_loop: API call #9: model=glm-5.3'
    const ts = parseApiCallTimestamp(line)
    expect(ts).toBe(new Date(2026, 9, 29, 10, 24, 52, 912).getTime())
  })

  it('非 API 行 / 无时间戳 API 行 / 坏月份数据 → null 不猜', () => {
    expect(parseApiCallTimestamp('2026-10-29 10:24:52,912 INFO [x] other: done')).toBeNull()
    expect(parseApiCallTimestamp('INFO [x] agent.conversation_loop: API call #1: no ts')).toBeNull()
    expect(parseApiCallTimestamp('2026-13-99 10:24:52,912 API call #1')).toBeNull()
  })

  it('尾部多条命中取最后一条（最新）', () => {
    const t0 = Date.now() - 90 * 60 * 1000
    const tail = [
      apiLine(t0, 1),
      '2026-10-29 09:00:00,000 INFO [x] agent.other: 不相关行',
      apiLine(t0 + 60_000, 2),
      apiLine(t0 + 120_000, 3),
    ].join('\n')
    expect(lastApiCallFromTail(tail)).toBe(t0 + 120_000)
    expect(lastApiCallFromTail('')).toBeNull()
    expect(lastApiCallFromTail('没有任何心跳\n的尾部')).toBeNull()
  })
})

describe('profile → 角色域映射（spec §4 九域）', () => {
  it('同前缀全族：chen/chen-researcher/chen-csw-pay-core 均入研发；qi-tester 入测试', () => {
    expect(matchProfileDomain('chen')).toBe('dev')
    expect(matchProfileDomain('chen-csw-pay-core')).toBe('dev')
    expect(matchProfileDomain('xiao-csw-cashier-mp')).toBe('dev')
    expect(matchProfileDomain('qi-tester')).toBe('testing')
    expect(matchProfileDomain('secops-iso-reviewer')).toBe('security')
    expect(matchProfileDomain('audit-evidence-auditor')).toBe('audit')
    expect(matchProfileDomain('fanfan-sys-analyst')).toBe('orchestration')
    expect(matchProfileDomain('mei-lead-reviewer')).toBe('frontend')
  })

  it('伪前缀不误吞（chenx≠chen）、未列族（wei）不入域 → null', () => {
    expect(matchProfileDomain('chenx')).toBeNull()
    expect(matchProfileDomain('chenx-researcher')).toBeNull()
    expect(matchProfileDomain('wei')).toBeNull()
    expect(matchProfileDomain('wei-lead-reviewer')).toBeNull()
    expect(matchProfileDomain('archivists')).toBeNull()
  })
})

describe('有界尾读', () => {
  it('小文件全量读；超限文件只取尾部并丢弃截断首行', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-tail-'))
    try {
      const small = join(dir, 'small.log')
      writeFileSync(small, 'abc\ndef', 'utf8')
      expect(readTail(small)).toBe('abc\ndef')

      const big = join(dir, 'big.log')
      const filler = 'x'.repeat(TAIL_MAX_BYTES + 1024)
      writeFileSync(big, `${filler}\n${apiLine(Date.now(), 1)}\n`, 'utf8')
      const tail = readTail(big)
      expect(tail).not.toBeNull()
      expect(tail!.length).toBeLessThanOrEqual(TAIL_MAX_BYTES)
      expect(tail!).not.toContain('xxxx') // 截断半行已丢弃
      expect(tail!).toContain('API call #1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('缺席文件 → null', () => {
    expect(readTail(join(tmpdir(), 'fleet-no-such-xyz.log'))).toBeNull()
  })
})

describe('端点（run-progress 同款：路由层直取 handler）', () => {
  const router: any = createFleetUtilizationRouter()
  const handler = router.stack.find((l: any) => l.path === '/api/sim/fleet-utilization').stack.slice(-1)[0]

  /** 夹具：fanfan 5min 前活跃、chen 30min 前（近期不活跃）、qi 3h 前（均过期）、ops 在编无日志。 */
  function makeFixture(): string {
    const root = mkdtempSync(join(tmpdir(), 'fleet-fix-'))
    const now = Date.now()
    const mk = (profile: string, lines?: string[]): void => {
      mkdirSync(resolve(root, 'hermes', 'profiles', profile, 'logs'), { recursive: true })
      if (lines) writeFileSync(resolve(root, 'hermes', 'profiles', profile, 'logs', 'agent.log'), `${lines.join('\n')}\n`, 'utf8')
    }
    mk('fanfan', [apiLine(now - 3 * 60 * 60 * 1000, 1), apiLine(now - 5 * 60 * 1000, 2)])
    mk('chen', [apiLine(now - 30 * 60 * 1000, 1)])
    mk('chen-researcher', [apiLine(now - 2 * 60 * 60 * 1000, 1)])
    mk('qi', [apiLine(now - 3 * 60 * 60 * 1000, 1)])
    mk('ops') // 在编但无日志：staffed 计入、无活动数据如实缺席
    mk('wei', [apiLine(now - 1000, 1)]) // 未列族：不得入任何域/舰队计数
    return root
  }

  it('env 缺席 → 200 ok:true+available:false（fail-soft 不猜数，K19 unavailable 出口）', async () => {
    setEnv('OBS_SIM_ROOT', undefined)
    setEnv('SIM_ROOT', undefined)
    expect(fleetSimRootOrNull()).toBeNull()
    const ctx: any = { body: undefined, status: 0 }
    await handler(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body.ok).toBe(true)
    expect(ctx.body.available).toBe(false)
    expect(ctx.body.note).toContain('OBS_SIM_ROOT')
  })

  it('OBS_SIM_ROOT 优先于 SIM_ROOT；SIM_ROOT 单独在场亦生效', () => {
    setEnv('OBS_SIM_ROOT', undefined)
    setEnv('SIM_ROOT', '/definitely/not/here')
    expect(fleetSimRootOrNull()).toBeNull() // 存在性校验：路径不存在仍 null
    const root = mkdtempSync(join(tmpdir(), 'fleet-root-'))
    setEnv('SIM_ROOT', root)
    expect(fleetSimRootOrNull()).toBe(root)
    setEnv('OBS_SIM_ROOT', root)
    setEnv('SIM_ROOT', '/definitely/not/here')
    expect(fleetSimRootOrNull()).toBe(root)
    rmSync(root, { recursive: true, force: true })
  })

  it('聚合数字自夹具实测：域计数/窗口分档/饱和度/闲置容量/未列族不计入', async () => {
    const root = makeFixture()
    setEnv('OBS_SIM_ROOT', root)
    setEnv('SIM_ROOT', undefined)
    const ctx: any = { body: undefined, status: 0 }
    await handler(ctx)
    const body = ctx.body
    expect(ctx.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.available).toBe(true)
    expect(body.cached).toBeUndefined()
    expect(body.windows).toEqual({ activeMin: 15, recentMin: 60 })

    const byKey = new Map(body.domains.map((d: any) => [d.domain, d]))
    expect(body.domains).toHaveLength(9) // 九域固定输出
    expect(byKey.get('orchestration')).toMatchObject({
      staffed: 1, active: 1, recent: 1, saturationPct: 100,
    })
    expect(byKey.get('orchestration').lastActivityAgoSec).toBeGreaterThanOrEqual(295)
    expect(byKey.get('dev')).toMatchObject({
      staffed: 2, active: 0, recent: 1, saturationPct: 0, // chen 30min=近期未活跃；chen-researcher 2h=均过期
    })
    expect(byKey.get('dev').lastActivityAgoSec).toBeGreaterThanOrEqual(1795)
    expect(byKey.get('testing')).toMatchObject({ staffed: 1, active: 0, recent: 0, saturationPct: 0 })
    expect(byKey.get('ops')).toMatchObject({ staffed: 1, active: 0, recent: 0, lastActivityAgoSec: null })
    // fleet 汇总：在编=编排1+研发2+测试1+运维1=5；活跃仅 fanfan → 闲置 4
    expect(body.fleet).toEqual({ staffed: 5, active: 1, saturationPct: 20, idleCapacity: 4 })
    rmSync(root, { recursive: true, force: true })
  })

  it('30s 缓存：同根复打返回 cached 同体；换根/清缓存后重扫', async () => {
    const root = makeFixture()
    setEnv('OBS_SIM_ROOT', root)
    const first: any = { body: undefined }
    await handler(first)
    expect(first.body.cached).toBeUndefined()
    const second: any = { body: undefined }
    await handler(second)
    expect(second.body.cached).toBe(true)
    expect(second.body.fleet).toEqual(first.body.fleet)
    expect(second.body.fetchedAt).toBe(first.body.fetchedAt)

    __resetFleetUtilizationCache()
    const third: any = { body: undefined }
    await handler(third)
    expect(third.body.cached).toBeUndefined()
    rmSync(root, { recursive: true, force: true })
  })

  it('大文件（≥尾部上限）场景：尾读仍检出最新心跳——禁全量读不牺牲正确性', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-big-'))
    const now = Date.now()
    const logDir = resolve(root, 'hermes', 'profiles', 'hu', 'logs')
    mkdirSync(logDir, { recursive: true })
    // 旧心跳埋在文件头部（超过 256KB 尾窗之外），最新心跳在尾部
    const head = [apiLine(now - 5 * 60 * 60 * 1000, 1), 'y'.repeat(TAIL_MAX_BYTES)].join('\n')
    writeFileSync(resolve(logDir, 'agent.log'), `${head}\n${apiLine(now - 60_000, 2)}\n`, 'utf8')
    setEnv('OBS_SIM_ROOT', root)
    const ctx: any = { body: undefined }
    await handler(ctx)
    const dev = ctx.body.domains.find((d: any) => d.domain === 'dev')
    expect(dev).toMatchObject({ staffed: 1, active: 1, recent: 1 })
    expect(dev.lastActivityAgoSec).toBeLessThanOrEqual(61)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('scanFleetUtilization（纯读聚合直测）', () => {
  it('profiles 根整体缺席 → 九域全 0、fleet 如实 0/0', () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-empty-'))
    try {
      const body = scanFleetUtilization(root, Date.now())
      expect(body.available).toBe(true)
      expect(body.fleet).toEqual({ staffed: 0, active: 0, saturationPct: 0, idleCapacity: 0 })
      expect(body.domains.every((d) => d.staffed === 0 && d.lastActivityAgoSec === null)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// 窗口常量钉死（改口径本组当场红——客户端与服务端文案同源）
describe('窗口常量', () => {
  it('活跃 15min / 近期 60min（spec §4 口径）', () => {
    expect(ACTIVE_WINDOW_MS).toBe(15 * 60 * 1000)
    expect(RECENT_WINDOW_MS).toBe(60 * 60 * 1000)
    expect(TAIL_MAX_BYTES).toBe(256 * 1024)
  })
})
