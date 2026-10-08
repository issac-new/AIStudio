import { describe, expect, it } from 'vitest'

import {
  GATE_VIEW_STEPS,
  MIN_ARTIFACT_VIEWS,
  checkFaceRateLine,
  checkGateArtifacts,
  checkQgateDiscipline,
  countArtifactViews,
  type StepBlock,
} from '../acceptance'
import { GOV_EVIDENCE_FILES, govEvidenceBlocks, qgateBlock } from '../evidence-blocks'
import { part1Skeleton, type RunFacts } from '../part1-skeleton'

/** run10 实测口径的步块样本（st-artifact 视图/无文件域声明两形态） */
function step(n: number, withView: boolean, withNoFileNote = false): StepBlock {
  const view = withView ? '<details class="st-artifact"><summary>📦 交付物</summary></details>' : ''
  const note = withNoFileNote ? '<p class="stat-note">📦 本步无文件域交付物——实际产出：评审卡 body。</p>' : ''
  return { n, html: `<article class="step">${view}${note}</article>` }
}

const RUN10_FACTS: RunFacts = {
  runId: '20261007-v8-run10',
  rfd: 'RFD-001',
  windowText: '10-07 01:21 → 10-07 14:29（约 13.1 小时）',
  featureFlags: '无特殊旗标',
  stepsDone: 25,
  gatesPassed: 6,
  firstPass: 4,
  issuesTotal: 22,
  disp: { 已修: 19, 观察: 6, 延后: 4 },
  typeTop: 'raci×4、anexec×3、report×2、dev×2、patch×1',
}

describe('报告验收断言（§5.4/§5.5 机器执法面，正本移植）', () => {
  it('六闸步全有视图/声明 → 过；步 15 双缺 → 打回', () => {
    const pass = checkGateArtifacts([
      step(7, true), step(15, false, true), step(18, true), step(19, true), step(20, true), step(24, true),
    ])
    expect(pass.ok).toBe(true)

    const fail = checkGateArtifacts([
      step(7, true), step(15, false), step(18, true), step(19, true), step(20, true), step(24, true),
    ])
    expect(fail.ok).toBe(false)
    expect(fail.missing).toEqual(['步15(G2 评审卡)'])
  })

  it('六闸步集与方案一致（7/15/18/19/20/24）', () => {
    expect(Object.keys(GATE_VIEW_STEPS).map(Number).sort((a, b) => a - b)).toEqual([7, 15, 18, 19, 20, 24])
  })

  it('承载率行：在位读数；缺位=违例；<4/5=预警不阻断', () => {
    expect(checkFaceRateLine('…产品面承载率 <b>5/5</b>（验收线 ≥4/5）…')).toMatchObject({ missing: false, n: 5, belowLine: false, ok: true })
    expect(checkFaceRateLine('…产品面承载率 <b>3/5</b>…')).toMatchObject({ belowLine: true, ok: true })
    expect(checkFaceRateLine('<p>无此行</p>')).toMatchObject({ missing: true, ok: false })
  })

  it('交付物视图计数达底线 15', () => {
    expect(MIN_ARTIFACT_VIEWS).toBe(15)
    expect(countArtifactViews('<div class="art-item">a</div><div class="art-item">b</div>')).toBe(2)
  })

  it('QGate 纪律：透传+来源分布=过；桶脏+报告侧"全绿"=违例；原文 <pre> 内的"全绿"不算', () => {
    const ok = qgateBlock('来源分布：核验 40/声明 3/降级 2/无信号 0')
    expect(checkQgateDiscipline(ok).ok).toBe(true)

    const dirtyButHonest = qgateBlock('来源分布：核验 40\n未验证声明：2\n——summary（原文措辞：全绿）')
    expect(checkQgateDiscipline(dirtyButHonest).ok).toBe(true) // "全绿"在 <pre> 原文内

    const dirtyClaim = '<details class="st-artifact st-qgate"><summary>来源分布随行</summary>' +
      '<div>QGate 已核验全绿</div><pre>未验证声明：2</pre></details>'
    expect(checkQgateDiscipline(dirtyClaim).ok).toBe(false)

    const noDist = qgateBlock('只有结论没有分布行')
    expect(checkQgateDiscipline(noDist).ok).toBe(false)
  })
})

describe('证据透传块（导出件原文，禁手抄）', () => {
  it('QGate 块含来源分布要求与原文转义', () => {
    const h = qgateBlock('来源分布 <x>')
    expect(h).toContain('st-qgate')
    expect(h).toContain('来源分布')
    expect(h).toContain('&lt;x&gt;')
  })

  it('治理证据块三件清单与步号一致（23=事故汇编，24=对账+损益表）', () => {
    expect(GOV_EVIDENCE_FILES[23]!.map((i) => i.file)).toEqual(['incident-report.md'])
    expect(GOV_EVIDENCE_FILES[24]!.map((i) => i.file)).toEqual(['autonomy-reconcile.txt', 'virtual-pl.txt'])
    const h = govEvidenceBlocks([
      { label: '事故报告汇编（导出件）', raw: '# 事故报告\n要素 1' },
      { label: 'AI 虚拟损益表（导出件）', raw: 'orchestrator 交付 116 件' },
    ])
    expect((h.match(/st-gov/g) || []).length).toBe(2)
    expect(h).toContain('orchestrator 交付 116 件')
  })
})

describe('PART1 五段式骨架（数字实算槽+语境 TODO）', () => {
  it('run10 口径数字全嵌入，合并槽保持原样', () => {
    const h = part1Skeleton(RUN10_FACTS)
    expect(h).toContain('26 步 25/26 落键')
    expect(h).toContain('六闸 6/6 过，首过 4/6')
    expect(h).toContain('问题单 22 项（DISP：已修 19，观察 6，延后 4）')
    expect(h).toContain('raci×4、anexec×3')
    expect(h).toContain('{{run_id}}')
    expect(h).toContain('{{n_frames}}')
    expect(h).toContain('{{uniq_note}}')
    expect(h).toContain('{{ch0}}')
    expect((h.match(/【TODO/g) || []).length).toBeGreaterThanOrEqual(3)
  })
})
