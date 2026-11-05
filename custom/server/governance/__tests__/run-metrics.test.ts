// run-metrics 守门（融合批三）：口径正本自 simharness gov_report/gov_archive_commit
// 移植。钉三态（首过/补过/打回）、证据率、密度双源、告警族、DISP 归桶、metrics
// CSV 行格式、基线/趋势缺文件=⬜（run13 C3：闸段事故单不计打回）。
import { describe, expect, it } from 'vitest'
import { computeRunMetrics, gateStateFromEvidence, parseStateEnvKeys } from '../run-metrics'

const ISSUES = `ISSUE|g1-review|bella|G1 判读缺要素后补齐（首过前补交形态）
ISSUE|g2-style|arch|设计五要素缺验证计划（闸段观察单）
ISSUE|g5-ready-fail|fanfan|G5 准备失败
ISSUE|gw-restart|studio|网关重启一次
ISSUE|capacity-drop|gateway|容量丢弃
ISSUE|receipt-missing|AN-MP-1|完成回执未见
DISP|g1-review|bella|已修 补齐后过
DISP|gw-restart|studio|观察 重启后恢复
DISP|uat-cond-proxy|RFD-001|延后 放行权归 bella`

const STATE = `g1_frozen=1790000000
g1_supplement=1
g2_arch_pass=1790000001
g3_code_pass=1790000002
g4_pass=1790000003
g5_ready=1790000004
retro_done=1790000005
smoke_done=1
appinit_done=1790000006
uat_done=1790000007
jwt_fanfan=x`

const PREV_REPORT = `## metrics 回写
\`\`\`csv
2026-10-26,RFD-001,G1-G6,首过率,3/6（G1补过 G5打回）,2026-10-26..2026-10-26,issues.log 实算,六闸全计
2026-10-26,RFD-001,G1-G6,打回率,1/6,2026-10-26..2026-10-26,issues.log 实算,打回数/6
\`\`\``

const mk = (over: Partial<Parameters<typeof computeRunMetrics>[0]> = {}) => computeRunMetrics({
  run: '20261027-v8-run24',
  rfd: 'RFD-001',
  issuesLog: ISSUES,
  stateEnv: STATE,
  runDirs: ['20261026-v8-run23'],
  readPrevReport: () => PREV_REPORT,
  today: '2026-10-27',
  ...over,
})

describe('computeRunMetrics', () => {
  it('三态：G1 补过（退回补齐+supplement 键）、G5 打回（判词 FAIL）、余闸首过', () => {
    const m = mk()
    const by = (g: string) => m.gateStats.find((s) => s.gate === g)!
    expect(by('G1').state).toBe('补过')
    expect(by('G5').state).toBe('打回')
    expect(by('G2').state).toBe('首过')
    expect(m.firstPass).toBe(4)
    expect(m.supplementCount).toBe(1)
    expect(m.rejectGateCount).toBe(1)
  })

  it('闸段事故单不计打回（run13 C3：g2-style 无打回词=G2 首过）', () => {
    const m = mk()
    expect(m.gateStats.find((s) => s.gate === 'G2')!.segmentIssues).toBe(1)
  })

  it('证据率/打回次数/人工介入/告警族', () => {
    const m = mk()
    expect(m.evidenceRate).toMatchObject({ doneKeys: 4, credentialMissing: 1 })
    expect(m.evidenceRate.text).toBe('3/4（凭证族记录 1 起）')
    expect(m.rejectCount).toBe(1)   // g5-ready-fail（g1 行无打回词不计——闸段事故单不计打回）
    expect(m.humanInterventions).toBe(0)
    expect(m.alertFamily.count).toBe(2)
    expect(m.alertFamily.keys).toEqual(['gw-restart', 'capacity-drop'])
  })

  it('密度双源：quality-summary.env 在场=实算；缺席=如实 ⬜', () => {
    const withQs = mk({ qualitySummaryEnv: 'defects_total=3\nn_tests=200\n' })
    expect(withQs.defectDensity).toBe('3 缺陷 / 200 用例 = 15.0/千用例')
    expect(mk().defectDensity).toContain('⬜')
  })

  it('DISP 归桶与唯一键', () => {
    const m = mk()
    expect(m.dispBuckets).toEqual([
      { tag: '已修', n: 1 }, { tag: '观察', n: 1 }, { tag: '延后', n: 1 },
    ])
    expect(m.uniqueKeys[0]).toBe('g1-review·bella')
    expect(m.issuesTotal).toBe(6)
    expect(m.dispTotal).toBe(3)
  })

  it('metrics CSV 行格式（M1/M3/M4/M5；score 三位小数）', () => {
    const m = mk()
    const m1 = m.metricsRows.find((r) => r.id === 'M1')!
    expect(m1.csv).toBe('2026-10-27,RFD-001,M1,0.667,4/6,2026-10-27..2026-10-27,state.env 落键实算,六闸全计（缺完成键=unknown 不产本行；治理服务 run-metrics 单源计算）')
    expect(m.metricsRows.find((r) => r.id === 'M3')!.csv).toContain('3/4')
    expect(m.metricsRows.find((r) => r.id === 'M4')!.csv).toBe('2026-10-27,RFD-001,M4,1,1,2026-10-27..2026-10-27,issues.log 实算,打回次数=打回/拒收/熔断行计数')
  })

  it('基线=上轮首过率行；趋势缺文件=⬜；本轮取实算值', () => {
    const m = mk()
    expect(m.baseline?.prevRun).toBe('20261026-v8-run23')
    expect(m.baseline?.line).toContain('3/6')
    expect(m.trend).toHaveLength(2)
    expect(m.trend[0]).toMatchObject({ run: '20261026-v8-run23', firstPass: '3/6' })
    const noPrev = mk({ runDirs: [], readPrevReport: () => null })
    expect(noPrev.baseline).toBeNull()
  })

  it('DISP 配对四变体归一（exact/generic 广播/single 容差/none；表外词不消失）', () => {
    const issues = [
      'ISSUE|g1-review|bella|缺要素',
      'ISSUE|r18-collection-missing|step-23|A 处置',
      'ISSUE|r18-collection-missing|PAYCORE-C|B 处置',
      'ISSUE|r18-collection-missing|CHWX-C|C 处置',
      'ISSUE|gw-restart|director|网关重启',
      'ISSUE|uat-cond|fanfan|有条件',
      'ISSUE|legacy|x|老键',
    ].join('\n')
    const disps = [
      'DISP|g1-review|bella|已修 补齐后过',
      'DISP|r18-collection-missing|monitor|观察 统一处置',
      'DISP|gw-restart|director|观察 恢复',
      'DISP|uat-cond|fanfan-agent|延后 归 bella',
      'DISP|security-gate-unlock-chain|chen,secops|安全闸 FAIL 解锁链：修复令+复审令已发',
    ].join('\n')
    const m = computeRunMetrics({
      run: 'r', rfd: 'R', issuesLog: `${issues}\n${disps}`, stateEnv: '', today: '2026-10-27',
      runDirs: [], readPrevReport: () => null,
    })
    const by = (k: string) => m.pairing.find((r) => r.key === k)!
    expect(by('g1-review·bella')).toMatchObject({ mode: 'exact', bucket: '已修' })
    expect(by('r18-collection-missing·step-23')).toMatchObject({ mode: 'generic', bucket: '观察' })
    expect(by('r18-collection-missing·PAYCORE-C')).toMatchObject({ mode: 'generic', bucket: '观察' })
    expect(by('gw-restart·director')).toMatchObject({ mode: 'generic', bucket: '观察' })
    expect(by('uat-cond·fanfan')).toMatchObject({ mode: 'single', bucket: '延后' })
    expect(by('legacy·x')).toMatchObject({ mode: 'none', bucket: '待处置' })
    // 悬挂 DISP：处置类型段无对应 ISSUE 类型（夹具 security-gate-unlock-chain）
    expect(m.danglingDispTypes).toContain('security-gate-unlock-chain')
    expect(by('g1-review·bella').freq).toBe(1)
  })
})

describe('unknown 四态（P0 Task 6：完成键缺失=未观测，不产 M1 不显 0/6）', () => {
  const withoutKey = (key: string) => STATE.split('\n').filter((l) => !l.startsWith(`${key}=`)).join('\n')

  it('空状态/空 issues：六闸全 unknown、首过 0、不产 M1、trend 末项 ⬜', () => {
    const empty = computeRunMetrics({ run: 'empty', rfd: 'RFD-X', issuesLog: '', stateEnv: '' })
    expect(empty.gateStats.every((gate) => gate.state === 'unknown')).toBe(true)
    expect(empty.firstPass).toBe(0)
    expect(empty.supplementCount).toBe(0)
    expect(empty.rejectGateCount).toBe(0)
    expect(empty.unknownGateCount).toBe(6)
    // M1（首过率分母成绩）不产；计数型/独立分母行如实保留
    expect(empty.metricsRows.some((row) => row.id === 'M1')).toBe(false)
    expect(empty.metricsRows.some((row) => row.id === 'M4')).toBe(true)
    expect(empty.metricsRows.some((row) => row.id === 'M5')).toBe(true)
    expect(empty.trend.at(-1)!.firstPass).toBe('⬜')
    // 分母不完整不产率：打回率分母 6 同样含未观测闸，unknown 轮不得显 X/6（系统性低估）
    expect(empty.trend.at(-1)!.rejectRate).toBe('⬜')
  })

  it('单闸缺完成键（g2_arch_pass）：unknownGateCount=1、M1 不产、计数全从 gateStats 出', () => {
    const partial = mk({ stateEnv: withoutKey('g2_arch_pass') })
    expect(partial.unknownGateCount).toBe(1)
    expect(partial.gateStats.find((g) => g.gate === 'G2')!.state).toBe('unknown')
    // G1 补过、G5 打回、G2 unknown，余 G3/G4/G6 首过：四态计数和=6（禁反推公式）
    expect(partial.firstPass).toBe(3)
    expect(partial.supplementCount).toBe(1)
    expect(partial.rejectGateCount).toBe(1)
    expect(partial.firstPass + partial.supplementCount + partial.rejectGateCount + partial.unknownGateCount).toBe(6)
    expect(partial.metricsRows.some((row) => row.id === 'M1')).toBe(false)
    expect(partial.trend.at(-1)!.firstPass).toBe('⬜')
    expect(partial.trend.at(-1)!.rejectRate).toBe('⬜')
  })

  it('空串完成键同缺键：g4_pass= → G4 unknown', () => {
    const blank = mk({ stateEnv: STATE.replace('g4_pass=1790000003', 'g4_pass=') })
    expect(blank.gateStats.find((g) => g.gate === 'G4')!.state).toBe('unknown')
    expect(blank.unknownGateCount).toBe(1)
  })

  it('打回优先于完成键：G5 键缺失+判词 FAIL → 打回（非 unknown，unknown 计 0）', () => {
    const m = mk({ stateEnv: withoutKey('g5_ready') })
    expect(m.gateStats.find((g) => g.gate === 'G5')!.state).toBe('打回')
    expect(m.unknownGateCount).toBe(0)   // 唯一缺键闸已被判词定性，不重复计 unknown
    expect(m.rejectGateCount).toBe(1)
  })

  it('补证不掩盖缺键：g1_frozen 缺（g1_supplement=1 在）→ G1 unknown、补过数 0', () => {
    const m = mk({ stateEnv: withoutKey('g1_frozen') })
    expect(m.gateStats.find((g) => g.gate === 'G1')!.state).toBe('unknown')
    expect(m.supplementCount).toBe(0)
  })

  it('分母完整（完整样本）：unknownGateCount=0 → M1 在场、trend 末项 4/6（旧数值不变）', () => {
    const m = mk()
    expect(m.unknownGateCount).toBe(0)
    expect(m.metricsRows.find((r) => r.id === 'M1')!.csv).toContain('4/6')
    expect(m.trend.at(-1)!.firstPass).toBe('4/6')
    expect(m.trend.at(-1)!.rejectRate).toBe('1/6')
  })
})

describe('gateStateFromEvidence（status→四态显式分支；意外 status 抛错不静默落首过）', () => {
  // 九字段形状（P1 Task 2）：gateStateFromEvidence 只读 status/supplement，此处手工构造全字段保持类型如实
  const rec = (status: 'pass' | 'fail' | 'unknown' | 'waived', supplement = false) =>
    ({
      evidenceId: 'gev/test/1', subjectId: 'G1', status, producer: 'gate-evidence', commit: null,
      startedAt: 1, endedAt: 1, sourceDigest: status === 'unknown' ? null : '1790000000',
      artifactRefs: [], supplement, declaredMissing: true,
    })

  it('pass±补证 / unknown / fail 各归位（与闸循环判定同源）', () => {
    expect(gateStateFromEvidence(rec('pass'))).toBe('首过')
    expect(gateStateFromEvidence(rec('pass', true))).toBe('补过')
    expect(gateStateFromEvidence(rec('unknown'))).toBe('unknown')
    expect(gateStateFromEvidence(rec('fail'))).toBe('打回')
  })

  it('意外 status（含未来 waived）抛错——豁免闸接入前须扩映射，禁静默落首过', () => {
    expect(() => gateStateFromEvidence(rec('waived'))).toThrow(/waived/)
  })
})

describe('parseStateEnvKeys（首行胜出）', () => {
  it('重复键取首行', () => {
    expect(parseStateEnvKeys('g1_frozen=1\ng1_frozen=2\n')).toEqual({ g1_frozen: '1' })
  })
})
