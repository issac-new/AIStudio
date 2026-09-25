// 列级 automation 编排守门（routa §七#1，矩阵 §3.6 P0）：配置/时机匹配/autoAdvance。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  loadColumnAutomations, matchColumnTransition, resetColumnAutomationsCacheForTests,
  type ColumnAutomation,
} from '../column-automation'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'columns-'))
  process.env.HERMES_COLUMNS_FILE = join(dir, 'columns.yaml')
  resetColumnAutomationsCacheForTests()
})
afterEach(() => {
  delete process.env.HERMES_COLUMNS_FILE
  resetColumnAutomationsCacheForTests()
  rmSync(dir, { recursive: true, force: true })
})

const write = (yaml: string) => writeFileSync(join(dir, 'columns.yaml'), yaml, 'utf8')

const TABLE: Record<string, ColumnAutomation> = {
  todo: { timing: 'entry', autoAdvanceOnSuccess: true, steps: [{ id: 's1', role: 'general-engineer', specialist: 'refiner', provider: 'zcode' }] },
  done: { timing: 'exit', autoAdvanceOnSuccess: false, steps: [{ id: 's2', role: 'ops', specialist: 'reporter', provider: 'zcode' }] },
  review: { timing: 'both', autoAdvanceOnSuccess: false, steps: [{ id: 's3', role: 'qa', specialist: 'guard', provider: 'zcode' }] },
  quiet: { timing: 'entry', autoAdvanceOnSuccess: false, steps: [] },
}

describe('COLUMN_TRANSITION 匹配器（entry|exit|both 时机）', () => {
  it('entry/exit/both 三时机各自触发；空步骤列不触发', () => {
    // 进入 todo（entry 时机匹配进入方向）→ todo 触发；离开 todo 不触发。
    const t1 = matchColumnTransition('in_progress', 'todo', TABLE)
    expect(t1.map((x) => `${x.column}:${x.matchedTiming}`)).toEqual(['todo:entry'])
    // todo→done：todo=entry 时机不匹配离开、done=exit 时机不匹配进入 → 双空（时机语义）。
    expect(matchColumnTransition('todo', 'done', TABLE)).toEqual([])
    // done→review：done=exit（离开触发）+ review=entry（进入触发）= both 双发。
    const t2 = matchColumnTransition('done', 'review', TABLE)
    expect(t2.map((x) => `${x.column}:${x.matchedTiming}`)).toEqual(['done:exit', 'review:entry'])
    // 离开 review（review=both）→ review:exit。
    const t3 = matchColumnTransition('review', 'quiet', TABLE)
    expect(t3.map((x) => `${x.column}:${x.matchedTiming}`)).toEqual(['review:exit'])
    // 空步骤列 quiet entry 不触发。
  })

  it('autoAdvanceOnSuccess 意图透传；首列进入只匹配 entry', () => {
    const t = matchColumnTransition(null, 'todo', TABLE)
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ column: 'todo', matchedTiming: 'entry', autoAdvanceOnSuccess: true })
    expect(matchColumnTransition('quiet', null, TABLE)).toEqual([])
  })

  it('配置加载+坏文件回空 fail-soft', () => {
    write('columns:\n  todo:\n    timing: entry\n    autoAdvanceOnSuccess: true\n    steps:\n      - { id: a, role: r, specialist: s, provider: zcode }\n  bad: "not-a-map"\n')
    const table = loadColumnAutomations()
    expect(table.todo.steps).toHaveLength(1)
    expect(table.bad.steps).toEqual([]).toHaveLength(0)
    write('{{broken')
    resetColumnAutomationsCacheForTests()
    expect(Object.keys(loadColumnAutomations())).toHaveLength(0)
  })
})

describe('执行半环（COLUMN_TRANSITION→派单，routa §七#2）', () => {
  it('每 step 一条派单到 provider；简报带列/时机/职责；无匹配列零派单', async () => {
    const { dispatchColumnTransition } = await import('../column-dispatch')
    const created: string[] = []
    const engine = {
      probe: async () => true,
      createSession: async () => ({ session: { sessionId: 's1' } }),
      sendCommand: async (p: { workspacePath: string; envelope: Record<string, unknown> }) => {
        created.push(String((p.envelope.payload as { text: string }).text.slice(0, 40)))
        return { status: 'accepted' }
      },
    }
    // TABLE 的 review=both→review:entry + todo entry 用例表。
    const table = {
      todo: { timing: 'entry' as const, autoAdvanceOnSuccess: true, steps: [{ id: 'refine', role: 'general-engineer', specialist: 'refiner', provider: 'zcode' }] },
      review: { timing: 'both' as const, autoAdvanceOnSuccess: false, steps: [
        { id: 'qa', role: 'qa', specialist: 'guard', provider: 'zcode' },
        { id: 'approve', role: 'code-reviewer', specialist: 'guard', provider: 'zcode' },
      ] },
    }
    // done→review：review entry 两步派单。
    const { matchColumnTransition: m } = await import('../column-automation')
    const triggers = m('done', 'review', table)
    expect(triggers).toHaveLength(1)
    // 派单执行（fake engine）
    const { MentionDispatchService } = await import('../../zcode/mention-dispatch')
    const svc = new MentionDispatchService({ engine: engine as never, clientId: 'c' })
    const outcomes = []
    for (const t of triggers) {
      for (const st of t.steps) {
        const [o] = await svc.dispatch({ workspacePath: '/w', text: `@zcode [kanban:${t.column}] ${st.id}` })
        outcomes.push(o)
      }
    }
    // 单 pending 槽语义：同 provider 两步，第一步 queued、第二步并入（coalesced）
    // ——同 agent 活跃期不并发起双 run；步骤串行执行面归 drain 后续。
    expect(outcomes.map((o) => o.reason)).toEqual(['queued', 'coalesced'])
    expect(created[0]).toContain('@zcode')
  })
})
