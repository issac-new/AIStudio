// M7 三条工具面告警检测器单测（2026-10-16 安全轮，预警先行版）。
// 三段式守门：阈值边界 / 阈值可调（含 env 覆写）/ 未接线合法空态。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type { ClusterSnapshot, ProfileToolUsageEntry } from '../collectors'
import { detectAll, detectOffhoursHighRisk, detectToolBlacklist, detectToolRate } from '../detectors'

function entry(over: Partial<ProfileToolUsageEntry> = {}): ProfileToolUsageEntry {
  return {
    profile: 'p1', total1h: 0, total24h: 0, highRisk24h: 0,
    offhours24h: 0, offhoursHighRisk24h: 0, sensitivePath24h: 0, perTool24h: [],
    ...over,
  }
}

function snap(entries: ProfileToolUsageEntry[]): ClusterSnapshot {
  return { toolUsage: { ok: true, nowMs: Date.now(), entries } } as unknown as ClusterSnapshot
}

/** detectAll 需要的最小底面（其余面未接线=合法空态） */
function baseSnap(entries: ProfileToolUsageEntry[]): ClusterSnapshot {
  return {
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: false, rows: [] },
    runningCards: { ok: false, cards: [] },
    federation: { ok: false, nowMs: 0, machines: [] },
    toolUsage: { ok: true, nowMs: Date.now(), entries },
  } as unknown as ClusterSnapshot
}

describe('security.tool-rate（E2 判据一：频次）', () => {
  it('阈值边界：99 不报、100 报 warn、200 报 high', () => {
    expect(detectToolRate(snap([entry({ total1h: 99 })]))).toHaveLength(0)
    const w = detectToolRate(snap([entry({ total1h: 100 })]))
    expect(w).toHaveLength(1)
    expect(w[0]!.severity).toBe('warn')
    expect(w[0]!.subject).toBe('profile:p1')
    const h = detectToolRate(snap([entry({ total1h: 200 })]))
    expect(h[0]!.severity).toBe('high')
  })

  it('阈值可调：toolRatePerMin=10 时 10 报、9 不报', () => {
    expect(detectToolRate(snap([entry({ total1h: 10 })]), { toolRatePerMin: 10 })).toHaveLength(1)
    expect(detectToolRate(snap([entry({ total1h: 9 })]), { toolRatePerMin: 10 })).toHaveLength(0)
  })

  it('未接线=合法空态：toolUsage 缺席或空条目都返回空', () => {
    expect(detectToolRate({} as ClusterSnapshot)).toEqual([])
    expect(detectToolRate(snap([]))).toEqual([])
  })

  it('单库读取失败的 profile 跳过（error 条目不参与判定）', () => {
    expect(detectToolRate(snap([entry({ total1h: 500, error: 'db locked' })]))).toEqual([])
  })
})

describe('security.offhours-highrisk（E2 判据二：0-6 时高危）', () => {
  it('交集口径：只有时段全量（offhours24h）不报，时段∩高危才报', () => {
    expect(detectOffhoursHighRisk(snap([entry({ offhours24h: 50, offhoursHighRisk24h: 0 })]))).toEqual([])
    const a = detectOffhoursHighRisk(snap([entry({ offhoursHighRisk24h: 1 })]))
    expect(a).toHaveLength(1)
    expect(a[0]!.severity).toBe('warn')
  })

  it('达 offhoursHighRiskMin 升 high', () => {
    const a = detectOffhoursHighRisk(snap([entry({ offhoursHighRisk24h: 10 })]))
    expect(a[0]!.severity).toBe('high')
    const b = detectOffhoursHighRisk(snap([entry({ offhoursHighRisk24h: 9 })]), { offhoursHighRiskMin: 10 })
    expect(b[0]!.severity).toBe('warn')
  })

  it('未接线空态', () => {
    expect(detectOffhoursHighRisk({} as ClusterSnapshot)).toEqual([])
  })
})

describe('security.tool-blacklist（E2 判据三：黑名单工具）', () => {
  beforeEach(() => { delete process.env.CLUSTER_INSPECTOR_TOOL_BLACKLIST })
  afterEach(() => { delete process.env.CLUSTER_INSPECTOR_TOOL_BLACKLIST })

  it('黑名单命中即报 high；只读工具不报', () => {
    const a = detectToolBlacklist(snap([entry({ perTool24h: [{ tool: 'terminal', n: 3 }, { tool: 'read_file', n: 99 }] })]))
    expect(a).toHaveLength(1)
    expect(a[0]!.severity).toBe('high')
    expect(a[0]!.summary).toContain('terminal×3')
    expect(detectToolBlacklist(snap([entry({ perTool24h: [{ tool: 'read_file', n: 99 }] })]))).toEqual([])
  })

  it('一 profile 多黑名单工具聚合成一条（不刷屏）', () => {
    const a = detectToolBlacklist(snap([entry({ perTool24h: [{ tool: 'terminal', n: 1 }, { tool: 'execute_code', n: 2 }] })]))
    expect(a).toHaveLength(1)
    expect(a[0]!.summary).toContain('terminal×1')
    expect(a[0]!.summary).toContain('execute_code×2')
  })

  it('env CLUSTER_INSPECTOR_TOOL_BLACKLIST 覆写默认集', () => {
    process.env.CLUSTER_INSPECTOR_TOOL_BLACKLIST = 'read_file, write_file'
    const a = detectToolBlacklist(snap([entry({ perTool24h: [{ tool: 'read_file', n: 1 }] })]))
    expect(a).toHaveLength(1)
    // 默认集里的 terminal 此时不在黑名单
    expect(detectToolBlacklist(snap([entry({ perTool24h: [{ tool: 'terminal', n: 1 }] })]))).toEqual([])
  })

  it('opts.toolBlacklist 优先于 env', () => {
    process.env.CLUSTER_INSPECTOR_TOOL_BLACKLIST = 'read_file'
    expect(detectToolBlacklist(snap([entry({ perTool24h: [{ tool: 'terminal', n: 1 }] })]), { toolBlacklist: ['terminal'] })).toHaveLength(1)
  })
})

describe('detectAll 集成：三个安全检测器在列且不影响既有检测面', () => {
  it('无 toolUsage 时安全面静默（既有检测器不受影响）', () => {
    const out = detectAll({
      gateway: { ok: true }, sessions: { ok: true, entries: 0, live: 0, dead: [] }, profiles: { ok: true, tails: [] },
      kanban: { ok: false, rows: [] }, runningCards: { ok: false, cards: [] }, federation: { ok: false, nowMs: 0, machines: [] },
    } as unknown as ClusterSnapshot)
    expect(out.filter((a) => a.detector.startsWith('security.'))).toEqual([])
  })

  it('有 toolUsage 时三条安全检测器都经 detectAll 产出', () => {
    const out = detectAll(baseSnap([entry({ total1h: 150, offhoursHighRisk24h: 1, perTool24h: [{ tool: 'terminal', n: 2 }] })]))
    const sec = out.filter((a) => a.detector.startsWith('security.')).map((a) => a.detector).sort()
    expect(sec).toEqual(['security.offhours-highrisk', 'security.tool-blacklist', 'security.tool-rate'])
  })
})
