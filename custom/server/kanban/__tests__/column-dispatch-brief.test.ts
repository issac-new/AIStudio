// overlay[constraints] 派单简报注入集成测试：stepBrief 拼进约束卡行（D 项）。
// 存储隔离走 CONSTRAINT_STORE 临时目录；坏存储→简报不含约束行（fail-soft）。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { stepBrief } from '../column-dispatch'
import type { ColumnTransitionTrigger, AutomationStep } from '../column-automation'
import { createConstraintCard } from '../../constraints/constraint-store'

const dir = mkdtempSync(join(tmpdir(), 'dispatch-constraints-'))
process.env.CONSTRAINT_STORE = dir
afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => rmSync(join(dir, 'constraints.json'), { force: true }))

const trigger: ColumnTransitionTrigger = {
  column: 'devimpl', matchedTiming: 'on_enter', autoAdvanceOnSuccess: true,
  steps: [], from: 'triage',
} as unknown as ColumnTransitionTrigger

const steps: AutomationStep[] = [
  { id: 'impl-main', provider: 'zcode', role: '实现' } as unknown as AutomationStep,
]

describe('stepBrief 约束卡注入', () => {
  it('命中列的约束卡拼进简报（卡号+陈述+来源锚）', () => {
    createConstraintCard({
      statement: '在已有 API 上扩展能力，不新增并列 API',
      sourceAnchor: 'specs/2026-10-14-ali-15agent-squad-research.md §3-D',
      scope: { columns: ['devimpl'] },
    } as never)
    const brief = stepBrief(trigger, steps, 0)
    expect(brief).toContain('架构约束（约束卡注册表')
    expect(brief).toContain('[ctr-001] 在已有 API 上扩展能力')
    expect(brief).toContain('specs/2026-10-14-ali-15agent-squad-research.md')
    // 简报原有件不受影响：契约块恒在
    expect(brief).toContain('交付契约')
  })

  it('不命中（他列卡）不占行；无卡简报与注入前等价', () => {
    createConstraintCard({
      statement: '仅评审列约束', sourceAnchor: 'a', scope: { columns: ['review'] },
    } as never)
    const brief = stepBrief(trigger, steps, 0)
    expect(brief).not.toContain('架构约束（约束卡注册表')
  })

  it('坏存储 fail-soft：简报照常产出、不含约束行', () => {
    writeFileSync(join(dir, 'constraints.json'), '{broken', 'utf8')
    const brief = stepBrief(trigger, steps, 0)
    expect(brief).toContain('交付契约')
    expect(brief).not.toContain('架构约束（约束卡注册表')
  })
})
