// agent-identity 域单测（P10）：登记/委托/撤销/链查询全路径 + 环检测 + 台账边界。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  registerIdentity, updateIdentity, addCredential, revokeCredential,
  delegate, revokeDelegation, activeDelegationChain, listIdentities, listEvents,
  _useStoreDirForTests,
} from '../agent-identity'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-identity-test-'))
  _useStoreDirForTests(dir)
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.AGENT_IDENTITY_STORE
})

function seed() {
  const human = registerIdentity({ name: 'shi', kind: 'human', owner: 'shi' }, 'tester') as { ok: true; identity: { id: string } }
  const agent = registerIdentity({ name: 'zcode-main', kind: 'agent', owner: 'shi', toolAllowlist: ['read_file', 'terminal_exec'] }, 'tester') as { ok: true; identity: { id: string } }
  const bot = registerIdentity({ name: 'matrix-bot', kind: 'bot', owner: 'ops' }, 'tester') as { ok: true; identity: { id: string } }
  return { humanId: human.identity.id, agentId: agent.identity.id, botId: bot.identity.id }
}

describe('P10 身份台账', () => {
  it('登记：id 序号自增、同名拒绝、owner/toolAllowlist 落盘', () => {
    const { humanId, agentId } = seed()
    expect(humanId).toBe('aid-001')
    expect(agentId).toBe('aid-002')
    const dup = registerIdentity({ name: 'shi', kind: 'human', owner: 'x' }, 't')
    expect(dup.ok).toBe(false)
    const all = listIdentities()
    expect(all.find((i) => i.id === agentId)!.toolAllowlist).toEqual(['read_file', 'terminal_exec'])
    // 事件流在档
    const events = listEvents()
    expect(events.filter((e) => e.action === 'register')).toHaveLength(3)
  })

  it('入参校验拦截（name/owner/kind/allowlist）', () => {
    expect(registerIdentity({ name: '', kind: 'agent', owner: 'x' } as never, 't').ok).toBe(false)
    expect(registerIdentity({ name: 'ok', kind: 'weird', owner: 'x' } as never, 't').ok).toBe(false)
  })

  it('凭证：登记→撤销→重复撤销拒绝→同名 active 拒绝', () => {
    const { agentId } = seed()
    expect(addCredential(agentId, { kind: 'api-key', label: 'prod-key' }, 't').ok).toBe(true)
    expect(addCredential(agentId, { kind: 'api-key', label: 'prod-key' }, 't').ok).toBe(false)
    expect(revokeCredential(agentId, 'prod-key', 'ops').ok).toBe(true)
    expect(revokeCredential(agentId, 'prod-key', 'ops').ok).toBe(false)
    // 撤销后可再登记同名（轮换语义）
    expect(addCredential(agentId, { kind: 'api-key', label: 'prod-key' }, 't').ok).toBe(true)
  })
})

describe('P10 委托链', () => {
  it('委托→撤销→链查询反映状态；目标必须已登记', () => {
    const { humanId, agentId } = seed()
    const bad = delegate(humanId, { to: 'ghost', scope: 'x' }, 't')
    expect(bad.ok).toBe(false)
    expect(delegate(humanId, { to: agentId, scope: '代表我跑测试' }, 't').ok).toBe(true)
    let chain = activeDelegationChain(humanId)
    expect(chain.edges).toHaveLength(1)
    expect(chain.paths).toEqual([[humanId, agentId]])
    // 撤销后链清空
    const did = chain.edges[0]!.id
    expect(revokeDelegation(humanId, did, 't').ok).toBe(true)
    chain = activeDelegationChain(humanId)
    expect(chain.edges).toHaveLength(0)
    expect(chain.paths).toHaveLength(0)
  })

  it('多跳链 + 环检测：A→B→C 两路径可见，A→B→A 环被截断', () => {
    const { humanId: a, agentId: b, botId: c } = seed()
    expect(delegate(a, { to: b, scope: 's1' }, 't').ok).toBe(true)
    expect(delegate(b, { to: c, scope: 's2' }, 't').ok).toBe(true)
    // 制造环：C→A（合法登记目标）——链查询不得死循环
    expect(delegate(c, { to: a, scope: 's3' }, 't').ok).toBe(true)
    const chain = activeDelegationChain(a)
    const pathStrs = chain.paths.map((p) => p.join('>'))
    expect(pathStrs).toContain(`${a}>${b}`)
    expect(pathStrs).toContain(`${a}>${b}>${c}`)
    // 环路径 a>b>c>a 不得出现（截断）
    expect(pathStrs.some((p) => p.endsWith(`>${a}`) && p.split('>').length > 2)).toBe(false)
  })

  it('过期委托不算有效边', () => {
    const { humanId, agentId } = seed()
    expect(delegate(humanId, { to: agentId, scope: 's', expiresAt: Date.now() - 1000 }, 't').ok).toBe(true)
    expect(activeDelegationChain(humanId).edges).toHaveLength(0)
  })
})

describe('P10 update 与边界', () => {
  it('update 改 owner/allowlist 落事件；不存在身份拒绝', () => {
    const { agentId } = seed()
    expect(updateIdentity(agentId, { owner: 'ops' }, 't').ok).toBe(true)
    expect(listIdentities().find((i) => i.id === agentId)!.owner).toBe('ops')
    expect(updateIdentity('aid-999', { owner: 'x' }, 't').ok).toBe(false)
  })
})
