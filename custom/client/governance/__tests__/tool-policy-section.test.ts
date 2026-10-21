// 工具策略面板守门（2026-10-21 AGT 调研轮）：姿态横幅五态、规则表渲染、
// 新增规则保存负载、lint 问题阻断保存、空态起步策略、API 失败如实降级。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import {
  fetchStarterPolicyDoc,
  fetchToolPolicies,
  lintToolPolicyDoc,
  saveToolPolicyDoc,
} from '@/custom/governance/api/toolPolicy'

vi.mock('@/custom/governance/api/toolPolicy', () => ({
  fetchToolPolicies: vi.fn(),
  fetchStarterPolicyDoc: vi.fn(),
  lintToolPolicyDoc: vi.fn(),
  saveToolPolicyDoc: vi.fn(),
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: {} })

function stateFixture(postureStatus: string, rules: unknown[] = []) {
  return {
    ok: true,
    exists: postureStatus !== 'unconfigured',
    doc: rules.length
      ? { version: 1 as const, mode: 'permissive' as const, rules: rules as never, updatedAt: 1730000000000, updatedBy: 'tester' }
      : null,
    problems: [],
    warnings: [],
    posture: {
      status: postureStatus,
      mode: rules.length ? 'permissive' : null,
      totalRules: rules.length,
      enabledRules: rules.length,
      problems: [],
      warnings: [],
    },
    enforcement: { masterOn: postureStatus === 'permissive' || postureStatus === 'strict' },
    recent: { days: 7, allow: 3, deny: 2, byRule: [{ rule: 'policy-deny', count: 2, denied: 2 }] },
  }
}

const ruleFixture = {
  id: 'deny-rm',
  name: '禁止破坏性命令',
  enabled: true,
  priority: 100,
  action: 'deny' as const,
  match: { categories: ['exec' as const], argPattern: 'rm\\s+-rf' },
  reason: '破坏性操作不可自动执行',
}

async function mountComp() {
  const mod = await import('@/custom/governance/components/ToolPolicySection.vue')
  return mount(mod.default, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(lintToolPolicyDoc).mockResolvedValue({ ok: true, doc: null, problems: [], warnings: [] })
  vi.mocked(saveToolPolicyDoc).mockResolvedValue({
    ok: true,
    doc: { version: 1, mode: 'permissive', rules: [] },
    warnings: [],
  })
  vi.mocked(fetchStarterPolicyDoc).mockResolvedValue({
    ok: true,
    doc: { version: 1, mode: 'permissive', rules: [] },
  })
})

describe('工具策略面板', () => {
  it('姿态横幅按状态如实呈现；规则行渲染动作与命中条件', async () => {
    vi.mocked(fetchToolPolicies).mockResolvedValue(stateFixture('permissive', [ruleFixture]) as never)
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="tool-policy-posture"]').classes()).toContain('is-permissive')
    expect(w.find('[data-testid="tool-policy-posture"]').text()).toContain('宽松模式')
    expect(w.find('[data-testid="tool-policy-table"]').text()).toContain('禁止破坏性命令')
    expect(w.find('[data-testid="tool-policy-table"]').text()).toContain('rm\\s+-rf')
    expect(w.find('[data-testid="tool-policy-recent"]').text()).toContain('3')
    expect(w.find('[data-testid="tool-policy-recent"]').text()).toContain('2')
  })

  it('总闸未开时明示「只保存不拦截」；未配置明示「不等于已治理」', async () => {
    vi.mocked(fetchToolPolicies).mockResolvedValue(stateFixture('saved-only', [ruleFixture]) as never)
    let w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="tool-policy-posture"]').text()).toContain('只保存、不拦截')

    vi.mocked(fetchToolPolicies).mockResolvedValue(stateFixture('unconfigured') as never)
    w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="tool-policy-posture"]').text()).toContain('不等于已治理')
  })

  it('空态提供起步策略入口并真实保存', async () => {
    vi.mocked(fetchToolPolicies).mockResolvedValue(stateFixture('unconfigured') as never)
    vi.mocked(fetchStarterPolicyDoc).mockResolvedValue({
      ok: true,
      doc: { version: 1, mode: 'permissive', rules: [ruleFixture] },
    })
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="tool-policy-load-starter"]').exists()).toBe(true)
    await w.find('[data-testid="tool-policy-load-starter"]').trigger('click')
    await flushPromises()
    expect(saveToolPolicyDoc).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveToolPolicyDoc).mock.calls[0][0].rules).toHaveLength(1)
  })

  it('新增规则：表单字段组装修校负载；lint 问题阻断保存', async () => {
    vi.mocked(fetchToolPolicies).mockResolvedValue(stateFixture('unconfigured') as never)
    const w = await mountComp()
    await flushPromises()

    await w.find('[data-testid="tool-policy-field-id"]').setValue('deny-drop')
    await w.find('[data-testid="tool-policy-field-name"]').setValue('禁止删表')
    await w.find('[data-testid="tool-policy-field-priority"]').setValue('90')
    await w.find('[data-testid="tool-policy-field-tools"]').setValue('terminal_exec, mcp__db__*')
    await w.find('[data-testid="tool-policy-cat-exec"]').setValue(true)
    await w.find('[data-testid="tool-policy-field-argpattern"]').setValue('drop\\s+table')
    await w.find('[data-testid="tool-policy-field-reason"]').setValue('删表需人工')
    await w.find('[data-testid="tool-policy-save"]').trigger('submit')
    await flushPromises()

    const payload = vi.mocked(saveToolPolicyDoc).mock.calls[0][0]
    expect(payload.rules[0]).toMatchObject({
      id: 'deny-drop', name: '禁止删表', priority: 90, action: 'deny',
      match: { tools: ['terminal_exec', 'mcp__db__*'], categories: ['exec'], argPattern: 'drop\\s+table' },
    })

    vi.mocked(lintToolPolicyDoc).mockResolvedValue({
      ok: true, doc: null, problems: ['rules[0].id 须为 1-64 位小写字母/数字/连字符'], warnings: [],
    })
    await w.find('[data-testid="tool-policy-save"]').trigger('submit')
    await flushPromises()
    expect(saveToolPolicyDoc).toHaveBeenCalledTimes(1) // 未再保存
    expect(w.find('[data-testid="tool-policy-problems"]').text()).toContain('必须修复')
  })

  it('API 失败如实显示错误，不编造姿态', async () => {
    vi.mocked(fetchToolPolicies).mockRejectedValue(new Error('boom'))
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="tool-policy-error"]').text()).toContain('boom')
    expect(w.find('[data-testid="tool-policy-posture"]').text()).toContain('未配置策略')
  })
})
