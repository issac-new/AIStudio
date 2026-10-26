// P1（JoyAI 闭环吸收轮）守门：派发层任务语境接线——
//   ① fetchTaskTitleByTaskId 跨板取标题（主库/板库命中、缺席 null 不造语境）；
//   ② stepBrief 带任务标题时 fewshot 召回按语境注入「历史教训」行（开关选通+台账命中），
//     无标题回落现状（不召回，Prompt 保持干净）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetchTaskTitleByTaskId, stepBrief } from '../column-dispatch'
import type { ColumnTransitionTrigger, AutomationStep } from '../column-automation'

let home: string
let evalDir: string

function makeDb(dir: string, rows: Array<[string, string]>) {
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT)')
  for (const [id, title] of rows) db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?)').run(id, title, 'orchestrator', 'doing')
  db.close()
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dispatch-ctx-home-'))
  evalDir = mkdtempSync(join(tmpdir(), 'dispatch-ctx-eval-'))
  process.env.HERMES_HOME = join(home, '.hermes')
  process.env.EVAL_STORE = evalDir
  // 主库 + 板库各一任务（跨板扫描路径）
  makeDb(join(home, '.hermes'), [['root-1', '主库任务支付收银台']])
  makeDb(join(home, '.hermes', 'kanban', 'boards', 'b1'), [['board-1', '板库任务退款逆向流']])
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.EVAL_STORE
  delete process.env.FLYWHEEL_FEWSHOT_INJECT
  rmSync(home, { recursive: true, force: true })
  rmSync(evalDir, { recursive: true, force: true })
})

describe('fetchTaskTitleByTaskId（跨板取标题）', () => {
  it('主库与板库任务均可命中；缺席返回 null 不造语境', async () => {
    expect(await fetchTaskTitleByTaskId('root-1')).toBe('主库任务支付收银台')
    expect(await fetchTaskTitleByTaskId('board-1')).toBe('板库任务退款逆向流')
    expect(await fetchTaskTitleByTaskId('ghost')).toBeNull()
  })
})

describe('stepBrief 任务语境 → fewshot 注入', () => {
  const trigger: ColumnTransitionTrigger = {
    column: 'doing',
    matchedTiming: 'enter',
    autoAdvanceOnSuccess: false,
    steps: [],
  } as unknown as ColumnTransitionTrigger
  const steps: AutomationStep[] = [
    { id: 's1', provider: 'zcode', role: '实现' } as unknown as AutomationStep,
  ]

  function seedLedger(problem: string) {
    writeFileSync(join(evalDir, 'flywheel-ledger.json'), JSON.stringify({
      distills: [{
        id: 'd1', taskId: 'bd-1', sourceRunId: 'run-1', sourceTaskId: 'q1', sampleIdx: 0,
        rootCause: 'action_loop', tabooActions: ['反复读同一文件'], failedSteps: 3, stepRedline: null,
        targetSetId: '回归样本库', at: 1,
        problem, expectedBehavior: '先列计划再动手',
      }],
      variantBatches: [], nextSeq: 2,
    }), 'utf8')
  }

  it('带任务标题且台账命中 → 简报含「历史教训」行（语境=列+标题）', () => {
    process.env.FLYWHEEL_FEWSHOT_INJECT = '1'
    seedLedger('主库任务支付收银台改造，注意兼容旧渠道')
    const brief = stepBrief(trigger, steps, 0, null, '主库任务支付收银台')
    expect(brief).toContain('历史教训')
  })

  it('无任务标题 → 不召回（回落现状，Prompt 干净）', () => {
    process.env.FLYWHEEL_FEWSHOT_INJECT = '1'
    seedLedger('主库任务支付收银台改造，注意兼容旧渠道')
    const brief = stepBrief(trigger, steps, 0, null, null)
    expect(brief).not.toContain('历史教训')
  })

  it('语境与台账不相似 → 阈值不命中不召回（不造无效召回）', () => {
    process.env.FLYWHEEL_FEWSHOT_INJECT = '1'
    seedLedger('完全无关的另一个题目关于图片压缩算法')
    const brief = stepBrief(trigger, steps, 0, null, '主库任务支付收银台')
    expect(brief).not.toContain('历史教训')
  })
})
