// 执法门 P0-1/P2-5 守门：身份工具白名单、沙箱路径、浏览器域名、放行决策账。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ekkoEnforceGateHook,
  evaluateEnforcement,
  sandboxNetworkViolation,
  sandboxPathViolation,
  toolAllowedByList,
  type IdentityLite,
} from '../enforce-gate'
import { queryPolicyDecisions } from '../policy-decisions'
import { registerIdentity } from '../../agentidentity/agent-identity'

const dirs: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  process.env.POLICY_DECISION_DIR = tmp('policy-dec-')
  process.env.AGENT_IDENTITY_STORE = tmp('agent-identity-')
  process.env.HERMES_GOV_EVENT_DIR = tmp('gov-events-')
  process.env.HERMES_TOOL_ENFORCE = '1'
  delete process.env.HERMES_TOOL_ENFORCE_MODE
  delete process.env.HERMES_TOOL_SANDBOX_ROOTS
  delete process.env.HERMES_BROWSER_ALLOWLIST
  delete process.env.HERMES_BROWSER_DENYLIST
})

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  delete process.env.POLICY_DECISION_DIR
  delete process.env.AGENT_IDENTITY_STORE
  delete process.env.HERMES_GOV_EVENT_DIR
  delete process.env.HERMES_TOOL_ENFORCE
  delete process.env.HERMES_TOOL_ENFORCE_MODE
  delete process.env.HERMES_TOOL_SANDBOX_ROOTS
  delete process.env.HERMES_BROWSER_ALLOWLIST
  delete process.env.HERMES_BROWSER_DENYLIST
})

const identity = (allowlist: string[]): IdentityLite => ({ id: 'aid-001', name: 'alice', toolAllowlist: allowlist })

describe('身份工具白名单（P0-1）', () => {
  it('白名单支持精确与 prefix* 通配', () => {
    expect(toolAllowedByList('read_file', ['read_file'])).toBe(true)
    expect(toolAllowedByList('kanban_create', ['kanban_*'])).toBe(true)
    expect(toolAllowedByList('kanban_create', ['read_*'])).toBe(false)
  })

  it('命中白名单且无阶梯/模式时放行，规则 identity-pass', () => {
    const v = evaluateEnforcement('read_file', {}, 'p1', {
      masterOn: true,
      userId: 'alice',
      identityOf: () => identity(['read_file']),
    })
    expect(v).toMatchObject({ enforcing: true, allow: true, rule: 'identity-pass' })
  })

  it('未命中白名单硬拒，规则 identity-tool-denied', () => {
    const v = evaluateEnforcement('terminal_exec', { command: 'rm -rf /' }, 'p1', {
      masterOn: true,
      userId: 'alice',
      identityOf: () => identity(['read_file']),
    })
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'identity-tool-denied' })
    if (v.enforcing && !v.allow) expect(v.error).toContain('terminal_exec')
  })

  it('无身份记录或空白名单=未声明，不改变既有 no-config 行为', () => {
    expect(evaluateEnforcement('terminal_exec', {}, 'p1', { masterOn: true, userId: 'ghost' })).toMatchObject({
      enforcing: false, rule: 'no-config',
    })
    expect(evaluateEnforcement('terminal_exec', {}, 'p1', {
      masterOn: true, userId: 'alice', identityOf: () => identity([]),
    })).toMatchObject({ enforcing: false, rule: 'no-config' })
  })
})

describe('沙箱硬边界（P2-5）', () => {
  it('显式路径超出沙箱根拒绝，根内放行，相对路径不检查', () => {
    expect(sandboxPathViolation('terminal_exec', { cwd: '/etc' }, ['/workspace'])).toBe('/etc')
    expect(sandboxPathViolation('terminal_exec', { cwd: '/workspace/repo' }, ['/workspace'])).toBeNull()
    expect(sandboxPathViolation('write_file', { path: '/tmp/x' }, ['/workspace'])).toBe('/tmp/x')
    expect(sandboxPathViolation('write_file', { path: 'relative/x' }, ['/workspace'])).toBeNull()
  })

  it('未配置根时不检查（不假装有沙箱）', () => {
    expect(sandboxPathViolation('terminal_exec', { cwd: '/etc' }, [])).toBeNull()
  })

  it('执法门对越界路径返回 sandbox-path', () => {
    process.env.HERMES_TOOL_SANDBOX_ROOTS = '/workspace'
    const v = evaluateEnforcement('terminal_exec', { cwd: '/etc' }, 'p1', { masterOn: true })
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'sandbox-path' })
  })

  it('浏览器域名策略：denylist 优先、allowlist 外拒绝、无规则放行', () => {
    expect(sandboxNetworkViolation('browser_navigate', { url: 'https://evil.example/x' })).toBeNull()
    process.env.HERMES_BROWSER_DENYLIST = 'evil.example'
    expect(sandboxNetworkViolation('browser_navigate', { url: 'https://evil.example/x' })).toContain('denylist')
    delete process.env.HERMES_BROWSER_DENYLIST
    process.env.HERMES_BROWSER_ALLOWLIST = 'good.example'
    expect(sandboxNetworkViolation('browser_navigate', { url: 'https://other.example' })).toContain('allowlist')
    expect(sandboxNetworkViolation('browser_navigate', { url: 'https://good.example/a' })).toBeNull()
    expect(sandboxNetworkViolation('browser_click', { selector: '#a' })).toBeNull()
  })
})

describe('执法钩子：身份与放行决策账（P0-2）', () => {
  it('放行与拒绝都落独立决策账，可按结果查询', async () => {
    const reg = registerIdentity({ name: 'alice', kind: 'human', owner: 'ops', toolAllowlist: ['read_file'] }, 'test')
    expect(reg.ok).toBe(true)
    const hook = ekkoEnforceGateHook()
    await hook.preExecute?.('read_file', { path: '/a' }, { userId: 'alice', sessionId: 's1' })
    const denied = await hook.preExecute?.('terminal_exec', { command: 'x' }, { userId: 'alice', sessionId: 's1' })
    expect(denied).toMatchObject({ allow: false })

    const all = queryPolicyDecisions({ days: 1, sessionId: 's1' })
    expect(all.total).toBe(2)
    expect(all.byOutcome).toEqual({ allow: 1, deny: 1 })
    expect(all.entries.some((e) => e.rule === 'identity-pass' && e.allow)).toBe(true)
    expect(all.entries.some((e) => e.rule === 'identity-tool-denied' && !e.allow)).toBe(true)
  })
})
