/**
 * 报告验收断言（全流程推演方案 §5.4/§5.5 的机器执法面——能力正本自 simharness
 * mx-report-audit.py 查 10/11/12 移植，2026-10-08 落地 overlay 建设实施）。
 *
 * 三组断言，全部为纯函数（输入报告 HTML 片段，输出违例清单）：
 *  ①六闸工件视图——步 7/15/18/19/20/24 步块须含交付物视图（st-artifact）或
 *    "无文件域交付物"声明（§5.4 必备六件缺一打回）；
 *  ②产品面承载率行——报告须含"产品面承载率 n/5"行（缺行即违例；<4/5 记预警，
 *    不阻断收尾——§5.5 口径）；
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
  /** n<4（验收线之下=预警级，不阻断，逐面登记） */
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

// ── V8.4 截图红线（§5.5，2026-10-10 接线轮；与 simharness mx-report-audit.py
//    A5d/A5g 同语义——两侧判定必须一致，差异即缺陷）──

/** 画面词=可指认的画面落点；结果词=步结论字样（"freeze 在仓"是结论不是画面） */
const PICTURE_WORDS = ['面', '页', '视图', '板', '窗', '列表', '面板', '看板', '房间', '灯', '画布', '台账', '报告', 'IDE', '环境', '入口', '矩阵', '收件箱']
const OUTCOME_WORDS = ['在仓', '入仓', '落盘', '过闸', '全绿', '核验过', '分齐', '登记完成']
/** ④b 隔离区帧禁入正本（V8.4 §5.6 ⑩ 2026-10-10 修订：准确补拍解禁——带时点
 *  图注的补拍帧合规，晚拍降级归 ③ 侧；仍禁=隔离区帧嵌入正本，检测收窄到
 *  img src/figcaption 上下文——叙事与问题单正文提及目录名是合法 provenance，
 *  不误杀。与 simharness mx-report-audit.py ④ 同语义，差异即缺陷。） */
const FRAMES_DEGRADED_EMBEDDED = /(?:src="[^"]*frames-degraded|<figcaption>(?:(?!<\/figcaption>).)*frames-degraded)/s

export interface FrameEvidenceVerdict {
  /** ①图注非画面描述（步结果式/纯位序模板） */
  badCaptions: string[]
  /** ②同一 src 多处嵌入（run12 实锤：同帧双图注双嵌） */
  duplicatedSources: string[]
  /** ④b 隔离区帧嵌入正本（src/figcaption 上下文含 frames-degraded） */
  backfillMarker: string | null
  ok: boolean
}

/** 断言④：帧证据三断言（HTML 纯函数）。③帧时刻窗（r18 采集记录 ts 对 run 窗口）
 *  依赖运行上下文，执法面在 simharness A5e/f——语义同源，载体各司其职。 */
export function checkFrameEvidence(html: string): FrameEvidenceVerdict {
  const badCaptions: string[] = []
  for (const m of html.matchAll(/<figcaption>([\s\S]*?)<\/figcaption>/g)) {
    let c = (m[1] || '').replace(/<span class="shot-kind"[\s\S]*?<\/span>/g, '')
    c = c.replace(/<[^>]+>/g, '').trim()
    if (/^[①②③]?\s*(操作前|操作动作|系统响应)$/.test(c)) {
      badCaptions.push(`「${c}」纯位序模板`)
    } else if (c && OUTCOME_WORDS.some((w) => c.includes(w)) && !PICTURE_WORDS.some((w) => c.includes(w))) {
      badCaptions.push(`「${c}」步结果式`)
    }
  }
  const srcs = [...html.matchAll(/src="((?:screenshots\/steps|product-outcome)\/[^"]+)"/g)].map((m) => m[1] as string)
  const counts = new Map<string, number>()
  for (const s of srcs) counts.set(s, (counts.get(s) || 0) + 1)
  const duplicatedSources = [...counts.entries()].filter(([, c]) => c > 1).map(([s]) => s)
  const backfillMarker = FRAMES_DEGRADED_EMBEDDED.test(html) ? 'frames-degraded' : null
  return { badCaptions, duplicatedSources, backfillMarker, ok: !badCaptions.length && !duplicatedSources.length && !backfillMarker }
}

/** ── 2026-10-11 新增两组断言（与 simharness mx-report-audit A9/产品成效系列对齐）── */

export interface EnvMaskVerdict {
  /** 泄漏样例（最多 3 条） */
  leaks: string[]
  ok: boolean
}

/**
 * 断言④（A9 等价，§5.4.3 宿主环境脱敏）：报告 HTML 禁出现家目录/外置卷路径。
 * 与 maskEnvPaths（evidence-blocks）同规则——渲染层漏掩码在此拦截。
 */
export function checkEnvMasking(html: string): EnvMaskVerdict {
  const leaks = (html.match(/\/Users\/[A-Za-z0-9_.-]+|\/Volumes\/[A-Za-z0-9_.-]+/g) || []).slice(0, 3)
  return { leaks, ok: leaks.length === 0 }
}

export interface ProductOutcomeGridVerdict {
  violations: string[]
  ok: boolean
}

/**
 * 断言⑤（§5.4.4 系列完整性版面）：产品成效节在位时——
 * ①须为四列缩略网格（.po-shots）承载系列帧，禁整宽单帧平铺；
 * ②每帧图注非空（figcaption 有文本）。
 */
export function checkProductOutcomeGrid(html: string): ProductOutcomeGridVerdict {
  const violations: string[] = []
  if (html.includes('产品功能实证')) {
    if (!html.includes('class="po-shots"')) violations.push('产品成效帧未用四列缩略网格 .po-shots（§5.4.4 版面：1/4 宽网格+点击放大）')
    const captions = html.match(/<figcaption><span class="shot-kind">功能实证<\/span>([^<]*)<\/figcaption>/g) || []
    if (captions.length === 0 || captions.some((c) => c.replace(/<[^>]+>/g, '').trim().length < 3)) {
      violations.push('产品成效帧图注缺失或为空（帧名短图注，禁长路径前缀）')
    }
  }
  return { violations, ok: violations.length === 0 }
}

