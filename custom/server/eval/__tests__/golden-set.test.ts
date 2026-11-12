/**
 * 黄金集·30 例守门（2026-11-06 C 批，spec 2026-11-06-eval-golden-set.md）。
 * 配比是机制不是口头约定：资产自洽、建集口强制校验、错配比拒建、规模披露接线。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GOLDEN_MATERIALS,
  GOLDEN_NEGATIVE_MATERIALS,
  GOLDEN_RATIO,
  GOLDEN_SOURCES,
  GOLDEN_SET_NAME,
  assertGoldenNegatives,
  assertGoldenRatio,
  buildGoldenSetInput,
  buildGoldenTasks,
} from '../golden-set'
import { createSet } from '../store'
import type { EvalTask } from '../types'

let temp = ''

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), 'golden-set-'))
  process.env.EVAL_STORE = join(temp, 'eval-store.json')
})

afterEach(() => {
  delete process.env.EVAL_STORE
  rmSync(temp, { recursive: true, force: true })
})

describe('黄金集资产自洽', () => {
  it('恰 30 例且 10/10/10（校验器同源口径零 problems）', () => {
    const tasks = buildGoldenTasks()
    expect(tasks.length).toBe(30)
    expect(assertGoldenRatio(tasks)).toEqual([])
    const positive = tasks.filter(t => (t.exceptionType ?? 'none') === 'none' && t.dimension !== 'privilege_injection' && t.dimension !== 'unclassified')
    const ambiguous = tasks.filter(t => (t.exceptionType ?? 'none') !== 'none')
    const adversarial = tasks.filter(t => t.dimension === 'privilege_injection' || t.dimension === 'unclassified')
    expect(positive.length).toBe(GOLDEN_RATIO.positive)
    expect(ambiguous.length).toBe(GOLDEN_RATIO.ambiguous)
    expect(adversarial.length).toBe(GOLDEN_RATIO.adversarial)
  })

  it('模糊桶覆盖五类异常类目（六类中除 none）；越权桶全部带 risk 断言', () => {
    const tasks = buildGoldenTasks()
    const cats = new Set(tasks.filter(t => (t.exceptionType ?? 'none') !== 'none').map(t => t.exceptionType))
    expect([...cats].sort()).toEqual(['ambiguous_intent', 'knowledge_conflict', 'missing_param', 'tool_timeout', 'user_rephrase'])
    const adversarial = tasks.filter(t => t.dimension === 'privilege_injection' || t.dimension === 'unclassified')
    for (const t of adversarial) {
      expect(t.rubric.some(a => a.kind === 'risk'), `${t.id} 缺 risk 断言`).toBe(true)
    }
  })

  it('出处表覆盖全部 30 条 id（不虚构生产回流：origin 字段一律缺席）', () => {
    const tasks = buildGoldenTasks()
    expect(Object.keys(GOLDEN_SOURCES).sort()).toEqual(tasks.map(t => t.id).sort())
    for (const t of tasks) {
      expect(t.origin, `${t.id} 手工黄金集不得填回流 origin`).toBeUndefined()
    }
  })
})

describe('建集口强制配比（golden=true）', () => {
  it('黄金集输入真跑 createSet 成功落库（contentHash/revision/golden 标志）', () => {
    const r = createSet(buildGoldenSetInput() as never, 'golden-test')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.set.name).toBe(GOLDEN_SET_NAME)
    expect(r.set.golden).toBe(true)
    expect(r.set.tasks.length).toBe(30)
    expect(r.set.revision).toBe(1)
    expect(r.set.contentHash).toMatch(/^[0-9a-f]{40,}$/)
  })

  it('golden=true 但抽掉一条越权例 → 拒建且 problems 点名配比', () => {
    const input = buildGoldenSetInput()
    input.tasks = (input.tasks as EvalTask[]).filter(t => t.id !== 'ga-adv-di-01')
    const r = createSet(input as never)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.join('\n')).toMatch(/越权异常例须 10 条，实际 9/)
  })

  it('golden 缺省 false：普通小集不受配比约束（存量行为零变化）', () => {
    const one: unknown = {
      id: 'plain-1', problem: 'p', expectedBehavior: 'e',
      rubric: [{ id: 'a1', text: '回复包含 p', expect: 'yes', kind: 'result' }],
    }
    const r = createSet({ name: '普通小集', track: 'e2e', tasks: [one] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.set.golden).toBeUndefined()
  })
})

describe('规模与裁判披露接线（源码级）', () => {
  it('mx-eval-summary payload 携带 taskCount/k/attempts/judgeFingerprint', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const src = fs.readFileSync(join(__dirname, '../../../../simharness/mux/mx-eval-summary.py'), 'utf8')
    expect(src).toContain('"taskCount"')
    expect(src).toContain('"attemptsWithEfficiency"')
    expect(src).toContain('"judgeFingerprint"')
  })

  it('报告评测节渲染规模与裁判行', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const src = fs.readFileSync(join(__dirname, '../../../../simharness/mux/mx-report-gen.py'), 'utf8')
    expect(src).toContain('评测规模与裁判')
    expect(src).toContain('裁判变更后跨轮读数不可比')
  })

  it('runner 落 judgeFingerprint / judgeMeta 始终记 models（换裁判可追溯）', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const runner = fs.readFileSync(join(__dirname, '../runner.ts'), 'utf8')
    expect(runner).toContain('judgeFingerprint: {')
    const judge = fs.readFileSync(join(__dirname, '../judge.ts'), 'utf8')
    expect(judge).toContain('models: config.judgeModels,')
    // 旧条件形态（多模型才写）必须退役
    expect(judge).not.toContain('judgeModels.length > 1 ? { models')
  })
})

describe('黄金集合成负例（F2P 校准资产）', () => {
  it('30 例负例全覆盖且与正例不同、self-check 零 problems', () => {
    const tasks = buildGoldenTasks()
    expect(Object.keys(GOLDEN_NEGATIVE_MATERIALS)).toHaveLength(30)
    expect(assertGoldenNegatives(tasks)).toEqual([])
    for (const t of tasks) {
      expect(GOLDEN_NEGATIVE_MATERIALS[t.id]).not.toBe(GOLDEN_MATERIALS[t.id])
    }
  })
})
