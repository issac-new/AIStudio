// 结构化问卷契约守门（minimax ask_user：1-4 步×2-4 选项×recommended≤1×带图；一次定音）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  MAX_STEPS, answerQuestionnaire, createQuestionnaire, loadQuestionnaire,
  validateQuestionnaire, type AskStep,
} from '../ask-contract'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ask-'))
  process.env.HERMES_ASK_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_ASK_DIR
  rmSync(dir, { recursive: true, force: true })
})

const step = (id: string, n = 2): AskStep => ({
  stepId: id, question: `问题 ${id}`,
  options: Array.from({ length: n }, (_, i) => ({ id: `${id}-o${i}`, label: `选项${i}`, recommended: i === 0 })),
})

describe('契约校验（minimax 边界）', () => {
  it('1-4 步/2-4 选项/recommended≤1/带图为字符串引用', () => {
    expect(validateQuestionnaire([step('a')])).toEqual([])
    expect(validateQuestionnaire([])[0].issue).toContain('至少 1 步')
    expect(validateQuestionnaire([step('a'), step('b'), step('c'), step('d'), step('e')])[0].issue).toContain('上限 4')
    expect(validateQuestionnaire([{ ...step('a', 5) }])[0].issue).toContain('2-4 个')
    const dupRec = { ...step('a'), options: [{ id: 'x', label: 'X', recommended: true }, { id: 'y', label: 'Y', recommended: true }] }
    expect(validateQuestionnaire([dupRec])[0].issue).toContain('至多一个')
    const dupStep = [step('a'), step('a')]
    expect(validateQuestionnaire(dupStep)[0].issue).toContain('stepId 重复')
  })
})

describe('状态机（一次定音）', () => {
  it('创建→校验失败不落盘→答卷必答且合法→重答被拒', () => {
    const bad = createQuestionnaire({ askId: 'q1', steps: [{ stepId: 's', question: '', options: [] }] })
    expect('issues' in bad).toBe(true)
    expect(loadQuestionnaire('q1')).toBeNull()  // 校验失败不落盘

    const q = createQuestionnaire({ askId: 'q2', steps: [step('s1', 3), step('s2')] })
    expect('status' in q && q.status).toBe('pending')
    const miss = answerQuestionnaire('q2', { s1: 's1-o0' })
    expect('error' in miss && miss.error).toContain('缺答：s2')
    const illegal = answerQuestionnaire('q2', { s1: 'nope', s2: 's2-o0' })
    expect('error' in illegal && illegal.error).toContain('选项非法')
    const extra = answerQuestionnaire('q2', { s1: 's1-o0', s2: 's2-o0', s3: 'x' })
    expect('error' in extra && extra.error).toContain('多余步')

    const ok = answerQuestionnaire('q2', { s1: 's1-o0', s2: 's2-o0' })
    expect('status' in ok && ok.status).toBe('answered')
    const again = answerQuestionnaire('q2', { s1: 's1-o1', s2: 's2-o0' })
    expect('error' in again && again.error).toContain('一次定音')
  })

  it('askId 幂等', () => {
    const a = createQuestionnaire({ askId: 'q3', steps: [step('s')] })
    const b = createQuestionnaire({ askId: 'q3', steps: [step('other')] })
    expect('steps' in a && 'steps' in b && a.steps[0].stepId === b.steps[0].stepId).toBe(true)
  })
})
