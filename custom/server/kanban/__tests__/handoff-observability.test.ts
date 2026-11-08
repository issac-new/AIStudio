// P5 可观测面守护（EvoTeam 收尾批，2026-11-08）：交接规则选择结果随派发透出、
// 命中入台账 handoffRule 字段、A/B 简报差恰一行（成本校准）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { selectHandoffRuleForDispatch } from '../../handoff/handoff-rules'
import { dispatchColumnTransition, stepBrief } from '../column-dispatch'
import { resetColumnAutomationsCacheForTests } from '../column-automation'
import type { ColumnTransitionTrigger, AutomationStep } from '../column-automation'

const rulesYaml = `
version: 1
families:
  - family_id: hf-obs
    description: 观测面测试族
    rules:
      - rule_id: impl-to-review
        from: in_progress
        to: review
        instruction: 交接必须带改动文件清单与复现命令
        required_evidence: [changed_files, repro_command]
        verification: 评审先核对证据
        fallback: 缺项退回补齐
        version: 1
        status: active
`

let home = ''
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'handoff-obs-'))
  writeFileSync(join(home, 'rules.yaml'), rulesYaml, 'utf8')
  process.env.HANDOFF_RULES_PATH = join(home, 'rules.yaml')
  process.env.HERMES_HOME = join(home, '.hermes')
  process.env.HERMES_EVIDENCE_DIR = join(home, 'evidence')
  process.env.GOVERNANCE_DISPATCH_LEDGER = join(home, 'dispatch-ledger.jsonl')
  process.env.HERMES_COLUMNS_FILE = join(home, 'columns.yaml')
  writeFileSync(
    process.env.HERMES_COLUMNS_FILE,
    ['columns:', '  review:', '    timing: entry', '    steps:', '      - id: qa', '        role: qa', '        provider: zcode', ''].join('\n'),
    'utf8',
  )
  delete process.env.EXPERIENCE_INJECT
  delete process.env.FLYWHEEL_FEWSHOT_INJECT
  delete process.env.HANDOFF_RULES_INJECT
  resetColumnAutomationsCacheForTests()
})
afterEach(() => {
  delete process.env.HANDOFF_RULES_PATH
  delete process.env.HANDOFF_RULES_INJECT
  delete process.env.HERMES_HOME
  delete process.env.HERMES_EVIDENCE_DIR
  delete process.env.GOVERNANCE_DISPATCH_LEDGER
  delete process.env.HERMES_COLUMNS_FILE
  resetColumnAutomationsCacheForTests()
  rmSync(home, { recursive: true, force: true })
})

describe('selectHandoffRuleForDispatch 选择面', () => {
  it('命中：line＋familyId/ruleId/version＋理由齐备', () => {
    const s = selectHandoffRuleForDispatch('in_progress', 'review')
    expect(s.line).toContain('hf-obs/impl-to-review')
    expect(s.familyId).toBe('hf-obs')
    expect(s.ruleId).toBe('impl-to-review')
    expect(s.version).toBe(1)
    expect(s.reason).toContain('命中')
  })

  it('NONE：line=null 且 reason 给因（无命中/开关关/表缺席三态）', () => {
    expect(selectHandoffRuleForDispatch('review', 'done').line).toBeNull()
    expect(selectHandoffRuleForDispatch('review', 'done').reason).toContain('NONE')
    process.env.HANDOFF_RULES_INJECT = '0'
    const off = selectHandoffRuleForDispatch('in_progress', 'review')
    expect(off.line).toBeNull()
    expect(off.reason).toContain('开关关闭')
    delete process.env.HANDOFF_RULES_INJECT
    process.env.HANDOFF_RULES_PATH = join(home, 'missing.yaml')
    const absent = selectHandoffRuleForDispatch('in_progress', 'review')
    expect(absent.line).toBeNull()
    expect(absent.reason).toContain('缺席')
  })
})

describe('派发结果面与台账（column-dispatch 接线）', () => {
  it('命中：结果面给 ruleId；台账 column 条目落 handoffRule=<family>/<rule>', async () => {
    const service = {
      dispatch: async () => [{ reason: 'queued', detail: 'ok', sessionId: 's1', commandId: 'c1' }],
    } as never
    const r = await dispatchColumnTransition(service, { from: 'in_progress', to: 'review', workspacePath: '/tmp/w' })
    expect(r.handoffRules).toHaveLength(1)
    expect(r.handoffRules[0]).toMatchObject({ column: 'review', familyId: 'hf-obs', ruleId: 'impl-to-review', version: 1 })
    const rows = readFileSync(process.env.GOVERNANCE_DISPATCH_LEDGER as string, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(rows).toHaveLength(1)
    expect(rows[0].handoffRule).toBe('hf-obs/impl-to-review')
    expect(rows[0].kind).toBe('column')
  })

  it('NONE：结果面 ruleId=null 且 reason=无命中；台账条目无 handoffRule 字段', async () => {
    const service = { dispatch: async () => [{ reason: 'queued', detail: 'ok' }] } as never
    const r = await dispatchColumnTransition(service, { from: 'todo', to: 'review', workspacePath: '/tmp/w' })
    expect(r.handoffRules[0].ruleId).toBeNull()
    expect(r.handoffRules[0].reason).toContain('NONE')
    const rows = readFileSync(process.env.GOVERNANCE_DISPATCH_LEDGER as string, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(rows[0].handoffRule).toBeUndefined()
  })
})

describe('A/B 简报差（成本校准）', () => {
  const trigger = { column: 'review', matchedTiming: 'on_enter', autoAdvanceOnSuccess: true, steps: [], from: 'in_progress' } as unknown as ColumnTransitionTrigger
  const steps: AutomationStep[] = [{ id: 'qa', provider: 'zcode', role: '评审' } as unknown as AutomationStep]

  it('注入与不注入的简报差恰为一行（交接契约行）', () => {
    const withLine = stepBrief(trigger, steps, 0, null, null, null, '交接契约（handoff-rules:hf-obs/impl-to-review v1）：测试契约行')
    const withoutLine = stepBrief(trigger, steps, 0, null, null, null, null)
    const a = withLine.split('\n')
    const b = withoutLine.split('\n')
    expect(a.length).toBe(b.length + 1)
    expect(a[a.length - 2]).toContain('交接契约')
    expect(a[a.length - 1]).toBe(b[b.length - 1]) // 契约块 footer 恒在末位不受影响
  })
})
