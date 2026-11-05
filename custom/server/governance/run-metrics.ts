/**
 * 治理指标计算（融合批三）——run 级治理数字的唯一实现。
 *
 * 移植自 simharness gov_report/gov_archive_commit（mx-scenario-lib.sh）的指标计算面：
 * 首过/补过/打回/unknown 四态、证据一次通过率、打回次数、人工介入、告警族聚合、
 * DISP 归桶、metrics-log CSV 行、上轮基线与近 5 轮趋势。口径逐条对齐原实现（含
 * run13 复盘 C3 修订：打回只认判词 FAIL/显式打回语义行，闸段其余问题单不计打回）；
 * simharness 侧计算退役（gov_report 改渲染壳，数字取本 DTO）。
 *
 * P0 Task 6：四态判定正本=平台证据适配器（platform/evidence/gate-evidence），
 * 本文件只消费其 status——完成键缺失/空=unknown（未观测不猜首过，旧口径「无记录
 * 即首过」退役）；任一闸 unknown 时首过率分母不完整，不产 M1 行、trend 首过率/
 * 打回率显 ⬜（分母不完整不产率）。
 *
 * 数据源（只读）：runs/<run>/evidence/issues.log、runs/<run>/state.env、
 * runs/<run>/evidence/product-outcome/quality-summary.env、历史轮 governance-report.md。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gateEvidenceFromState } from '../platform/evidence/gate-evidence'
import type { GateEvidence } from '../platform/evidence/gate-evidence'

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6'
export type GatePassState = '首过' | '补过' | '打回' | 'unknown'

/** 六闸 state 完成键（缺键/空值=unknown 未观测——P0 Task 6 起统一口径）。 */
export const GATE_STATE_KEYS: Readonly<Record<GateId, string>> = {
  G1: 'g1_frozen', G2: 'g2_arch_pass', G3: 'g3_code_pass',
  G4: 'g4_pass', G5: 'g5_ready', G6: 'retro_done',
}

const REJECT_WORD_RE = /(fail|FAIL|打回|拒收|熔断|退回)/
const CREDENTIAL_MISS_RE = /^(receipt-missing|raci-dispatch-missing|anexec-missing|evidence-missing|credential)/
const ALERT_FAMILY_RE = /^(gw-|capacity-|gateway-|wip-overload|load-|mx-load-)/
const RUN_DIR_RE = /^\d{8}-v\d+-run\d+$/

/**
 * 适配器 status → 治理四态中文态（显式分支）：意外 status 抛错而非静默落首过——
 * 含未来的 waived（豁免闸接入前须扩本映射，闸循环即 fail-fast 不猜态）。
 */
export function gateStateFromEvidence(evidence: GateEvidence): GatePassState {
  if (evidence.status === 'fail') return '打回'
  if (evidence.status === 'unknown') return 'unknown'
  if (evidence.status === 'pass') return evidence.supplement ? '补过' : '首过'
  throw new Error(`gateStateFromEvidence：意外的证据状态 ${evidence.status}（waived 豁免闸接入前须扩映射）`)
}

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
  /** P2 Task 2：末次适用 DISP 的行号（1 基，审计锚） */
  lastDispLine: number | null
  /** 已修/已闭环且证据锚齐全且 exact|single → 关闭（generic 广播不得批量关） */
  closed: boolean
  /** 处置有效性：已修/已闭环须锚、观察须复核理由、延后恒 valid */
  valid: boolean
  /** 未关闭/无效的原因（null=无异常） */
  closureError: string | null
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
  /** unknown 闸数（完成键缺失/空——首过率分母不完整位，>0 时不产 M1 行）。 */
  unknownGateCount: number
  evidenceRate: { doneKeys: number; credentialMissing: number; text: string }
  rejectCount: number
  humanInterventions: number
  alertFamily: { count: number; keys: string[] }
  defectDensity: string
  dispBuckets: Array<{ tag: string; n: number }>
  uniqueKeys: string[]
  pairing: IssuePairingRow[]
  /** P2 Task 2：DISP 终态分计数（closed+deferred+pending+invalid=唯一键数，禁凭空消失） */
  dispClosure: { closed: number; deferred: number; pending: number; invalid: number }
  /** 悬挂 DISP（处置的类型段无对应 ISSUE 类型——台账卫生观察位，R5b 口径）。 */
  danglingDispTypes: string[]
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

function sortedUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort()
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
  let gateSegmentIssues = 0
  for (let n = 1; n <= 6; n++) {
    const gate = `G${n}` as GateId
    const seg = issueLines.filter((l) => l.startsWith(`ISSUE|g${n}-`))
    gateSegmentIssues += seg.length
    // 四态判定正本=平台证据适配器（判定序：FAIL→打回；完成键缺失/空→unknown；
    // 补证→补过；其余→首过——打回证据优先于完成键，补证不掩盖缺键）；
    // status→中文态走 gateStateFromEvidence 显式分支（意外 status 抛错不猜态）
    const evidence = gateEvidenceFromState({
      gate,
      completionValue: state[GATE_STATE_KEYS[gate]],
      failed: seg.some((l) => REJECT_WORD_RE.test(l)),
      supplement: state[`g${n}_supplement`] === '1',
      // P1 Task 9 接线前显式声明 commit 缺席（适配器落 declaredMissing=true）
      commit: null,
    })
    const gateState = gateStateFromEvidence(evidence)
    gateStats.push({ gate, state: gateState, supplement: evidence.supplement, segmentIssues: seg.length })
  }
  // 四态计数一律从 gateStats 正数（禁反推公式：unknown 在场时 6-打回-补过 会虚增首过）
  const firstPass = gateStats.filter((g) => g.state === '首过').length
  const supplementCount = gateStats.filter((g) => g.state === '补过').length
  const rejectGateCount = gateStats.filter((g) => g.state === '打回').length
  const unknownGateCount = gateStats.filter((g) => g.state === 'unknown').length

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

  // DISP 配对（P2 Task 2 严格化——「每键行序末次适用」+ 关闭有效性判定）：
  //   ① 适用候选三类：exact（type·subject 精确命中，优先级最高）＞ generic（同类型
  //   DISP 主体为泛指 director/monitor/harness/导演/监控 → 广播到该类型全部键）＞
  //   single（该类型仅一个唯一键 → 容主体措辞差）；每键取最高优先级候选集中
  //   **行序最后**一条（末次适用=人工回写终态由新行承载，与 check-issue-clearance
  //   的末次 DISP 口径同源）。
  //   ② 关闭有效性：已修/已闭环须证据锚（commit sha/URL/file:line）；观察须复核
  //   理由；延后 valid 但不 closed；generic 广播不得批量关不同 subject。
  //   ③ 分计数 closed/deferred/pending/invalid 分区全量（和=唯一键数，禁凭空消失）。
  const GENERIC_SUBJECTS = ['director', 'monitor', 'harness', '导演', '监控']
  const keysByType = new Map<string, string[]>()
  for (const k of uniqueKeys) {
    const ty = k.split('·')[0]
    keysByType.set(ty, [...(keysByType.get(ty) ?? []), k])
  }
  // 逐行收集（保留行号：审计锚）
  const dispEntries = dispLines.map((l, idx) => {
    const p = l.split('|')
    return { line: idx + 1, type: p[1] ?? '', subject: p[2] ?? '', disp: p.length > 3 ? p[3] : '' }
  }).filter((e) => e.disp !== '' || e.type !== '')
  const BUCKET_WORDS = ['已修', '已闭环', '观察', '延后']
  const bucketOfDisp = (d: string): IssuePairingRow['bucket'] => (BUCKET_WORDS.find((w) => d.startsWith(w)) ?? '表外词') as IssuePairingRow['bucket']
  // 证据锚形态（实体判定，非字面词——「无锚声明」含「锚」字不算锚）：commit sha
  // （7-40 hex）/ URL / file:line 或含扩展名路径
  const ANCHOR_RE = /\b[0-9a-f]{7,40}\b|https?:\/\/\S+|\S+\.(?:md|ts|tsx|sh|py|mjs|js|vue|json)\b|\S+:\d+/
  /** 剥掉桶词前缀后的复核理由文本（括号体一并保留） */
  const reasonOf = (d: string, bucket: string): string => d.slice(bucket.length).replace(/^[（(]\s*/, '').replace(/\s*[）)]\s*$/, '').trim()

  const pairing: IssuePairingRow[] = uniqueKeys.map((key): IssuePairingRow => {
    const [type, subject] = key.split('·')
    const exacts = dispEntries.filter((e) => e.type === type && e.subject === subject && !GENERIC_SUBJECTS.includes(e.subject))
    const generics = dispEntries.filter((e) => e.type === type && GENERIC_SUBJECTS.includes(e.subject))
    const singleTypeKeys = keysByType.get(type) ?? []
    const singles = singleTypeKeys.length === 1 && exacts.length === 0
      ? dispEntries.filter((e) => e.type === type && !GENERIC_SUBJECTS.includes(e.subject))
      : []
    const mode: IssuePairingRow['mode'] = exacts.length > 0 ? 'exact'
      : generics.length > 0 ? 'generic'
      : singles.length > 0 ? 'single'
      : 'none'
    // 末次适用=所选类别的行序最后一条
    const chosen = mode === 'exact' ? exacts.at(-1)!
      : mode === 'generic' ? generics.at(-1)!
      : mode === 'single' ? singles.at(-1)!
      : null
    const disp = chosen?.disp ?? ''
    const bucket = disp ? bucketOfDisp(disp) : ('待处置' as const)

    // 关闭有效性判定（显式分支；closureError 一律给中文原因）
    let closed = false
    let valid = false
    let closureError: string | null = '无适用 DISP（待处置）'
    if (chosen) {
      closureError = null
      if (bucket === '已修' || bucket === '已闭环') {
        if (mode === 'generic') {
          valid = false
          closureError = 'generic 广播不批量关不同 subject——须逐键 exact/single DISP 关闭'
        } else if (ANCHOR_RE.test(disp)) {
          valid = true
          closed = true
        } else {
          valid = false
          closureError = `${bucket}缺证据锚（commit sha/URL/file:line）——人工带锚回写后关闭`
        }
      } else if (bucket === '观察') {
        const reason = reasonOf(disp, bucket)
        if (reason) { valid = true } else { valid = false; closureError = '观察缺复核理由（裸「观察」不 valid）' }
      } else if (bucket === '延后') {
        valid = true // 延后=合法挂起态，valid 但不 closed
      } else {
        valid = false
        closureError = '表外词（处置首词不在 已修/已闭环/观察/延后 四桶）'
      }
    }
    return {
      key, type, subject,
      freq: freq.get(key) ?? 1,
      mode,
      disposition: disp || null,
      bucket,
      lastDispLine: chosen?.line ?? null,
      closed,
      valid,
      closureError,
    }
  })

  // 分计数（分区全量：closed+deferred+pending+invalid=唯一键数）
  const dispClosure = {
    closed: pairing.filter((r) => r.closed).length,
    deferred: pairing.filter((r) => r.bucket === '延后' && r.valid).length,
    pending: pairing.filter((r) => !r.closed && !(r.bucket === '延后' && r.valid) && (r.mode === 'none' || r.valid)).length,
    invalid: pairing.filter((r) => r.disposition !== null && !r.valid).length,
  }

  const danglingDispTypes = sortedUnique(
    [...new Set([...dispEntries.map((e) => e.type)])]
      .filter((ty) => !keysByType.has(ty)),
  )

  const gateKeyLines = [
    ...Object.values(GATE_STATE_KEYS), 'uat_done',
  ].map((key) => ({ key, value: state[key] ?? '未落' }))

  const window = `${today}..${today}`
  const metricsRows: MetricsRow[] = [
    // M1（首过率）只在分母完整时产出：任一闸 unknown（完成键缺失/空）即缺行，
    // 不显 0/6 或 6/6 假成绩（设计书：界面与报告呈现未观测）。
    ...(unknownGateCount === 0 ? [{
      id: 'M1' as const,
      csv: `${today},${rfd},M1,${round3(firstPass / 6)},${firstPass}/6,${window},state.env 落键实算,六闸全计（缺完成键=unknown 不产本行；治理服务 run-metrics 单源计算）`,
    }] : []),
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
      // 分母不完整（任一闸 unknown）→ 首过率与打回率均如实 ⬜（分母 6 含未观测闸，
      // 产 X/6 即系统性低估打回面；渲染读 trend 末项，不自拼数字）。打回有两个
      // 口径不同的面，trend ⬜ 不吞它们：闸面 rejectGateCount（gateStats state=打回
      // 计数，rejectRate 分母）与 issues.log 行面 M4（REJECT_WORD_RE 打回/拒收/熔断
      // 行计数，恒产出行）——两者来源与含义都不同，不得互相替代或合并。
      return {
        run: r,
        firstPass: unknownGateCount > 0 ? '⬜' : `${firstPass}/6`,
        rejectRate: unknownGateCount > 0 ? '⬜' : `${rejectGateCount}/6`,
        density: defectDensity.includes('⬜') ? '⬜' : defectDensity,
      }
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
    gateStats, firstPass, supplementCount, rejectGateCount, unknownGateCount,
    evidenceRate: { doneKeys, credentialMissing, text: evidenceText },
    rejectCount, humanInterventions,
    alertFamily: { count: alertKeys.length, keys: alertKeys },
    defectDensity,
    dispBuckets, uniqueKeys, pairing, dispClosure, danglingDispTypes, gateKeyLines, metricsRows, baseline, trend,
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
