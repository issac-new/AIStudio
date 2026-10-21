// 工具策略引擎守门：lint / 确定性求值 / strict / fail-closed / 执法门接线 / 决策账。
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  evaluatePolicy,
  lintPolicyDoc,
  policyArgText,
  policyPosture,
  starterPolicyDoc,
  type PolicySnapshot,
  type ToolPolicyDoc,
} from '../tool-policy'
import {
  _resetPolicyCacheForTests,
  _usePolicyDirForTests,
  loadPolicySnapshot,
  savePolicyDoc,
  toolPolicyFile,
} from '../policy-store'
import {
  applyApprovalBridge,
  evaluateEnforcement,
} from '../../toolpipeline/enforce-gate'
import { queryPolicyDecisions } from '../../toolpipeline/policy-decisions'

const dirs: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

function snap(doc: ToolPolicyDoc, fatal = false): PolicySnapshot {
  return { exists: true, file: '/tmp/policies.json', doc, problems: fatal ? ['bad'] : [], warnings: [], fatal }
}

const baseDoc = (over: Partial<ToolPolicyDoc> = {}): ToolPolicyDoc => ({
  version: 1,
  mode: 'permissive',
  rules: [],
  ...over,
})

beforeEach(() => {
  _usePolicyDirForTests(tmp('tool-policy-'))
  process.env.POLICY_DECISION_DIR = tmp('policy-dec-')
  process.env.AGENT_IDENTITY_STORE = tmp('agent-identity-')
  process.env.HERMES_GOV_EVENT_DIR = tmp('gov-events-')
  process.env.HERMES_TOOL_ENFORCE = '1'
  delete process.env.HERMES_TOOL_ENFORCE_MODE
  _resetPolicyCacheForTests()
})

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  delete process.env.HERMES_TOOL_POLICY_DIR
  delete process.env.POLICY_DECISION_DIR
  delete process.env.AGENT_IDENTITY_STORE
  delete process.env.HERMES_GOV_EVENT_DIR
  delete process.env.HERMES_TOOL_ENFORCE
  delete process.env.HERMES_TOOL_ENFORCE_MODE
  _resetPolicyCacheForTests()
})

describe('lint 与 schema', () => {
  it('合法文档零问题；未知字段/坏正则/重复 id 必红', () => {
    const ok = lintPolicyDoc(baseDoc({
      rules: [{
        id: 'deny-rm', name: '禁止删除', enabled: true, priority: 100, action: 'deny',
        match: { categories: ['exec'], argPattern: 'rm\\s+-rf' },
        reason: '破坏性操作',
      }],
    }))
    expect(ok.problems).toEqual([])
    expect(ok.doc?.rules).toHaveLength(1)

    const bad = lintPolicyDoc({
      version: 1, mode: 'permissive',
      rules: [
        { id: 'a', name: 'A', action: 'deny', match: { tools: ['x'] }, extra: 1 },
        { id: 'a', name: 'B', action: 'deny', match: { tools: ['y'], argPattern: '(' } },
        { id: 'c', name: 'C', action: 'deny', match: {} },
      ],
    })
    expect(bad.problems.some((p) => p.includes('未知字段「extra」'))).toBe(true)
    expect(bad.problems.some((p) => p.includes('id 重复'))).toBe(true)
    expect(bad.problems.some((p) => p.includes('不是合法正则'))).toBe(true)
    expect(bad.problems.some((p) => p.includes('至少需要一个条件'))).toBe(true)
  })

  it('strict 无 allow 规则、全放行规则给告警但不阻断保存', () => {
    const strict = lintPolicyDoc(baseDoc({
      mode: 'strict',
      rules: [{ id: 'deny-all', name: '拒绝', enabled: true, priority: 0, action: 'deny', match: { tools: ['*'] } }],
    }))
    expect(strict.problems).toEqual([])
    expect(strict.warnings.some((w) => w.includes('没有任何启用的 allow 规则'))).toBe(true)

    const broad = lintPolicyDoc(baseDoc({
      rules: [{ id: 'allow-all', name: '全放行', enabled: true, priority: 0, action: 'allow', match: { tools: ['*'] } }],
    }))
    expect(broad.warnings.some((w) => w.includes('策略过宽'))).toBe(true)
  })
})

describe('确定性求值', () => {
  const call = (tool: string, category: 'read' | 'write' | 'exec' | 'network' = 'exec', input: Record<string, unknown> = {}) =>
    ({ tool, category, input, userId: 'alice', profileId: 'coding-agent' })

  it('deny 命中：工具前缀 + 入参正则大小写不敏感', () => {
    const doc = baseDoc({
      rules: [{
        id: 'deny-destructive', name: '禁止破坏性命令', enabled: true, priority: 100, action: 'deny',
        match: { tools: ['terminal_*'], argPattern: 'rm\\s+-rf' },
      }],
    })
    const v = evaluatePolicy(snap(doc), call('terminal_exec', 'exec', { command: 'RM -RF /tmp/x' }))
    expect(v).toMatchObject({ status: 'deny', mode: 'permissive', ruleId: 'deny-destructive' })
  })

  it('priority 高者先；disabled 规则跳过', () => {
    const doc = baseDoc({
      rules: [
        { id: 'allow-exec', name: '放行执行', enabled: true, priority: 10, action: 'allow', match: { categories: ['exec'] } },
        { id: 'deny-exec', name: '拒绝执行', enabled: true, priority: 20, action: 'deny', match: { categories: ['exec'] } },
        { id: 'deny-all', name: '全拒', enabled: false, priority: 1000, action: 'deny', match: { tools: ['*'] } },
      ],
    })
    expect(evaluatePolicy(snap(doc), call('terminal_exec'))).toMatchObject({ status: 'deny', ruleId: 'deny-exec' })
  })

  it('permissive 无命中放行；strict 无命中拒绝；strict allow 命中放行', () => {
    const permissive = baseDoc({ rules: [] })
    expect(evaluatePolicy(snap(permissive), call('read_file', 'read'))).toMatchObject({ status: 'allow' })
    expect(evaluatePolicy(snap(permissive), call('read_file', 'read')).ruleId).toBeUndefined()

    const strict = baseDoc({ mode: 'strict', rules: [] })
    const denied = evaluatePolicy(snap(strict), call('read_file', 'read'))
    expect(denied).toMatchObject({ status: 'deny', mode: 'strict' })
    expect(denied.status === 'deny' && denied.ruleId).toBeUndefined()

    const strictAllow = baseDoc({
      mode: 'strict',
      rules: [{ id: 'allow-read', name: '只读', enabled: true, priority: 0, action: 'allow', match: { categories: ['read'] } }],
    })
    expect(evaluatePolicy(snap(strictAllow), call('read_file', 'read'))).toMatchObject({ status: 'allow', ruleId: 'allow-read' })
    expect(evaluatePolicy(snap(strictAllow), call('terminal_exec'))).toMatchObject({ status: 'deny', mode: 'strict' })
  })

  it('require_approval 与用户/profile 条件', () => {
    const doc = baseDoc({
      rules: [{
        id: 'approve-alice', name: 'alice 外发需审批', enabled: true, priority: 0, action: 'require_approval',
        match: { categories: ['network'], users: ['alice'], profiles: ['coding-*'] },
        reason: '外发动作',
      }],
    })
    expect(evaluatePolicy(snap(doc), call('browser_click', 'network'))).toMatchObject({ status: 'require_approval', ruleId: 'approve-alice' })
    expect(evaluatePolicy(snap(doc), { ...call('browser_click', 'network'), userId: 'bob' })).toMatchObject({ status: 'allow' })
    expect(evaluatePolicy(snap(doc), { ...call('browser_click', 'network'), profileId: 'ops' })).toMatchObject({ status: 'allow' })
  })

  it('未配置=inactive；配置损坏=error（fail-closed）', () => {
    expect(evaluatePolicy({ exists: false, file: null, doc: null, problems: [], warnings: [], fatal: false }, call('read_file', 'read')))
      .toMatchObject({ status: 'inactive' })
    const broken = evaluatePolicy(snap(baseDoc(), true), call('read_file', 'read'))
    expect(broken).toMatchObject({ status: 'error' })
    expect(broken.status === 'error' && broken.reason).toContain('fail-closed')
  })

  it('入参文本只取值不取键名', () => {
    expect(policyArgText({ command: 'echo hi', nested: { path: '/tmp/a' } })).toContain('echo hi')
    expect(policyArgText({ command: 'echo hi' })).not.toContain('command')
  })
})

describe('策略存储', () => {
  it('保存→加载 roundtrip；非法文档拒写', () => {
    const doc = starterPolicyDoc()
    const saved = savePolicyDoc(doc, 'tester')
    expect(saved.ok).toBe(true)
    if (saved.ok) expect(saved.doc.updatedBy).toBe('tester')

    const loaded = loadPolicySnapshot()
    expect(loaded.exists).toBe(true)
    expect(loaded.fatal).toBe(false)
    expect(loaded.doc?.rules).toHaveLength(3)
    expect(JSON.parse(readFileSync(toolPolicyFile(), 'utf8')).mode).toBe('permissive')

    const bad = savePolicyDoc({ mode: 'permissive', rules: [{ id: 'x', name: 'X', action: 'nope', match: { tools: ['*'] } }] })
    expect(bad.ok).toBe(false)
  })

  it('损坏文件 fatal；policyPosture 四态如实', () => {
    writeFileSync(toolPolicyFile(), '{ broken json')
    _resetPolicyCacheForTests()
    const broken = loadPolicySnapshot()
    expect(broken.exists).toBe(true)
    expect(broken.fatal).toBe(true)
    expect(policyPosture(broken, true).status).toBe('broken')

    const unconfigured: PolicySnapshot = { exists: false, file: null, doc: null, problems: [], warnings: [], fatal: false }
    expect(policyPosture(unconfigured, true).status).toBe('unconfigured')

    const doc = baseDoc({ mode: 'strict', rules: [] })
    expect(policyPosture(snap(doc), false).status).toBe('saved-only')
    expect(policyPosture(snap(doc), true).status).toBe('strict')
  })
})

describe('执法门接线', () => {
  const policyOf = (doc: ToolPolicyDoc, fatal = false) => () => snap(doc, fatal)

  it('策略 deny 优先于放行并带 policyRuleId', () => {
    const v = evaluateEnforcement('terminal_exec', { command: 'rm -rf /' }, 'coding-agent', {
      masterOn: true,
      policyOf: policyOf(baseDoc({
        rules: [{ id: 'deny-rm', name: '禁止删除', enabled: true, priority: 0, action: 'deny', match: { categories: ['exec'], argPattern: 'rm\\s+-rf' } }],
      })),
    })
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'policy-deny', policyRuleId: 'deny-rm' })
  })

  it('策略 require_approval 走审批类规则；批准后保留策略追溯', () => {
    const denied = evaluateEnforcement('browser_click', { url: 'https://x.test' }, 'p1', {
      masterOn: true,
      policyOf: policyOf(baseDoc({
        rules: [{ id: 'approve-click', name: '点击需审批', enabled: true, priority: 0, action: 'require_approval', match: { categories: ['network'] } }],
      })),
    })
    expect(denied).toMatchObject({ enforcing: true, allow: false, rule: 'policy-require-approval', policyRuleId: 'approve-click' })

    const approved = applyApprovalBridge(denied, { approved: true })
    expect(approved).toMatchObject({ enforcing: true, allow: true, rule: 'approval-passed', policyRuleId: 'approve-click' })
  })

  it('策略 allow 不放宽阶梯硬边界；无阶梯/模式时如实审计 policy-allow/pass', () => {
    const allowRead = baseDoc({
      rules: [{ id: 'allow-read', name: '只读', enabled: true, priority: 0, action: 'allow', match: { categories: ['read'] } }],
    })
    const pass = evaluateEnforcement('read_file', { path: '/tmp/a' }, 'p1', { masterOn: true, policyOf: policyOf(allowRead) })
    expect(pass).toMatchObject({ enforcing: true, allow: true, rule: 'policy-allow', policyRuleId: 'allow-read' })

    const permissive = evaluateEnforcement('read_file', {}, 'p1', { masterOn: true, policyOf: policyOf(baseDoc()) })
    expect(permissive).toMatchObject({ enforcing: true, allow: true, rule: 'policy-pass', policyMode: 'permissive' })

    const insightBlocked = evaluateEnforcement('terminal_exec', { command: 'ls' }, 'p1', {
      masterOn: true,
      policyOf: policyOf(baseDoc({
        rules: [{ id: 'allow-exec', name: '放行执行', enabled: true, priority: 0, action: 'allow', match: { categories: ['exec'] } }],
      })),
      ladderOf: () => ({ target: 'p1', level: 'insight', approvalPoints: [], maxRiskTier: 'low', updatedAt: 0 }),
    })
    expect(insightBlocked).toMatchObject({ enforcing: true, allow: false, rule: 'ladder-insight-readonly' })
  })

  it('配置损坏 fail-closed；未配置维持 no-config', () => {
    const broken = evaluateEnforcement('read_file', {}, 'p1', { masterOn: true, policyOf: policyOf(baseDoc(), true) })
    expect(broken).toMatchObject({ enforcing: true, allow: false, rule: 'policy-error' })

    const none = evaluateEnforcement('read_file', {}, 'p1', { masterOn: true, policyOf: () => null })
    expect(none).toMatchObject({ enforcing: false, rule: 'no-config' })
  })

  it('钩子裁决落决策账并带 policyRuleId', async () => {
    savePolicyDoc({
      mode: 'permissive',
      rules: [{ id: 'deny-rm', name: '禁止删除', enabled: true, priority: 0, action: 'deny', match: { categories: ['exec'], argPattern: 'rm\\s+-rf' } }],
    })
    _resetPolicyCacheForTests()
    const { ekkoEnforceGateHook } = await import('../../toolpipeline/enforce-gate')
    const res = await ekkoEnforceGateHook().preExecute?.('terminal_exec', { command: 'rm -rf /tmp/x' }, { profileId: 'p1', sessionId: 's1', runId: 'r1' })
    expect(res).toMatchObject({ allow: false })
    if (res && typeof res === 'object' && 'error' in res) expect(String(res.error)).toContain('deny-rm')

    const decisions = queryPolicyDecisions({ days: 1 })
    expect(decisions.entries[0]).toMatchObject({ rule: 'policy-deny', policyRuleId: 'deny-rm', allow: false })
  })
})
