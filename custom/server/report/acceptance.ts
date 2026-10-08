/**
 * 报告验收断言（全流程推演方案 §5.4/§5.5 的机器执法面——能力正本自 simharness
 * mx-report-audit.py 查 10/11/12 移植，2026-10-08 落地 overlay 建设实施）。
 *
 * 三组断言，全部为纯函数（输入报告 HTML 片段，输出违例清单）：
 *  ①六闸工件视图——步 7/15/18/19/20/24 步块须含交付物视图（st-artifact）或
 *    "无文件域交付物"声明（§5.4 必备六件缺一打回）；
 *  ②产品面承载率行——报告须含"产品面承载率 n/5"行（缺行即违例；<4/5 记预警，
 *    不阻断收官——§5.5 口径）；
 *  ③QGate 证据纪律——QGate 证据块须带来源分布；含未验证声明/advisory 未清时
 *    报告侧声明文字（透传原文 <pre> 之外）禁"全绿/已核验"（v1.31.1 吸收轮起）。
 *
 * simharness 侧 mx-report-audit.py 为兼容消费壳（推演期 run11 及图执行转译完成前
 * 继续由其出报告）；本模块是语义正本——两侧判定必须一致，差异即缺陷。
 */

export interface StepBlock {
  /** 步号 1-26 */
  n: number
  /** 步块 HTML（含交付物视图/声明/证据块） */
  html: string
}

/** §5.4 必备六件：闸步 → 工件名（步 15 G2=评审卡 body，无文件域） */
export const GATE_VIEW_STEPS: Readonly<Record<number, string>> = {
  7: 'G1 冻结件',
  15: 'G2 评审卡',
  18: 'G3 testlog',
  19: 'G4 测试报告',
  20: 'G5 发布计划',
  24: 'G6 复盘',
}

/** 交付物视图数量底线（§5.4：每轮 ≥15 类） */
export const MIN_ARTIFACT_VIEWS = 15

export interface GateArtifactsVerdict {
  missing: string[]
  ok: boolean
}

/** 断言①：六闸步块须有交付物视图或无文件域声明（缺一即打回） */
export function checkGateArtifacts(blocks: StepBlock[]): GateArtifactsVerdict {
  const missing: string[] = []
  for (const b of blocks) {
    const name = GATE_VIEW_STEPS[b.n]
    if (!name) continue
    if (!b.html.includes('st-artifact') && !b.html.includes('无文件域交付物')) {
      missing.push(`步${b.n}(${name})`)
    }
  }
  return { missing, ok: missing.length === 0 }
}

/** 报告全文里的交付物视图计数（class="art-item" 出现次数） */
export function countArtifactViews(html: string): number {
  return (html.match(/class="art-item"/g) || []).length
}

export interface FaceRateVerdict {
  /** 行缺位=违例（FAIL 级） */
  missing: boolean
  /** 实测 n/5；行缺位时为 null */
  n: number | null
  /** n<4（验收线之下=预警级，不阻断，逐面记单） */
  belowLine: boolean
  ok: boolean
}

/** 断言②：承载率行在位且数字诚实可读 */
export function checkFaceRateLine(html: string): FaceRateVerdict {
  const m = html.match(/产品面承载率 <b>(\d)\/5<\/b>/)
  if (!m) return { missing: true, n: null, belowLine: false, ok: false }
  const n = Number(m[1])
  return { missing: false, n, belowLine: n < 4, ok: true }
}

export interface QgateVerdict {
  violations: string[]
  ok: boolean
}

/** 断言③：QGate 证据纪律（§5.5 v1.31.1）。判定剔除模板摘要（<summary> 是本模块
 *  自产的固定文案，含"来源分布/全绿"字样——不剔除会自我满足/自我误伤）；
 *  透传原文 <pre> 是 QGate 自己的输出，其桶数据与措辞不作报告违例依据。 */
export function checkQgateDiscipline(html: string): QgateVerdict {
  const violations: string[] = []
  const blocks = html.match(/<details class="st-artifact st-qgate"[\s\S]*?<\/details>/g) || []
  for (const qb of blocks) {
    const noSummary = qb.replace(/<summary[\s\S]*?<\/summary>/g, '')
    if (!noSummary.includes('来源分布') && !noSummary.toLowerCase().includes('source')) {
      violations.push('QGate 证据块缺来源分布行——透传 release-report 原文即可满足')
    }
    const outsidePre = noSummary.replace(/<pre[\s\S]*?<\/pre>/g, '')
    const dirty = ['未验证', 'advisory', 'gate-not-run', 'no-gate'].some((k) => noSummary.includes(k))
    if (dirty && (outsidePre.includes('全绿') || outsidePre.includes('已核验'))) {
      violations.push('QGate 证据含未验证声明/advisory 未清，报告侧却表述"全绿/已核验"')
    }
    break // 块唯一（步 20），只判一次
  }
  return { violations, ok: violations.length === 0 }
}
