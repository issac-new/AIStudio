// overlay[eval] 技能产出 Grader 环单测（spec: 2026-11-02-skill-grader.md）。
// 判定端全部 stub 注入（eval.test.ts 同款纪律：公共面测试零模型调用、零网络）；
// 好/坏 spec 对照样本锁定 S0 方向、S1 判分方向、fail-open 降级与基线 delta 符号。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  S0_STRUCTURE_CHECKS,
  _resetSkillGraderDefaultsForTests,
  compareBaseline,
  extractTestDesignSection,
  gradeSpecDesign,
  runS0StructureChecks,
  snapshotBaseline,
  type DimensionGrade,
  type GradeResult,
  type SkillGradeDimension,
} from '../skill-grader'
import type { AskFn } from '../judge'
import type { EvalJudgeRequest } from '../clef'
import { loadEvalConfig } from '../types'

const CONFIG = { ...loadEvalConfig(), judgeModel: 'stub-model' }

const DIMS: SkillGradeDimension[] = ['maet-completeness', 'gwt-concreteness', 'boundary-coverage', 'verifiability']

// ---------- 好/坏 spec 对照样本 ----------

/** 好样本：MAET 四路径齐（T 含回收/终态断言）+ GWT 具体 + §19.3 checklist 非空。 */
const GOOD_SPEC = `# 某特性 spec

## 18. 认知段
前置章节，不应进入 §19 提取结果。

## 19. ★测试左移（Shift-Left Testing）

### 19.1 测试策略
| 测试类型 | 范围 | 框架/工具 | 命令 | 覆盖率目标 |
|---------|------|----------|------|-----------|
| 单元测试 | gradeSpecDesign 四维映射 | vitest | npx vitest run custom/server/eval/__tests__/skill-grader.test.ts | 行 ≥ 80% |
| 接口测试 | POST /skill-grade 正常与 400 | supertest | npm run test:api | 端点 ≥ 90% |

### 19.2 用例骨架（编码前先写，TDD/BDD；MAET 四路径完备）
每特性至少遍历四条路径：M 主流程 / A 替代流程 / E 异常路径 / T 终止路径。
| 用例名 | 路径类型 | 给定（Given） | 当（When） | 则（Then） | 边界/异常 |
|--------|---------|-------------|-----------|-----------|---------|
| 正常打分返回四维判定 | M | spec 含 §19.1-19.3 且 ask stub 返回 p=0.9 | 调 gradeSpecDesign | 四维 value=yes 且 overall=PASS | 无 |
| ask 缺席走 fail-open | A | deps 无 ask 且 fetchImpl 抛错 | 调 gradeSpecDesign | S1 四维 unknown 不抛错 | judgeOnline=false 同构 |
| 基线文件含损坏行 | E | jsonl 存在但有 1 行非 JSON | 调 compareBaseline | 跳过坏行取末次有效快照 | 单行损坏不毙整文件 |
| 判定端熔断期调用 | T | Breaker 连续失败达阈值=5 后冷却 | 调 gradeSpecDesign | 冷却期不发请求、全维 unknown | 熔断计数复位 |

### 19.3 测试左移声明
- [x] 测试设计在 spec 阶段已写（非编码后才补）
- [x] MAET 四路径标注完备（每特性至少 M/A/E/T 各 1 条）
- [ ] 边界值用例覆盖（空/最大/最小/越界）

## 20. 变更左移
SENTINEL_AFTER_19
`

/** 坏样本：缺 Termination 路径行 + Given/Then 空泛（S0 抓缺 T，S1 抓空泛）。 */
const BAD_SPEC = `# 某特性 spec

## 19、测试左移

### 19.1 测试策略
| 测试类型 | 范围 |
|---------|------|
| 单元测试 | 部分 |

### 19.2 用例骨架
| 用例名 | 路径类型 | 给定（Given） | 当（When） | 则（Then） | 边界/异常 |
|--------|---------|-------------|-----------|-----------|---------|
| 主流程 | M | 系统正常 | 执行操作 | 结果正确 | 无 |
| 换序调用 | A | 参数顺序不同 | 执行操作 | 结果一致 | 无 |
| 环境异常 | E | 环境异常 | 执行操作 | 报错 | 有 |

### 19.3 测试左移声明
- [ ] 测试设计在 spec 阶段已写
`

// ---------- 夹具 ----------

beforeEach(() => {
  // 共享缓存/熔断器按用例隔离：避免跨用例缓存命中与熔断计数污染断言
  _resetSkillGraderDefaultsForTests()
})

const HIGH_ASK: AskFn = async () => ({
  'maet-completeness': 0.9, 'gwt-concreteness': 0.9, 'boundary-coverage': 0.9, verifiability: 0.9,
})
const MID_ASK: AskFn = async () => ({
  'maet-completeness': 0.5, 'gwt-concreteness': 0.5, 'boundary-coverage': 0.5, verifiability: 0.5,
})
const THROWING_ASK: AskFn = async () => {
  throw new Error('judge endpoint down')
}

function dimsOf(grade: GradeResult): Map<SkillGradeDimension, DimensionGrade> {
  return new Map(grade.dimensions.map((d) => [d.dimension, d]))
}

/** 构造基线/当前用的 GradeResult（pass 率按 values 内 yes 数计）。 */
function makeGrade(values: Array<'yes' | 'no' | 'unknown'>): GradeResult {
  return {
    overall: 'CONDITIONAL',
    sectionFound: true,
    s0: [],
    dimensions: values.map((v, i) => ({ dimension: DIMS[i], value: v, source: 's1', reason: 'stub' })),
    meta: { model: 'stub-model', online: true, cached: false, latencyMs: 0 },
  }
}

// ---------- §19 段提取 ----------

describe('§19 测试设计段提取', () => {
  it('好样本：含 19.1/19.2/19.3，且在 §20 前截断', () => {
    const section = extractTestDesignSection(GOOD_SPEC)
    expect(section).toBeTruthy()
    expect(section).toContain('### 19.1')
    expect(section).toContain('### 19.2')
    expect(section).toContain('### 19.3')
    expect(section).not.toContain('SENTINEL_AFTER_19')
  })

  it('无 §19 段返回 null', () => {
    expect(extractTestDesignSection('# 文档\n\n## 20. 变更左移\n内容')).toBeNull()
    expect(extractTestDesignSection('没有标题的纯文本')).toBeNull()
  })
})

// ---------- S0 机械结构四判 ----------

describe('S0 机械结构四判（纯函数，零判定费）', () => {
  it('好样本四项全过', () => {
    const outcomes = runS0StructureChecks(extractTestDesignSection(GOOD_SPEC))
    expect(outcomes).toHaveLength(S0_STRUCTURE_CHECKS.length)
    for (const o of outcomes) expect(o.pass).toBe(true)
  })

  it('坏样本：缺 T 行 → maet-rows fail 且 detail 点名 T；其余三项过', () => {
    const outcomes = runS0StructureChecks(extractTestDesignSection(BAD_SPEC))
    const byId = new Map(outcomes.map((o) => [o.id, o]))
    expect(byId.get('maet-rows')?.pass).toBe(false)
    expect(byId.get('maet-rows')?.detail).toContain('T')
    expect(byId.get('path-type-column')?.pass).toBe(true)
    expect(byId.get('gwt-columns')?.pass).toBe(true)
    expect(byId.get('checklist-nonempty')?.pass).toBe(true)
  })

  it('段缺席：四项全 fail', () => {
    for (const o of runS0StructureChecks(null)) expect(o.pass).toBe(false)
  })
})

// ---------- gradeSpecDesign：S1 语义四维 ----------

describe('gradeSpecDesign（S0+S1 分层）', () => {
  it('好样本 + 高分回答：四维 yes、整体 PASS', async () => {
    const grade = await gradeSpecDesign(GOOD_SPEC, { config: CONFIG, ask: HIGH_ASK })
    expect(grade.sectionFound).toBe(true)
    expect(grade.overall).toBe('PASS')
    for (const d of grade.dimensions) {
      expect(d.value).toBe('yes')
      expect(d.source).toBe('s1')
    }
    expect(grade.meta.online).toBe(true)
  })

  it('反偏置：问句只含断言与锚点，不携带期望答案；state 携带 §19 段', async () => {
    const requests: EvalJudgeRequest[] = []
    const ask: AskFn = async (req) => {
      requests.push(req)
      return { 'maet-completeness': 0.9, 'gwt-concreteness': 0.9, 'boundary-coverage': 0.9, verifiability: 0.9 }
    }
    await gradeSpecDesign(GOOD_SPEC, { config: CONFIG, ask })
    expect(requests).toHaveLength(1)
    const serialized = JSON.stringify(requests[0].questions)
    expect(serialized).not.toContain('期望')
    expect(Object.keys(requests[0].questions).sort()).toEqual([...DIMS].sort())
    const state = requests[0].state as { spec_test_design?: string }
    expect(state.spec_test_design).toContain('用例骨架')
  })

  it('灰区回答：四维 unknown、整体 CONDITIONAL（非 PASS，防假绿）', async () => {
    const grade = await gradeSpecDesign(GOOD_SPEC, { config: CONFIG, ask: MID_ASK })
    for (const d of grade.dimensions) expect(d.value).toBe('unknown')
    expect(grade.overall).toBe('CONDITIONAL')
  })

  it('坏样本：maet-completeness 由 S0 零费定 no 不发问，整体 FAIL', async () => {
    const requests: EvalJudgeRequest[] = []
    const ask: AskFn = async (req) => {
      requests.push(req)
      return { 'maet-completeness': 0.9, 'gwt-concreteness': 0.9, 'boundary-coverage': 0.9, verifiability: 0.9 }
    }
    const grade = await gradeSpecDesign(BAD_SPEC, { config: CONFIG, ask })
    const byDim = dimsOf(grade)
    expect(byDim.get('maet-completeness')?.value).toBe('no')
    expect(byDim.get('maet-completeness')?.source).toBe('s0')
    // S0 已判的维度不进问句集（成本纪律对齐 judgeAttempt）
    expect(Object.keys(requests[0].questions)).not.toContain('maet-completeness')
    expect(byDim.get('gwt-concreteness')?.value).toBe('yes')
    expect(grade.overall).toBe('FAIL')
  })

  it('ask 抛错：fail-open 四维全 unknown 不抛错；S0 全过 → 整体 CONDITIONAL', async () => {
    const grade = await gradeSpecDesign(GOOD_SPEC, { config: CONFIG, ask: THROWING_ASK })
    expect(grade.meta.online).toBe(false)
    for (const d of grade.dimensions) {
      expect(d.value).toBe('unknown')
      expect(d.reason).toContain('fail-open')
    }
    expect(grade.overall).toBe('CONDITIONAL')
  })

  it('ask 缺席（默认走 clefAsk，fetch 抛错）同 fail-open', async () => {
    const grade = await gradeSpecDesign(GOOD_SPEC, {
      config: CONFIG,
      fetchDeps: { fetchImpl: () => Promise.reject(new Error('offline')) },
    })
    expect(grade.meta.online).toBe(false)
    for (const d of grade.dimensions) expect(d.value).toBe('unknown')
    expect(grade.overall).toBe('CONDITIONAL')
  })

  it('§19 段缺席：不发问、联动维经 S0 定 no、纯语义维无证据 unknown、整体 FAIL', async () => {
    let called = 0
    const ask: AskFn = async () => {
      called += 1
      return {}
    }
    const grade = await gradeSpecDesign('没有测试设计段的 spec', { config: CONFIG, ask })
    expect(called).toBe(0)
    expect(grade.sectionFound).toBe(false)
    const byDim = dimsOf(grade)
    expect(byDim.get('maet-completeness')?.value).toBe('no')
    expect(byDim.get('gwt-concreteness')?.value).toBe('no')
    expect(byDim.get('verifiability')?.value).toBe('no')
    expect(byDim.get('boundary-coverage')?.value).toBe('unknown')
    expect(grade.overall).toBe('FAIL')
  })
})

// ---------- 基线快照与对比 ----------

describe('基线快照与对比（append-only jsonl）', () => {
  let baselineDir: string
  let seq = 0

  /** 每用例独立基线文件（env 缺省路径指向仓内台账区，测试不得写真实仓文件）。 */
  function useBaselineFile(): string {
    seq += 1
    const file = join(baselineDir, `baselines-${seq}.jsonl`)
    process.env.EVAL_SKILL_GRADE_BASELINE_FILE = file
    return file
  }

  beforeAll(() => {
    baselineDir = mkdtempSync(join(tmpdir(), 'skill-grade-baseline-'))
  })

  afterAll(() => {
    delete process.env.EVAL_SKILL_GRADE_BASELINE_FILE
    rmSync(baselineDir, { recursive: true, force: true })
  })

  it('当前优于基线：delta 为正', () => {
    useBaselineFile()
    expect(snapshotBaseline('run-1', makeGrade(['yes', 'yes', 'unknown', 'unknown']))).toBe(true)
    const delta = compareBaseline('run-1', makeGrade(['yes', 'yes', 'yes', 'yes']))
    expect(delta).not.toBeNull()
    expect(delta!.baselinePassRate).toBeCloseTo(0.5, 5)
    expect(delta!.currentPassRate).toBeCloseTo(1, 5)
    expect(delta!.delta).toBeGreaterThan(0)
  })

  it('当前劣于基线：delta 为负', () => {
    useBaselineFile()
    snapshotBaseline('run-1', makeGrade(['yes', 'yes', 'yes', 'yes']))
    const delta = compareBaseline('run-1', makeGrade(['yes', 'yes', 'no', 'unknown']))
    expect(delta).not.toBeNull()
    expect(delta!.delta).toBeLessThan(0)
    expect(delta!.baselinePassRate).toBeCloseTo(1, 5)
    expect(delta!.currentPassRate).toBeCloseTo(0.5, 5)
  })

  it('空态：无快照/文件不存在 → null 不抛错', () => {
    useBaselineFile()
    expect(compareBaseline('never-snapshotted', makeGrade(['yes', 'yes', 'yes', 'yes']))).toBeNull()
    const file = useBaselineFile()
    expect(existsSync(file)).toBe(false)
    expect(compareBaseline('run-x', makeGrade(['yes', 'yes', 'yes', 'yes']))).toBeNull()
  })

  it('同 runId 多次快照取末次（append-only，last-wins）', () => {
    useBaselineFile()
    snapshotBaseline('run-2', makeGrade(['yes', 'yes', 'yes', 'yes']))
    snapshotBaseline('run-2', makeGrade(['yes', 'yes', 'unknown', 'unknown']))
    const delta = compareBaseline('run-2', makeGrade(['yes', 'yes', 'yes', 'yes']))
    expect(delta).not.toBeNull()
    expect(delta!.baselinePassRate).toBeCloseTo(0.5, 5)
    expect(delta!.delta).toBeCloseTo(0.5, 5)
  })

  it('单行损坏跳过，不毙整文件；基线路径不可写时 snapshot fail-soft', () => {
    const file = useBaselineFile()
    writeFileSync(file, 'not-json-line\n', 'utf8')
    snapshotBaseline('run-3', makeGrade(['yes', 'yes', 'yes', 'yes']))
    writeFileSync(file, 'another-garbage\n', { encoding: 'utf8', flag: 'a' })
    const delta = compareBaseline('run-3', makeGrade(['yes', 'yes', 'yes', 'yes']))
    expect(delta).not.toBeNull()
    expect(delta!.baselinePassRate).toBeCloseTo(1, 5)
    // 目录位置被普通文件占据 → mkdir ENOTDIR → snapshot 返回 false 不抛错
    const blocker = join(baselineDir, 'blocker')
    writeFileSync(blocker, '', 'utf8')
    process.env.EVAL_SKILL_GRADE_BASELINE_FILE = join(blocker, 'child', 'baselines.jsonl')
    expect(snapshotBaseline('run-4', makeGrade(['yes', 'yes', 'yes', 'yes']))).toBe(false)
    expect(compareBaseline('run-4', makeGrade(['yes', 'yes', 'yes', 'yes']))).toBeNull()
  })
})
