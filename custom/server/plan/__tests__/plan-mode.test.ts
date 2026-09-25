// Plan Mode 三件套守门（minimax：agent 主动进入/确认门/auto 档/执行流转）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { decidePlan, listRequested, loadPlan, markExecuting, requestPlanMode } from '../plan-mode'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plan-'))
  process.env.HERMES_PLAN_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_PLAN_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('三件套状态机', () => {
  it('agent 主动进入→确认门→执行；拒绝路径；auto 档免确认', () => {
    const p = requestPlanMode({ planId: 'pl1', fromAgent: 'zcode', planText: '阶段1/阶段2' })
    expect(p.state).toBe('requested')
    expect(listRequested().map((x) => x.planId)).toEqual(['pl1'])

    const confirmed = decidePlan('pl1', 'confirmed', 'coordinator', '进')
    expect('state' in confirmed && confirmed.state).toBe('confirmed')
    const exec = markExecuting('pl1')
    expect('state' in exec && exec.state).toBe('executing')
    const again = decidePlan('pl1', 'rejected', 'x')
    expect('error' in again && again.error).toContain('已裁决')

    requestPlanMode({ planId: 'pl2', fromAgent: 'zcode', planText: 'x' })
    const no = decidePlan('pl2', 'rejected', 'coordinator')
    expect('state' in no && no.state).toBe('rejected')
    expect('error' in markExecuting('pl2')).toBe(true)

    const auto = requestPlanMode({ planId: 'pl3', fromAgent: 'zcode', planText: 'y', auto: true })
    expect(auto.state).toBe('auto-approved')
    expect('state' in markExecuting('pl3')).toBe(true)

    expect(loadPlan('pl1')!.decision!.by).toBe('coordinator')
  })

  it('幂等 planId；未确认不可执行', () => {
    const a = requestPlanMode({ planId: 'p4', fromAgent: 'z', planText: 't' })
    const b = requestPlanMode({ planId: 'p4', fromAgent: 'z2', planText: 'changed' })
    expect(b.fromAgent).toBe(a.fromAgent)
    expect('error' in markExecuting('p4')).toBe(true)
  })
})
