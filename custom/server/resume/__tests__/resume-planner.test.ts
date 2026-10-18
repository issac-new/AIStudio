// 恢复判定（残余项②）守门：三档决策、检查点采集、损坏/过期降级。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetResumePlannerForTests,
  collectResumeFacts,
  decideResume,
  planResume,
  type ResumeFacts,
} from '../resume-planner'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'resume-plan-'))
  process.env.HERMES_SESSION_CHECKPOINTS_DIR = join(dir, 'handoff')
  process.env.HERMES_PROGRESS_CHECKPOINTS_DIR = join(dir, 'progress')
  process.env.HERMES_LOOP_DIR = join(dir, 'loop')
  mkdirSync(join(dir, 'handoff'), { recursive: true })
  mkdirSync(join(dir, 'progress'), { recursive: true })
  _resetResumePlannerForTests()
})

afterEach(() => {
  delete process.env.HERMES_SESSION_CHECKPOINTS_DIR
  delete process.env.HERMES_PROGRESS_CHECKPOINTS_DIR
  delete process.env.HERMES_LOOP_DIR
  delete process.env.HERMES_RESUME_MAX_AGE_MS
  _resetResumePlannerForTests()
  rmSync(dir, { recursive: true, force: true })
})

const emptyFacts = (): ResumeFacts => ({
  runId: 'r1',
  sessionId: 's1',
  graph: { found: false },
  handoff: { found: false },
  progress: { found: false },
})

describe('decideResume 三档', () => {
  it('无任何检查点 → 新会话', () => {
    const plan = decideResume(emptyFacts())
    expect(plan.decision).toBe('new_session')
    expect(plan.reasons.join(' ')).toContain('未找到')
  })

  it('新鲜图检查点且无 interrupt → 可续跑', () => {
    const facts = emptyFacts()
    facts.graph = { found: true, superStep: 8, pendingInterrupts: 0, ageMs: 60_000, next: 'next: step9' }
    const plan = decideResume(facts)
    expect(plan.decision).toBe('auto_resume')
    expect(plan.next).toBe('next: step9')
  })

  it('有 pending interrupt → 人工闸', () => {
    const facts = emptyFacts()
    facts.graph = { found: true, superStep: 3, pendingInterrupts: 2, ageMs: 10_000 }
    expect(decideResume(facts).decision).toBe('manual_gate')
  })

  it('图检查点过旧 → 人工闸', () => {
    delete process.env.HERMES_RESUME_MAX_AGE_MS
    const facts = emptyFacts()
    facts.graph = { found: true, superStep: 3, pendingInterrupts: 0, ageMs: 3 * 3_600_000 }
    expect(decideResume(facts).decision).toBe('manual_gate')
  })

  it('新鲜交接检查点（无图）→ 可续跑；损坏 → 新会话', () => {
    const facts = emptyFacts()
    facts.handoff = { found: true, ageMs: 1_000, next: 'do next' }
    expect(decideResume(facts).decision).toBe('auto_resume')
    const corrupt = emptyFacts()
    corrupt.handoff = { found: true, corrupt: true }
    expect(decideResume(corrupt).decision).toBe('new_session')
  })

  it('新鲜进展检查点 → 可续跑', () => {
    const facts = emptyFacts()
    facts.progress = { found: true, ageMs: 1_000, next: 'next step' }
    expect(decideResume(facts).decision).toBe('auto_resume')
  })
})

describe('collectResumeFacts / planResume', () => {
  it('读取交接检查点最新记录与进展检查点 next 节', async () => {
    writeFileSync(
      join(dir, 'handoff', 's1.json'),
      JSON.stringify({ key: 's1', history: [{ ts: Math.floor(Date.now() / 1000) - 60, left: 'run tests first' }] }),
      'utf8',
    )
    writeFileSync(join(dir, 'progress', 's1.md'), '## goal\ndemo\n\n## next\nverify checkpoint\n\n## blockers\n', 'utf8')
    const facts = collectResumeFacts({ sessionId: 's1' })
    expect(facts.handoff).toMatchObject({ found: true, next: 'run tests first' })
    expect(facts.progress).toMatchObject({ found: true, next: 'verify checkpoint' })
    const plan = await planResume({ sessionId: 's1' })
    expect(plan.decision).toBe('auto_resume')
  })

  it('损坏的交接文件 → 新会话', async () => {
    writeFileSync(join(dir, 'handoff', 's2.json'), '{not-json', 'utf8')
    const plan = await planResume({ sessionId: 's2' })
    expect(plan.decision).toBe('new_session')
    expect(plan.reasons.join(' ')).toContain('损坏')
  })

  it('无检查点 → 新会话（图库缺席不抛）', async () => {
    const plan = await planResume({ runId: 'r-missing' })
    expect(plan.decision).toBe('new_session')
    expect(plan.facts.graph.found).toBe(false)
  })
})
