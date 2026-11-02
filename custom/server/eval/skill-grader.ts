// overlay[eval] 技能产出 Grader 环（spec: 2026-11-02-skill-grader.md，方法论吸收批 E）。
//
// 评估对象＝spec §19 测试左移段（MAET 契约锚定，批 C 立约、本环评执行质量）：
//   S0 机械结构四判（零判定费）→ S1 语义四维（rubric 断言问句，经注入 AskFn 发问）。
// 分层纪律与 judge.ts 同构：S0 可判的维度不发问；ask 不可用/熔断 → S1 全维 unknown
// 不抛错（fail-open）；S0 全过而 S1 全 unknown → 整体 CONDITIONAL（非 PASS，防假绿）。
// 反偏置纪律沿用：问句只含 spec 文本断言与行为锚点，不携带期望答案（expect 只在
// 聚合层比对）。基线快照走 append-only jsonl（运行态工件，不入 eval store）。
import { appendFileSync, mkdirSync, readFileSync } from 'fs'
import { dirname } from 'path'
import { JUDGE_BIAS_GUARD, truncateForState, type AskFn } from './judge'
import { Breaker, TtlCache, clefAsk, sha1Of, type ClefJudgeDeps, type EvalJudgeAnswers, type EvalJudgeRequest } from './clef'
import type { Binary, EvalConfig } from './types'

// ---------- §19 段提取与表解析 ----------

/**
 * 提取 spec §19 测试左移段（含 19.1/19.2/19.3）：从 `## 19.` 起、到下一个二级标题止。
 * 段缺席返回 null——S0 四判随之为 fail，语义维按「无证据」处理。
 */
export function extractTestDesignSection(specText: string): string | null {
  const start = /^#{2}\s*19\s*[.、．]/m.exec(specText)
  if (!start) return null
  const after = specText.slice(start.index + start[0].length)
  const end = /^#{2}\s/m.exec(after)
  return start[0] + (end ? after.slice(0, end.index) : after)
}

/** markdown 表行 → 单元格数组（去首尾竖线）。 */
function splitRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|[ \t]*$/, '').split('|').map((c) => c.trim())
}

/** 表分隔行（|---|---| 形）。 */
function isSeparatorRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && /^\|?[\s:|-]+\|?$/.test(t) && t.includes('-')
}

interface ParsedTable {
  header: string[]
  rows: string[][]
}

/** 取文本内第一张 markdown 表（表头行＋紧随分隔行）。 */
function parseFirstTable(text: string): ParsedTable | null {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) continue
    const next = lines[i + 1]
    if (!next || !isSeparatorRow(next)) continue
    const header = splitRow(line)
    const rows: string[][] = []
    for (let j = i + 2; j < lines.length; j += 1) {
      const rowLine = lines[j].trim()
      if (!rowLine.startsWith('|') || isSeparatorRow(rowLine)) break
      rows.push(splitRow(rowLine))
    }
    return { header, rows }
  }
  return null
}

/** §19.x 子段文本（到下一个三级及更深标题止）；子段缺席返回 null。 */
function subsection(section: string, num: '19.1' | '19.2' | '19.3'): string | null {
  const m = new RegExp(`^#{3,}\\s*${num.replace('.', '\\.')}\\b`, 'm').exec(section)
  if (!m) return null
  const after = section.slice(m.index + m[0].length)
  const end = /^#{3,}\s/m.exec(after)
  return end ? after.slice(0, end.index) : after
}

/** 用例骨架表：优先 §19.2 子段内；子段缺席退整段首表（机械判对格式变异容错）。 */
function skeletonTable(section: string): ParsedTable | null {
  return parseFirstTable(subsection(section, '19.2') ?? section)
}

/** 路径类型单元格取 M/A/E/T：字母开头且不接 ASCII 字母（`M`/`M（Main）` 算，`Main` 不算）。 */
function isPathLetter(cell: string, letter: 'M' | 'A' | 'E' | 'T'): boolean {
  return cell.startsWith(letter) && !/^[A-Za-z]{2}/.test(cell)
}

function pathTypeColumn(table: ParsedTable): number {
  return table.header.findIndex((c) => c.includes('路径类型'))
}

// ---------- S0 机械结构四判 ----------

export type S0CheckId = 'maet-rows' | 'path-type-column' | 'gwt-columns' | 'checklist-nonempty'

export interface S0CheckOutcome {
  id: S0CheckId
  label: string
  pass: boolean
  detail: string
}

export interface S0StructureCheck {
  id: S0CheckId
  label: string
  /** 纯函数：输入 §19 段文本（段缺席=null），机械判定 pass/fail。 */
  check: (section: string | null) => { pass: boolean; detail: string }
}

const MAET_LETTERS = ['M', 'A', 'E', 'T'] as const

/**
 * S0 机械结构四判（spec 变更 §1）：
 *   1. maet-rows         用例骨架路径类型列 M/A/E/T 四类行存在性
 *   2. path-type-column  「路径类型」列在表头
 *   3. gwt-columns       Given/When/Then（GWT）列在表头
 *   4. checklist-nonempty §19.3 声明 checklist 有非空项
 */
export const S0_STRUCTURE_CHECKS: readonly S0StructureCheck[] = [
  {
    id: 'maet-rows',
    label: 'MAET 四路径行（M/A/E/T）存在性',
    check: (section) => {
      if (section === null) return { pass: false, detail: '§19 段缺席' }
      const table = skeletonTable(section)
      if (!table) return { pass: false, detail: '未找到 §19.2 用例骨架表' }
      const col = pathTypeColumn(table)
      if (col < 0) return { pass: false, detail: '骨架表表头缺「路径类型」列，无法机械判 M/A/E/T' }
      const missing = MAET_LETTERS.filter((letter) =>
        !table.rows.some((row) => col < row.length && isPathLetter(row[col], letter)),
      )
      return missing.length === 0
        ? { pass: true, detail: '路径类型列 M/A/E/T 四类行齐全' }
        : { pass: false, detail: `路径类型列缺少：${missing.join('/')}` }
    },
  },
  {
    id: 'path-type-column',
    label: '「路径类型」列在骨架表表头',
    check: (section) => {
      if (section === null) return { pass: false, detail: '§19 段缺席' }
      const table = skeletonTable(section)
      if (!table) return { pass: false, detail: '未找到 §19.2 用例骨架表' }
      return pathTypeColumn(table) >= 0
        ? { pass: true, detail: '骨架表表头含「路径类型」列' }
        : { pass: false, detail: '骨架表表头缺「路径类型」列' }
    },
  },
  {
    id: 'gwt-columns',
    label: 'GWT（Given/When/Then）列存在',
    check: (section) => {
      if (section === null) return { pass: false, detail: '§19 段缺席' }
      const table = skeletonTable(section)
      if (!table) return { pass: false, detail: '未找到 §19.2 用例骨架表' }
      // 契约模板列名＝给定（Given）/当（When）/则（Then）；英文关键词或纯中文列名均认。
      const byKeyword = (['Given', 'When', 'Then'] as const).filter((k) =>
        !table.header.some((c) => c.includes(k)),
      )
      const zhTokens = ['给定', '当', '则'] as const
      const byZh = zhTokens.filter((t) => !table.header.some((c) => c === t || c.startsWith(t)))
      if (byKeyword.length === 0 || byZh.length === 0) {
        return { pass: true, detail: '骨架表表头含 GWT 列' }
      }
      return { pass: false, detail: `骨架表表头缺 GWT 列：${byKeyword.join('/')}` }
    },
  },
  {
    id: 'checklist-nonempty',
    label: '§19.3 声明 checklist 非空',
    check: (section) => {
      if (section === null) return { pass: false, detail: '§19 段缺席' }
      const sub = subsection(section, '19.3')
      if (sub === null) return { pass: false, detail: '缺 §19.3 测试左移声明段' }
      const items = sub.split('\n').filter((line) => /^\s*[-*]\s*\[[ xX]\]\s*\S/.test(line))
      return items.length > 0
        ? { pass: true, detail: `§19.3 checklist 非空项 ${items.length} 条` }
        : { pass: false, detail: '§19.3 checklist 无非空项' }
    },
  },
]

/** 应用四判（gradeSpecDesign 与测试共用同一实现）。 */
export function runS0StructureChecks(section: string | null): S0CheckOutcome[] {
  return S0_STRUCTURE_CHECKS.map(({ id, label, check }) => ({ id, label, ...check(section) }))
}

// ---------- S1 语义四维 ----------

export type SkillGradeDimension = 'maet-completeness' | 'gwt-concreteness' | 'boundary-coverage' | 'verifiability'

/** 断言文本与行为锚点（锚点是判据不是答案，judge.ts AssertionAnchor 同款纪律）。 */
interface DimensionRubric {
  dimension: SkillGradeDimension
  assertion: string
  anchor: { yes: string; no: string }
  /** S0 联动检查：机械面 fail 的维度零费定 no 不发问；纯语义维无联动。 */
  s0LinkedIds: readonly S0CheckId[]
}

export const DIMENSION_RUBRICS: readonly DimensionRubric[] = [
  {
    dimension: 'maet-completeness',
    assertion: '用例骨架对主流程（M）、替代流程（A）、异常路径（E）、终止路径（T）四类路径各有至少一条用例，且终止路径用例断言了终止后的资源回收或状态终态',
    anchor: {
      yes: '四类路径各有非占位用例，Termination 含回收/终态断言',
      no: '存在整类路径无用例，或用例仅为模板占位符',
    },
    s0LinkedIds: ['maet-rows', 'path-type-column'],
  },
  {
    dimension: 'gwt-concreteness',
    assertion: '用例骨架的给定（Given）/当（When）/则（Then）内容具体可执行：给出真实输入值、操作与可观察结果，而非「系统正常」「结果正确」这类空泛表述',
    anchor: {
      yes: 'GWT 各步含可执行的具体值或操作',
      no: '存在整列空泛占位表述',
    },
    s0LinkedIds: ['gwt-columns'],
  },
  {
    dimension: 'boundary-coverage',
    assertion: '用例集显式覆盖了边界与异常场景（空输入、最大/最小/越界值、依赖失败、超时中至少两类）',
    anchor: {
      yes: '边界/异常场景有具名用例或标注',
      no: '仅理想路径，无边界与异常标注',
    },
    s0LinkedIds: [],
  },
  {
    dimension: 'verifiability',
    assertion: '则（Then）断言与 §19.3 声明可机械验证（命令退出码、覆盖率报告、可观测终态等），不存在只能主观判断的表述',
    anchor: {
      yes: '断言挂可观测判据（命令/退出码/终态）',
      no: '断言只能主观解读，无可执行验证面',
    },
    s0LinkedIds: ['checklist-nonempty'],
  },
]

export interface DimensionGrade {
  dimension: SkillGradeDimension
  value: Binary
  source: 's0' | 's1'
  /** S1 判定概率（noul P(yes)），留痕供校准分析。 */
  p?: number
  reason: string
}

export type SkillGradeVerdict = 'PASS' | 'CONDITIONAL' | 'FAIL'

export interface GradeResult {
  /** PASS=四维全 yes；FAIL=任一维 no；CONDITIONAL=无 no 但含 unknown（S0 全过+S1 全 unknown 即此态）。 */
  overall: SkillGradeVerdict
  sectionFound: boolean
  s0: S0CheckOutcome[]
  dimensions: DimensionGrade[]
  meta: { model: string; online: boolean; cached: boolean; latencyMs: number | null }
}

export interface SkillGraderDeps {
  config: EvalConfig
  ask?: AskFn
  cache?: TtlCache<EvalJudgeAnswers>
  breaker?: Breaker
  now?: () => number
  fetchDeps?: ClefJudgeDeps
}

// 模块级共享默认实例（judge.ts 同款）：不注入时跨调用复用缓存与熔断计数；测试注入自己的实例。
let sharedCache: TtlCache<EvalJudgeAnswers> | null = null
let sharedBreaker: Breaker | null = null

/** 测试隔离：清空共享缓存/熔断器（避免跨用例状态污染）。 */
export function _resetSkillGraderDefaultsForTests(): void {
  sharedCache = null
  sharedBreaker = null
}

/** S1 问句构造（反偏置：只含断言文本与行为锚点，无期望答案；格式与 judge.buildQuestions 同款）。 */
export function buildGradeQuestions(rubrics: readonly DimensionRubric[]): Record<string, { type: 'noul'; instructions: string }> {
  const questions: Record<string, { type: 'noul'; instructions }> = {}
  for (const r of rubrics) {
    questions[r.dimension] = {
      type: 'noul',
      instructions: `根据证据判断以下断言是否成立（只依据给定证据，证据不足以判断时不猜测）：${r.assertion}成立的标准：${r.anchor.yes}；不成立的标准：${r.anchor.no}。${JUDGE_BIAS_GUARD}`,
    }
  }
  return questions
}

/**
 * S0 机械判 + S1 语义四维：
 *   - S0 联动面 fail 的维度零费定 no（source=s0），不发问（成本纪律对齐 judgeAttempt）；
 *   - 其余维度经 deps.ask 发问，p 经 τ 三段映射（≥tauYes→yes，≤tauNo→no，灰区→unknown）；
 *   - ask 缺席/抛错/熔断 → 发问维度全 unknown 不抛错（fail-open）；
 *   - §19 段缺席：S0 四判全 fail、不发问、无 S0 联动的语义维按「无证据」置 unknown。
 */
export async function gradeSpecDesign(specText: string, deps: SkillGraderDeps): Promise<GradeResult> {
  const { config } = deps
  const now = deps.now ?? Date.now
  const section = extractTestDesignSection(specText)
  const s0Outcomes = runS0StructureChecks(section)
  const s0ById = new Map(s0Outcomes.map((c) => [c.id, c]))

  const grades = new Map<SkillGradeDimension, DimensionGrade>()
  const toAsk: DimensionRubric[] = []
  for (const rubric of DIMENSION_RUBRICS) {
    const failed = rubric.s0LinkedIds
      .map((id) => s0ById.get(id))
      .filter((c): c is S0CheckOutcome => c !== undefined && !c.pass)
    if (failed.length > 0) {
      grades.set(rubric.dimension, {
        dimension: rubric.dimension,
        value: 'no',
        source: 's0',
        reason: `S0 机械判 fail：${failed.map((c) => `${c.id}（${c.detail}）`).join('；')}`,
      })
      continue
    }
    if (section === null) {
      // 无联动检查但段缺席：无语义证据可判，不发问不猜数。
      grades.set(rubric.dimension, {
        dimension: rubric.dimension,
        value: 'unknown',
        source: 's1',
        reason: 'S1 §19 段缺席，无语义证据 → unknown',
      })
      continue
    }
    toAsk.push(rubric)
  }

  let online = false
  let cached = false
  let latencyMs: number | null = null
  const answers: EvalJudgeAnswers = {}
  if (toAsk.length > 0 && section !== null) {
    const breaker = deps.breaker ?? (sharedBreaker ??= new Breaker(config.breakerThreshold, config.breakerCooldownMs))
    const cache = deps.cache ?? (sharedCache ??= new TtlCache<EvalJudgeAnswers>(config.cacheTtlMs))
    const ask = deps.ask ?? ((req, cfg) => clefAsk(req, cfg, deps.fetchDeps))
    const questions = buildGradeQuestions(toAsk)
    const state = { spec_test_design: truncateForState(section, config.maxStateChars) }
    const request: EvalJudgeRequest = { model: config.judgeModel, state, questions }
    if (!breaker.isOpen(now())) {
      const cacheKey = sha1Of(JSON.stringify({ state, questions, model: config.judgeModel }))
      const hit = cache.get(cacheKey, now())
      if (hit !== undefined) {
        Object.assign(answers, hit)
        cached = true
        latencyMs = 0
      } else {
        const started = now()
        try {
          const got = await ask(request, config)
          breaker.recordSuccess()
          cache.set(cacheKey, got, now())
          Object.assign(answers, got)
        } catch {
          // fail-open：判定端不可用/超时/形状不符 → 发问维度全 unknown，不抛错（judgeOnline=false 同构）
          breaker.recordFailure(now())
        }
        latencyMs = now() - started
      }
    }
    online = toAsk.some((r) => answers[r.dimension] !== undefined)
  }

  const s1Reason = (value: 'yes' | 'no' | 'unknown', p?: number): string =>
    `S1 ${value}${p !== undefined ? ` p=${p.toFixed(2)}` : ''}（τyes=${config.tauYes}, τno=${config.tauNo}, model=${config.judgeModel}）`
  for (const rubric of toAsk) {
    const p = answers[rubric.dimension]
    if (p === undefined) {
      grades.set(rubric.dimension, {
        dimension: rubric.dimension,
        value: 'unknown',
        source: 's1',
        reason: online ? 'S1 判定端未作答（响应形状不符）→ unknown' : 'S1 判定端不可用/熔断（fail-open）→ unknown',
      })
      continue
    }
    let value: 'yes' | 'no' | 'unknown'
    if (p >= config.tauYes) value = 'yes'
    else if (p <= config.tauNo) value = 'no'
    else value = 'unknown'
    grades.set(rubric.dimension, { dimension: rubric.dimension, value, source: 's1', p, reason: s1Reason(value, p) })
  }

  const dimensions = DIMENSION_RUBRICS.map((r) => grades.get(r.dimension)!)
  const overall: SkillGradeVerdict = dimensions.some((d) => d.value === 'no')
    ? 'FAIL'
    : dimensions.every((d) => d.value === 'yes')
      ? 'PASS'
      : 'CONDITIONAL'

  return {
    overall,
    sectionFound: section !== null,
    s0: s0Outcomes,
    dimensions,
    meta: { model: config.judgeModel, online, cached, latencyMs },
  }
}

// ---------- 基线快照与对比 ----------

export interface BaselineRecord {
  ts: number
  runId: string
  grades: GradeResult
}

export interface BaselineDelta {
  runId: string
  baselineTs: number
  /** 基线四维 pass 率（yes 数/维度数）。 */
  baselinePassRate: number
  currentPassRate: number
  /** delta=current−baseline；正=较基线上升。 */
  delta: number
}

/** 基线 jsonl 缺省落治理台账区（gitignore 态，spec 决策 4）；env 可配绝对/相对路径。 */
const DEFAULT_BASELINE_FILE = '.swarm-yuan/skill-grade-baselines.jsonl'

function baselineFilePath(): string {
  return process.env.EVAL_SKILL_GRADE_BASELINE_FILE?.trim() || DEFAULT_BASELINE_FILE
}

function passRateOf(grades: GradeResult): number {
  const dims = Array.isArray(grades?.dimensions) ? grades.dimensions : []
  if (dims.length === 0) return 0
  return dims.filter((d) => d.value === 'yes').length / dims.length
}

/**
 * 追加一条基线快照（append-only，每行 {ts,runId,grades}）。
 * 基线是迭代工件非业务数据：写失败 fail-soft 返回 false，不抛错不阻断评估主流程。
 */
export function snapshotBaseline(runId: string, grades: GradeResult): boolean {
  try {
    const file = baselineFilePath()
    mkdirSync(dirname(file), { recursive: true })
    const record: BaselineRecord = { ts: Date.now(), runId, grades }
    appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * 与同 runId 末次快照比四维 pass 率 delta。
 * 文件不存在/不可读/无该 runId 快照 → null 不抛错（fail-open）。
 */
export function compareBaseline(runId: string, current: GradeResult): BaselineDelta | null {
  let text: string
  try {
    text = readFileSync(baselineFilePath(), 'utf8')
  } catch {
    return null
  }
  let last: BaselineRecord | null = null
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const rec = JSON.parse(t) as BaselineRecord
      // 单行损坏跳过（append 日志可能截断），不毙整文件。
      if (rec && typeof rec.ts === 'number' && rec.runId === runId && Array.isArray(rec.grades?.dimensions)) {
        last = rec
      }
    } catch {
      continue
    }
  }
  if (!last) return null
  const baselinePassRate = passRateOf(last.grades)
  const currentPassRate = passRateOf(current)
  const round4 = (x: number): number => Math.round(x * 10000) / 10000
  return {
    runId,
    baselineTs: last.ts,
    baselinePassRate: round4(baselinePassRate),
    currentPassRate: round4(currentPassRate),
    delta: round4(currentPassRate - baselinePassRate),
  }
}
