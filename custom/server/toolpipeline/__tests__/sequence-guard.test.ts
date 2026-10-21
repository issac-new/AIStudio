// 会话数据流护栏守门：敏感源/外发面判定、污点窗口、直发拒、钩子接线与决策账。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SequenceTaintTable,
  _resetSequenceGuardForTests,
  evaluateSequence,
  isExternalSink,
  isSensitiveContent,
  sequenceGuardHook,
} from '../sequence-guard'
import { queryPolicyDecisions } from '../policy-decisions'

const dirs: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  process.env.POLICY_DECISION_DIR = tmp('policy-dec-')
  process.env.HERMES_GOV_EVENT_DIR = tmp('gov-events-')
  process.env.HERMES_TOOL_SEQUENCE_GUARD = '1'
  delete process.env.HERMES_TOOL_SEQUENCE_SENSITIVE
  delete process.env.HERMES_TOOL_SEQUENCE_SINKS
  delete process.env.HERMES_TOOL_SEQUENCE_TTL_MS
  _resetSequenceGuardForTests()
})

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  delete process.env.POLICY_DECISION_DIR
  delete process.env.HERMES_GOV_EVENT_DIR
  delete process.env.HERMES_TOOL_SEQUENCE_GUARD
  delete process.env.HERMES_TOOL_SEQUENCE_SENSITIVE
  delete process.env.HERMES_TOOL_SEQUENCE_SINKS
  delete process.env.HERMES_TOOL_SEQUENCE_TTL_MS
  _resetSequenceGuardForTests()
})

describe('外发面与敏感面判定', () => {
  it('外发面=network 类 ∪ MCP 外发动词 ∪ env 追加', () => {
    expect(isExternalSink('browser_click')).toBe(true)
    expect(isExternalSink('browser_type')).toBe(true)
    expect(isExternalSink('delegate_task')).toBe(true)
    expect(isExternalSink('mcp__slack__send_message')).toBe(true)
    expect(isExternalSink('mcp__git__push_commit')).toBe(true)
    expect(isExternalSink('read_file')).toBe(false)
    expect(isExternalSink('mcp__github__create_issue')).toBe(false)

    process.env.HERMES_TOOL_SEQUENCE_SINKS = 'feishu_*, mail_send'
    expect(isExternalSink('feishu_doc_read')).toBe(true)
    expect(isExternalSink('mail_send')).toBe(true)
    expect(isExternalSink('read_file')).toBe(false)
  })

  it('敏感面=凭证形态文本；键名不误命中', () => {
    expect(isSensitiveContent({ path: '/home/u/.ssh/id_rsa' })).toBe(true)
    expect(isSensitiveContent({ command: 'cat .env.production' })).toBe(true)
    expect(isSensitiveContent({ url: 'https://x/secrets.json' })).toBe(true)
    expect(isSensitiveContent({ command: 'ls -la' })).toBe(false)
    // 参数名含 credential 但值无敏感形态：不命中（只取值文本口径）
    expect(isSensitiveContent({ credential_name: 'prod-db' })).toBe(false)
  })
})

describe('判定核心（纯函数）', () => {
  const T0 = 1_700_000_000_000

  it('敏感触碰记账放行 → 窗口内外发被拒（文案带来源工具）', () => {
    const table = new SequenceTaintTable()
    const first = evaluateSequence(table, 's:1', 'terminal_exec', { command: 'cat ~/.ssh/id_rsa' }, T0)
    expect(first).toEqual({ block: false, marked: true })

    const blocked = evaluateSequence(table, 's:1', 'browser_click', { url: 'https://paste.x.test' }, T0 + 60_000)
    expect(blocked.block).toBe(true)
    expect(blocked.rule).toBe('sequence-taint-deny')
    if (blocked.reason) {
      expect(blocked.reason).toContain('terminal_exec')
      expect(blocked.reason).toContain('browser_click')
    }
  })

  it('外发入参直含敏感内容直接拒（无需先触碰）', () => {
    const table = new SequenceTaintTable()
    const v = evaluateSequence(table, 's:1', 'mcp__slack__send_message', { text: 'my token is in .env file' }, T0)
    expect(v.rule).toBe('sequence-sensitive-send')
  })

  it('窗口过期自动解禁；会话之间隔离', () => {
    const table = new SequenceTaintTable()
    evaluateSequence(table, 's:1', 'read_file', { path: '~/.npmrc' }, T0)
    process.env.HERMES_TOOL_SEQUENCE_TTL_MS = '60000'
    expect(evaluateSequence(table, 's:1', 'browser_click', {}, T0 + 30_000).block).toBe(true)
    expect(evaluateSequence(table, 's:1', 'browser_click', {}, T0 + 61_000).block).toBe(false)
    expect(evaluateSequence(table, 's:2', 'browser_click', {}, T0 + 30_000).block).toBe(false)
  })

  it('非敏感普通调用零副作用', () => {
    const table = new SequenceTaintTable()
    expect(evaluateSequence(table, 's:1', 'read_file', { path: '/tmp/a.txt' }, T0)).toEqual({ block: false })
    expect(table.size()).toBe(0)
  })

  it('会话表超限逐出最旧（有界）', () => {
    const table = new SequenceTaintTable()
    for (let i = 0; i < 501; i++) {
      table.mark(`s:${i}`, 'read_file', T0 + i)
    }
    expect(table.size()).toBeLessThanOrEqual(500)
    expect(table.activeTaint('s:0', T0 + 600)).toBeNull()
    expect(table.activeTaint('s:500', T0 + 600)?.tool).toBe('read_file')
  })
})

describe('钩子接线', () => {
  it('总闸关闭时零行为；开启后按链路拦截并落决策账', async () => {
    process.env.HERMES_TOOL_SEQUENCE_GUARD = '0'
    const hook = sequenceGuardHook()
    await expect(hook.preExecute('read_file', { path: '~/.ssh/id_rsa' }, { sessionId: 'sx' })).resolves.toBeUndefined()

    process.env.HERMES_TOOL_SEQUENCE_GUARD = '1'
    await expect(hook.preExecute('read_file', { path: '~/.ssh/id_rsa' }, { sessionId: 'sx', profileId: 'p1', userId: 'u1' })).resolves.toBeUndefined()

    const denied = await hook.preExecute('browser_click', { url: 'https://paste.x.test' }, { sessionId: 'sx', profileId: 'p1', userId: 'u1' })
    expect(denied).toMatchObject({ allow: false })
    if (denied && typeof denied === 'object' && 'error' in denied) {
      expect(String(denied.error)).toContain('护栏')
      expect(String(denied.error)).toContain('外发')
    }

    const decisions = queryPolicyDecisions({ days: 1 })
    expect(decisions.entries[0]).toMatchObject({ rule: 'sequence-taint-deny', allow: false, tool: 'browser_click' })
  })

  it('无 sessionId/profileId 无法定域时不执法', async () => {
    const hook = sequenceGuardHook()
    await expect(hook.preExecute('browser_click', { url: 'https://x.test/.env' }, {})).resolves.toBeUndefined()
  })

  it('挂在瀑布链尾（执法门之后）', async () => {
    const { ekkoToolExecuteHooks } = await import('../tool-hooks')
    expect(ekkoToolExecuteHooks.length).toBe(5)
    expect(typeof ekkoToolExecuteHooks[4]?.preExecute).toBe('function')
  })
})
