// 委托范围（残余项①）守门：结构化 toolAllowlist 并集、撤销/过期回退、空委托不越权。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _useStoreDirForTests,
  delegate,
  activeDelegationToolAllowlist,
  getIdentity,
  registerIdentity,
  revokeDelegation,
} from '../agent-identity'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'delegation-scope-'))
  _useStoreDirForTests(dir)
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.AGENT_IDENTITY_STORE
})

function seed(suffix = '1') {
  const agent = registerIdentity({ name: `agent-a-${suffix}`, kind: 'agent', owner: 'ops', toolAllowlist: ['read_file'] }, 't') as { ok: true; identity: { id: string } }
  const target = registerIdentity({ name: `agent-b-${suffix}`, kind: 'agent', owner: 'ops' }, 't') as { ok: true; identity: { id: string } }
  return { agentId: agent.identity.id, targetId: target.identity.id }
}

describe('activeDelegationToolAllowlist（并集；执法时与身份 allowlist 同时校验）', () => {
  it('有结构化委托时取并集；无工具委托时回退身份白名单', () => {
    const { agentId, targetId } = seed()
    delegate(agentId, { to: targetId, scope: '部署', toolAllowlist: ['kanban_*', 'terminal_exec'] }, 't')
    delegate(agentId, { to: targetId, scope: '只读', toolAllowlist: ['read_file', 'search_*'] }, 't')
    const identity = getIdentity(agentId)!
    expect(activeDelegationToolAllowlist(identity).sort()).toEqual(['kanban_*', 'read_file', 'search_*', 'terminal_exec'].sort())

    const { agentId: a2, targetId: t2 } = seed('2')
    delegate(a2, { to: t2, scope: '仅自然语言范围' }, 't')
    expect(activeDelegationToolAllowlist(getIdentity(a2)!)).toEqual([])
  })

  it('撤销/过期委托不计入；无活跃结构化委托时返回空（身份白名单由执法层单独校验）', () => {
    const { agentId, targetId } = seed()
    const d1 = delegate(agentId, { to: targetId, scope: 'x', toolAllowlist: ['terminal_exec'] }, 't')
    delegate(agentId, { to: targetId, scope: 'y', toolAllowlist: ['kanban_*'], expiresAt: Date.now() - 1_000 }, 't')
    expect(activeDelegationToolAllowlist(getIdentity(agentId)!)).toEqual(['terminal_exec'])
    revokeDelegation(agentId, (d1 as { ok: true; delegation: { id: string } }).delegation.id, 't')
    // 另一条已过期 → 无活跃结构化委托 → 空集；执法层仍会校验身份自身 allowlist
    expect(activeDelegationToolAllowlist(getIdentity(agentId)!)).toEqual([])
  })

  it('非法 toolAllowlist 拒绝委托', () => {
    const { agentId, targetId } = seed()
    expect(delegate(agentId, { to: targetId, scope: 'x', toolAllowlist: [''] }, 't')).toMatchObject({ ok: false })
    expect(delegate(agentId, { to: targetId, scope: 'x', toolAllowlist: ['read_file'] }, 't').ok).toBe(true)
  })
})
