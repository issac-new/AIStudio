// W2 审批口径收口：session 规则落地、allow 过期执法、旧档补期迁移。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ALLOW_RULE_TTL_MS,
  evaluate,
  ruleFromDecision,
  type ApprovalRule,
  type ToolCallRequest,
} from '../approval-domain'
import { ApprovalRuleStore, __resetApprovalStoreForTests } from '../approval-store'

const call = (over: Partial<ToolCallRequest> = {}): ToolCallRequest => ({
  tool: 'terminal_exec', argv: ['rm', '-rf', '/tmp/x'],
  sessionId: 'sess-1', ...over,
} as ToolCallRequest)

describe('ruleFromDecision：决策学习表（W2）', () => {
  const candidate = { tool: 'terminal_exec', argvPrefix: 'rm -rf /tmp/x', matchDomain: false }
  const now = 1_000_000

  it('approved_for_session 不再 no-op：落 session 档 allow 带 sessionId+24h 过期', () => {
    const rule = ruleFromDecision('approved_for_session', call(), candidate, now)
    expect(rule).not.toBeNull()
    expect(rule!.list).toBe('allow')
    expect(rule!.scope).toBe('session')
    expect(rule!.sessionId).toBe('sess-1')
    expect(rule!.expiresAt).toBe(now + ALLOW_RULE_TTL_MS)
  })

  it('无 sessionId 可绑时不学习（不落宽于承诺的规则）', () => {
    const rule = ruleFromDecision('approved_for_session', call({ sessionId: undefined }), candidate, now)
    expect(rule).toBeNull()
  })

  it('approved_scoped 学成全局 allow 必带 24h 过期', () => {
    const rule = ruleFromDecision('approved_scoped', call(), candidate, now)
    expect(rule!.list).toBe('allow')
    expect(rule!.scope).toBe('global')
    expect(rule!.expiresAt).toBe(now + ALLOW_RULE_TTL_MS)
  })

  it('denied_for_session 仍为 session deny 且不带过期（保护性规则不过期）', () => {
    const rule = ruleFromDecision('denied_for_session', call(), candidate, now)
    expect(rule!.list).toBe('deny')
    expect(rule!.expiresAt).toBeUndefined()
  })
})

describe('evaluate：allow 过期执法（W2）', () => {
  const allowRule = (over: Partial<ApprovalRule> = {}): ApprovalRule => ({
    list: 'allow', scope: 'session', tool: 'terminal_exec', argvPrefix: 'rm -rf /tmp/x',
    sessionId: 'sess-1', learnedFrom: 'approved_for_session', createdAt: 0, ...over,
  } as ApprovalRule)

  it('未过期 allow 命中放行', () => {
    const v = evaluate(call(), [allowRule({ expiresAt: Date.now() + 60_000 })], 'ask')
    expect(v.list).toBe('allow')
  })

  it('已过期 allow 不命中（回落 ask；过期不删档只失效）', () => {
    const v = evaluate(call(), [allowRule({ expiresAt: Date.now() - 1 })], 'ask')
    expect(v.list).toBe('default')
    expect(v).toMatchObject({ list: 'default', mode: 'ask' })
  })

  it('过期 deny 仍生效（deny 不过期——保护性规则不因时间削弱）', () => {
    const deny = { ...allowRule(), list: 'deny' as const, expiresAt: Date.now() - 1 }
    const v = evaluate(call(), [deny], 'ask')
    expect(v.list).toBe('deny')
  })
})

describe('ApprovalRuleStore：旧档无期限 allow 补期迁移（W2）', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'approval-rules-'))
    file = join(dir, 'rules.json')
    process.env.HERMES_APPROVAL_RULES_FILE = file
    __resetApprovalStoreForTests()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.HERMES_APPROVAL_RULES_FILE
    __resetApprovalStoreForTests()
  })

  it('装载时给无期限 allow 补 24h 并标 migratedAt，deny 不补期', () => {
    writeFileSync(file, JSON.stringify({
      defaultMode: 'ask',
      rules: [
        { list: 'allow', scope: 'global', tool: 'terminal_exec', learnedFrom: 'approved_scoped', createdAt: 1 },
        { list: 'deny', scope: 'global', tool: 'rm', learnedFrom: 'denied_scoped', createdAt: 2 },
      ],
    }))
    const before = Date.now()
    const store = new ApprovalRuleStore(file)
    const rules = store.list()
    const allow = rules.find((r) => r.list === 'allow')!
    const deny = rules.find((r) => r.list === 'deny')!
    expect(allow.expiresAt).toBeGreaterThan(before)
    expect(allow.expiresAt!).toBeLessThanOrEqual(before + ALLOW_RULE_TTL_MS + 1000)
    expect(allow.migratedAt).toBeGreaterThan(0)
    expect(deny.expiresAt).toBeUndefined()
    // 补期落盘（重开实例不重复补期）
    const persisted = JSON.parse(readFileSync(file, 'utf8')) as { rules: ApprovalRule[] }
    expect(persisted.rules[0].expiresAt).toBe(allow.expiresAt)
  })
})
