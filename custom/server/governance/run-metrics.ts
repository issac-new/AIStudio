/**
 * 治理指标计算（融合批三）——run 级治理数字的唯一实现。
 *
 * 移植自 simharness gov_report/gov_archive_commit（mx-scenario-lib.sh）的指标计算面：
 * 首过/补过/打回三态、证据一次通过率、打回次数、人工介入、告警族聚合、DISP 归桶、
 * metrics-log CSV 行、上轮基线与近 5 轮趋势。口径逐条对齐原实现（含 run13 复盘 C3
 * 修订：打回只认判词 FAIL/显式打回语义行，闸段其余问题单不计打回）；
 * simharness 侧计算退役（gov_report 改渲染壳，数字取本 DTO）。
 *
 * 数据源（只读）：runs/<run>/evidence/issues.log、runs/<run>/state.env、
 * runs/<run>/evidence/product-outcome/quality-summary.env、历史轮 governance-report.md。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6'
export type GatePassState = '首过' | '补过' | '打回'

/** 六闸 state 键（G3/G6 为落键型，无对应记录即首过——run10 起统一六分母口径）。 */
export const GATE_STATE_KEYS: Readonly<Record<GateId, string>> = {
  G1: 'g1_frozen', G2: 'g2_arch_pass', G3: 'g3_code_pass',
  G4: 'g4_pass', G5: 'g5_ready', G6: 'retro_done',
}

const REJECT_WORD_RE = /(fail|FAIL|打回|拒收|熔断|退回)/
const CREDENTIAL_MISS_RE = /^(receipt-missing|raci-dispatch-missing|anexec-missing|evidence-missing|credential)/
const ALERT_FAMILY_RE = /^(gw-|capacity-|gateway-|wip-overload|load-|mx-load-)/
const RUN_DIR_RE = /^\d{8}-v\d+-run\d+$/

export interface GateStat { gate: GateId; state: GatePassState; supplement: boolean; segmentIssues: number }
export interface MetricsRow { id: 'M1' | 'M3' | 'M4' | 'M5'; csv: string }

/** DISP 配对行（四变体归一：exact 精确 / generic 泛指广播 / single 单键容差 / none 待处置）。 */
export interface IssuePairingRow {
  key: string
  type: string
  subject: string
  freq: number
  mode: 'exact' | 'generic' | 'single' | 'none'
  disposition: string | null
  bucket: '已修' | '已闭环' | '观察' | '延后' | '表外词' | '待处置'
}

export interface RunMetrics {
  run: string
  rfd: string
  issuesTotal: number
  dispTotal: number
  gateStats: GateStat[]
  firstPass: number
  supplementCount: number
  rejectGateCount: number
  evidenceRate: { doneKeys: number; credentialMissing: number; text: string }
  rejectCount: number
  humanInterventions: number
  alertFamily: { count: number; keys: string[] }
  defectDensity: string
  dispBuckets: Array<{ tag: string; n: number }>
  uniqueKeys: string[]
  pairing: IssuePairingRow[]
  gateKeyLines: Array<{ key: string; value: string }>
  metricsRows: MetricsRow[]
  baseline: { prevRun: string; line: string } | null
  trend: Array<{ run: string; firstPass: string; rejectRate: string; density: string }>
}

/** state.env 文本 → 键值（首行胜出——sget/parseStateEnv 同口径）。 */
export function parseStateEnvKeys(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line)
    if (m && !(m[1] in out)) out[m[1]] = m[2]
  }
  return out
}

function round3(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3)
}

export interface RunMetricsInput {
  run: string
  rfd: string
  issuesLog: string
  stateEnv: string
  /** product-outcome/quality-summary.env 原文（缺席=密度如实 ⬜） */
  qualitySummaryEnv?: string
  /** 历史轮目录名清单（runs/ 下轮次命名目录；供基线/趋势） */
  runDirs?: string[]
  /** 读历史轮 governance-report.md 的取文函数（测试注入；缺省读 runsDir 文件） */
  readPrevReport?: (run: string) => string | null
  /** 日期（CSV 行用；缺省今天） */
  today?: string
}

export function computeRunMetrics(input: RunMetricsInput): RunMetrics {
  const { run, rfd, issuesLog, stateEnv } = input
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const issueLines = issuesLog.split('\n').filter((l) => l.startsWith('ISSUE|'))
  const dispLines = issuesLog.split('\n').filter((l) => l.startsWith('DISP|'))
  const state = parseStateEnvKeys(stateEnv)

  const gateStats: GateStat[] = []
  let supplementCount = 0
  let rejectGateCount = 0
  let gateSegmentIssues = 0
  for (let n = 1; n <= 6; n++) {
    const gate = `G${n}` as GateId
    const seg = issueLines.filter((l) => l.startsWith(`ISSUE|g${n}-`))
    gateSegmentIssues += seg.length
    const failed = seg.some((l) => REJECT_WORD_RE.test(l))
    const supplement = state[`g${n}_supplement`] === '1' && !failed
    if (supplement) supplementCount++
    if (failed) rejectGateCount++
    gateStats.push({ gate, state: failed ? '打回' : supplement ? '补过' : '首过', supplement, segmentIssues: seg.length })
  }
  const firstPass = 6 - rejectGateCount - supplementCount

  const doneKeys = Object.keys(state).filter((k) => /^[a-z0-9_]+_done$/.test(k)).length
  const credentialMissing = issueLines.filter((l) => CREDENTIAL_MISS_RE.test(l.slice(6))).length
  const evidenceText = doneKeys > 0
    ? `${doneKeys - credentialMissing}/${doneKeys}（凭证族记录 ${credentialMissing} 起）`
    : '⬜（state.env 完成环节键=0，分母缺席如实留空）'

  const rejectCount = issueLines.filter((l) => REJECT_WORD_RE.test(l)).length
  const humanInterventions = dispLines.filter((l) => l.includes('导演')).length

  const alertKeys = [...new Set(issueLines.map((l) => (l.split('|')[1] ?? '').trim()))].filter((k) => ALERT_FAMILY_RE.test(k))

  // 缺陷密度：quality-summary.env 双源口径（缺席如实 ⬜ 不编造）
  let defectDensity = '⬜（quality-summary.env 缺席——产品成效数字未采集，如实留空）'
  const qs = input.qualitySummaryEnv
  if (qs) {
    const defects = Number(/^defects_total=(.*)$/m.exec(qs)?.[1] ?? NaN)
    const tests = Number(/^n_tests=(.*)$/m.exec(qs)?.[1] ?? NaN)
    if (!Number.isNaN(defects) && !Number.isNaN(tests) && tests > 0) {
      defectDensity = `${defects} 缺陷 / ${tests} 用例 = ${(defects * 1000 / tests).toFixed(1)}/千用例`
    } else if (!Number.isNaN(tests)) {
      defectDensity = '⬜（n_tests=0 分母缺席）'
    }
  }

  // DISP 归桶（已修/已闭环/观察/延后前缀；其余=其他——与归档口径同源）
  const buckets = ['已修', '已闭环', '观察', '延后']
  const dispBuckets: Array<{ tag: string; n: number }> = []
  const bucketOf = (desc: string) => buckets.find((t) => desc.startsWith(t)) ?? '其他'
  for (const tag of [...buckets, '其他']) {
    const n = dispLines.filter((l) => bucketOf(l.split('|')[3] ?? '') === tag).length
    if (n > 0) dispBuckets.push({ tag, n })
  }

  // 问题唯一键（type·subject，保序去重）+ 频次
  const seen = new Set<string>()
  const uniqueKeys: string[] = []
  const freq = new Map<string, number>()
  for (const l of issueLines) {
    const [, code, subject] = l.split('|')
    const k = `${code}·${subject}`
    freq.set(k, (freq.get(k) ?? 0) + 1)
    if (!seen.has(k)) { seen.add(k); uniqueKeys.push(k) }
  }

  // DISP 配对（run13 复盘 A3/C1 修订口径——四变体归一的单实现）：
  //   ① type·subject 精确命中；② 同类型 DISP 主体为泛指（director/monitor/harness/
  //   导演/监控）→ 广播到该类型全部键；③ 该类型仅一个唯一键 → 容主体措辞差；
  //   ④ 其余=待处置（none）。三态+已闭环分桶，首词非桶词=表外词（四桶+表外
  //   求和=唯一键数，禁凭空消失）。
  const dispExact = new Map<string, string>()
  const dispGeneric = new Map<string, string>()
  const GENERIC_SUBJECTS = ['director', 'monitor', 'harness', '导演', '监控']
  for (const l of dispLines) {
    const p = l.split('|')
    if (p.length > 3) {
      if (GENERIC_SUBJECTS.includes(p[2])) dispGeneric.set(p[1], p[3])
      else dispExact.set(`${p[1]}·${p[2]}`, p[3])
    }
  }
  const keysByType = new Map<string, string[]>()
  for (const k of uniqueKeys) {
    const ty = k.split('·')[0]
    keysByType.set(ty, [...(keysByType.get(ty) ?? []), k])
  }
  const BUCKET_WORDS = ['已修', '已闭环', '观察', '延后']
  const bucketOfDisp = (d: string): IssuePairingRow['bucket'] => (BUCKET_WORDS.find((w) => d.startsWith(w)) ?? '表外词') as IssuePairingRow['bucket']
  const pairing: IssuePairingRow[] = uniqueKeys.map((key): IssuePairingRow => {
    const [type, subject] = key.split('·')
    const exact = dispExact.get(key)
    const sameTypeExact = [...dispExact.keys()].filter((k) => k.startsWith(`${type}·`))
    const mode: IssuePairingRow['mode'] = exact != null ? 'exact'
      : dispGeneric.has(type) ? 'generic'
      : sameTypeExact.length > 0 && keysByType.get(type)!.length === 1 ? 'single'
      : 'none'
    const singleDisp = mode === 'single' ? dispExact.get(sameTypeExact[0]) ?? '' : ''
    const disp = exact ?? dispGeneric.get(type) ?? singleDisp
    return {
      key, type, subject,
      freq: freq.get(key) ?? 1,
      mode,
      disposition: disp || null,
      bucket: disp ? bucketOfDisp(disp) : ('待处置' as const),
    }
  })

  const gateKeyLines = [
    ...Object.values(GATE_STATE_KEYS), 'uat_done',
  ].map((key) => ({ key, value: state[key] ?? '未落' }))

  const rejectGateRate = 6 - firstPass - supplementCount
  const window = `${today}..${today}`
  const metricsRows: MetricsRow[] = [
    {
      id: 'M1',
      csv: `${today},${rfd},M1,${round3(firstPass / 6)},${firstPass}/6,${window},state.env 落键实算,六闸全计（G3/G6 落键型无记录即首过；治理服务 run-metrics 单源计算）`,
    },
    ...(doneKeys > 0 ? [{
      id: 'M3' as const,
      csv: `${today},${rfd},M3,${round3((doneKeys - credentialMissing) / doneKeys)},${doneKeys - credentialMissing}/${doneKeys},${window},issues.log+state.env 实算,证据一次通过率=1-凭证缺件记录/完成环节键`,
    }] : []),
    {
      id: 'M4',
      csv: `${today},${rfd},M4,${rejectCount},${rejectCount},${window},issues.log 实算,打回次数=打回/拒收/熔断行计数`,
    },
    {
      id: 'M5',
      csv: `${today},${rfd},M5,${humanInterventions},${humanInterventions},${window},issues.log 实算,人工介入=DISP 注明导演计数（AI 主理占比 ⬜ 待协议事件结构化）`,
    },
  ]

  // 基线与趋势：读历史轮 governance-report.md 的 metrics CSV（缺文件=⬜ 不编造）
  const readPrev = input.readPrevReport ?? (() => null)
  const runDirs = (input.runDirs ?? []).filter((d) => RUN_DIR_RE.test(d) && d !== run).sort()
  const prevRun = runDirs[runDirs.length - 1] ?? null
  let baseline: RunMetrics['baseline'] = null
  if (prevRun) {
    const prev = readPrev(prevRun)
    if (prev) {
      const line = prev.split('\n').reverse().find((l) => l.includes('首过率')) ?? ''
      if (line) baseline = { prevRun, line }
    }
  }
  const trendRuns = [...runDirs.filter((d) => d !== run), run].sort().slice(-5)
  const trend = trendRuns.map((r) => {
    if (r === run) {
      return { run: r, firstPass: `${firstPass}/6`, rejectRate: `${rejectGateRate}/6`, density: defectDensity.includes('⬜') ? '⬜' : defectDensity }
    }
    const txt = readPrev(r)
    if (!txt) return { run: r, firstPass: '⬜', rejectRate: '⬜', density: '⬜' }
    const field = (name: string) => {
      const row = txt.split('\n').filter((l) => l.includes(`,${name},`)).pop() ?? ''
      return row.split(',')[4]?.split('（')[0] ?? '⬜'
    }
    return { run: r, firstPass: field('首过率'), rejectRate: field('打回率'), density: field('缺陷密度') }
  })

  return {
    run, rfd,
    issuesTotal: issueLines.length,
    dispTotal: dispLines.length,
    gateStats, firstPass, supplementCount, rejectGateCount,
    evidenceRate: { doneKeys, credentialMissing, text: evidenceText },
    rejectCount, humanInterventions,
    alertFamily: { count: alertKeys.length, keys: alertKeys },
    defectDensity,
    dispBuckets, uniqueKeys, pairing, gateKeyLines, metricsRows, baseline, trend,
  }
}

/** 采集端读文件输入（SIM_ROOT 下 run 真值）。 */
export function loadRunMetricsInput(root: string, run: string, rfd: string): RunMetricsInput | null {
  const runDir = resolve(root, 'runs', run)
  if (!existsSync(runDir)) return null
  const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
  const runsDir = resolve(root, 'runs')
  let runDirs: string[] = []
  try { runDirs = readdirSync(runsDir) } catch { /* 无历史轮 */ }
  return {
    run, rfd,
    issuesLog: read(resolve(runDir, 'evidence', 'issues.log')) || read(resolve(runDir, 'issues.log')),
    stateEnv: read(resolve(runDir, 'state.env')),
    qualitySummaryEnv: read(resolve(runDir, 'evidence', 'product-outcome', 'quality-summary.env')) || undefined,
    runDirs,
    readPrevReport: (r) => {
      const p = resolve(runsDir, r, 'evidence', 'governance-report.md')
      return existsSync(p) ? readFileSync(p, 'utf8') : null
    },
  }
}
