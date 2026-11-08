// 交接规则守护：解析/校验、选择（含 NONE 与跨家族不猜）、渲染、回执缺项、派单注入。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  EVIDENCE_LABELS,
  checkHandoffConformance,
  handoffRuleLineFor,
  loadHandoffRules,
  parseHandoffRules,
  renderHandoffRuleLine,
  selectHandoffRule,
  type HandoffRuleFamily,
} from '../handoff-rules'
import { dispatchColumnTransition } from '../../kanban/column-dispatch'
import { resetColumnAutomationsCacheForTests } from '../../kanban/column-automation'

const rulesYaml = `
version: 1
families:
  - family_id: hf-test
    description: 测试族
    rules:
      - rule_id: impl-to-review
        from: in_progress
        to: review
        trigger: 实现完成进入评审
        instruction: 交接必须带改动文件清单与复现命令
        required_evidence: [changed_files, repro_command, not_verified]
        verification: 评审先核对三项证据
        fallback: 缺项退回补齐
        version: 1
        status: active
      - rule_id: todo-to-impl
        from: todo
        to: in_progress
        instruction: 交接必须说明改动面
        required_evidence: [scope]
        version: 2
        status: active
`

const ambiguousYaml = rulesYaml + `
  - family_id: hf-other
    description: 另一族
    rules:
      - rule_id: other-impl-to-review
        from: in_progress
        to: review
        instruction: 另一套契约
        required_evidence: [other_evidence]
        version: 1
        status: active
`

function familiesOf(text = rulesYaml): HandoffRuleFamily[] {
  const parsed = parseHandoffRules(text)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.library.families
}

describe('parseHandoffRules', () => {
  it('合法表归一化：from/to 小写、必带证据、版本/状态就位', () => {
    const rule = familiesOf()[0].rules.find((r) => r.ruleId === 'impl-to-review')!
    expect(rule.from).toBe('in_progress')
    expect(rule.to).toBe('review')
    expect(rule.requiredEvidence).toEqual(['changed_files', 'repro_command', 'not_verified'])
    expect(rule.version).toBe(1)
    expect(rule.status).toBe('active')
  })

  it('from==to 拒绝', () => {
    const r = parseHandoffRules(rulesYaml.replace('from: in_progress\n        to: review', 'from: review\n        to: review'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('不能相同')
  })

  it('instruction 缺失拒绝', () => {
    const r = parseHandoffRules(rulesYaml.replace('instruction: 交接必须带改动文件清单与复现命令', 'instruction: ""'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('instruction')
  })

  it('家族内 rule_id 重复拒绝', () => {
    const r = parseHandoffRules(rulesYaml.replace('rule_id: todo-to-impl', 'rule_id: impl-to-review'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('重复')
  })

  it('坏 YAML 返回解析失败而非抛错', () => {
    const r = parseHandoffRules('families: [{]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('解析失败')
  })
})

describe('selectHandoffRule', () => {
  it('精确匹配 (from,to) 返回规则（单族表）', () => {
    const s = selectHandoffRule(familiesOf(), { from: 'in_progress', to: 'review' })
    expect(s.rule?.ruleId).toBe('impl-to-review')
    expect(s.candidates).toBe(1)
  })

  it('跨家族同对多命中且未指定 familyId → null（不猜）', () => {
    const s = selectHandoffRule(familiesOf(ambiguousYaml), { from: 'in_progress', to: 'review' })
    expect(s.rule).toBeNull()
    expect(s.reason).toContain('跨')
  })

  it('指定 familyId 后消歧', () => {
    const s = selectHandoffRule(familiesOf(ambiguousYaml), { from: 'in_progress', to: 'review', familyId: 'hf-other' })
    expect(s.rule?.familyId).toBe('hf-other')
    expect(s.rule?.requiredEvidence).toEqual(['other_evidence'])
  })

  it('无命中 → NONE', () => {
    const s = selectHandoffRule(familiesOf(), { from: 'review', to: 'done' })
    expect(s.rule).toBeNull()
    expect(s.reason).toContain('NONE')
  })

  it('退役规则不参与选择', () => {
    const fams = familiesOf()
    fams[0].rules[0] = { ...fams[0].rules[0], status: 'retired' }
    const s = selectHandoffRule(fams, { from: 'in_progress', to: 'review' })
    expect(s.rule).toBeNull()
  })
})

describe('渲染与回执检查', () => {
  const rule = familiesOf()[0].rules.find((r) => r.ruleId === 'impl-to-review')!

  it('渲染带中文标签、验证与缺项处置', () => {
    const line = renderHandoffRuleLine(rule)
    expect(line).toContain('交接契约（handoff-rules:hf-test/impl-to-review v1）')
    expect(line).toContain(EVIDENCE_LABELS.changed_files)
    expect(line).toContain('验证：')
    expect(line).toContain('缺项处置：')
  })

  it('回执缺项检查：缺 not_verified 即不通过', () => {
    const c = checkHandoffConformance(rule, ['changed_files', 'repro_command'])
    expect(c.ok).toBe(false)
    expect(c.missing).toEqual(['not_verified'])
    const full = checkHandoffConformance(rule, ['changed_files', 'repro_command', 'not_verified'])
    expect(full.ok).toBe(true)
  })
})

describe('注入面（column-dispatch）', () => {
  let home = ''
  let rulesFile = ''
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'handoff-rules-'))
    rulesFile = join(home, 'rules.yaml')
    writeFileSync(rulesFile, rulesYaml, 'utf8')
    process.env.HANDOFF_RULES_PATH = rulesFile
    process.env.HERMES_HOME = join(home, '.hermes')
    process.env.HERMES_EVIDENCE_DIR = join(home, 'evidence')
    process.env.GOVERNANCE_DISPATCH_LEDGER = join(home, 'dispatch-ledger.json')
    process.env.HERMES_COLUMNS_FILE = join(home, 'columns.yaml')
    writeFileSync(
      process.env.HERMES_COLUMNS_FILE,
      ['columns:', '  review:', '    timing: entry', '    steps:', '      - id: qa', '        role: qa', '        provider: zcode', ''].join('\n'),
      'utf8',
    )
    delete process.env.EXPERIENCE_INJECT
    delete process.env.FLYWHEEL_FEWSHOT_INJECT
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
    if (home) rmSync(home, { recursive: true, force: true })
  })

  it('handoffRuleLineFor：默认注入；HANDOFF_RULES_INJECT=0 关闭', () => {
    const line = handoffRuleLineFor('in_progress', 'review', '实现完成进入评审')
    expect(line).toBeTruthy()
    expect(line).toContain('impl-to-review')
    process.env.HANDOFF_RULES_INJECT = '0'
    expect(handoffRuleLineFor('in_progress', 'review', '实现完成进入评审')).toBeNull()
  })

  it('loadHandoffRules：正本缺席 → available:false 不抛错', () => {
    process.env.HANDOFF_RULES_PATH = join(home, 'missing.yaml')
    const r = loadHandoffRules()
    expect(r.available).toBe(false)
    expect(r.reason).toContain('缺席')
  })

  it('派单简报：单族表注入契约行；跨族歧义时不注入（诚实 NONE）', async () => {
    const texts: string[] = []
    const service = {
      dispatch: async (p: { text: string }) => {
        texts.push(p.text)
        return [{ reason: 'queued', detail: 'ok' }]
      },
    } as never
    await dispatchColumnTransition(service, { from: 'in_progress', to: 'review', workspacePath: '/tmp/w' })
    expect(texts[0]).toContain('交接契约（handoff-rules:hf-test/impl-to-review v1）')

    writeFileSync(rulesFile, ambiguousYaml, 'utf8')
    texts.length = 0
    await dispatchColumnTransition(service, { from: 'in_progress', to: 'review', workspacePath: '/tmp/w' })
    expect(texts[0]).not.toContain('交接契约（handoff-rules:')
  })
})
