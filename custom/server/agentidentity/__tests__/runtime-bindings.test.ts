// 运行时绑定（数字员工批一 Task 1）：身份可登记它绑定的派单目标；一个目标只能被一个身份绑定，
// 否则派单门按目标反查身份时无法确定信谁。夹具：_useStoreDirForTests 指向 mkdtemp；afterEach 清 env。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _useStoreDirForTests, getIdentity, listIdentities, normalizeRuntimeBindings, registerIdentity, updateIdentity,
} from '../agent-identity'

/** 五要素齐备夹具（沿用 roster-gaps.test.ts）；kind 是 registerIdentity 的必填入参。 */
const FULL = {
  name: 'worker-coder',
  kind: 'agent' as const,
  owner: 'alice',
  toolAllowlist: ['read_file', 'write_file'],
  capabilityBoundary: { can: ['按规格改代码'], cannot: ['改发布配置'] },
  auditRequirement: { sampling: 0.1, retentionDays: 30 },
}

describe('normalizeRuntimeBindings：纯函数', () => {
  it('runtimeBindings 规范化：去空白、去重、空数组剔除', () => {
    expect(normalizeRuntimeBindings({ agents: [' zcode ', 'zcode', ''], matrixAccounts: ['@a-agent:sv'] }))
      .toEqual({ ok: true, bindings: { agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] } })
  })

  it('runtimeBindings 非对象或数组元素非字符串 → 拒绝', () => {
    expect(normalizeRuntimeBindings('x').ok).toBe(false)
    expect(normalizeRuntimeBindings({ agents: [1] }).ok).toBe(false)
  })

  it('null、数组、字段不是数组 → 同样拒绝，并点名出错的字段', () => {
    expect(normalizeRuntimeBindings(null).ok).toBe(false)
    expect(normalizeRuntimeBindings(['zcode']).ok).toBe(false)
    const bad = normalizeRuntimeBindings({ agents: ['zcode'], matrixAccounts: '@a-agent:sv' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems.join()).toContain('matrixAccounts')
  })

  it('未知键（如拼错的 agent）→ 拒绝并点名，不静默忽略', () => {
    const bad = normalizeRuntimeBindings({ agent: ['zcode'] })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems.join()).toContain('agent')
  })

  it('空数组或全空白不保留；两个数组都空 → 空绑定（调用方据此剔除该键）', () => {
    expect(normalizeRuntimeBindings({ agents: ['zcode'], matrixAccounts: [] }))
      .toEqual({ ok: true, bindings: { agents: ['zcode'] } })
    expect(normalizeRuntimeBindings({ agents: ['  '], matrixAccounts: [] })).toEqual({ ok: true, bindings: {} })
  })

  it('未传（undefined）= 未声明，不报错', () => {
    expect(normalizeRuntimeBindings(undefined)).toEqual({ ok: true, bindings: {} })
  })
})

describe('运行时绑定：注册与更新的唯一性', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentidentity-bindings-'))
    _useStoreDirForTests(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.AGENT_IDENTITY_STORE
    delete process.env.AGENT_IDENTITY_NO_EVENTS
  })

  /** 登记一个夹具身份并返回其 id（登记失败即中止用例）。 */
  function registerOk(name: string, runtimeBindings?: { agents?: string[]; matrixAccounts?: string[] }): string {
    const r = registerIdentity({ ...FULL, name, ...(runtimeBindings ? { runtimeBindings } : {}) }, 'alice')
    if (!r.ok) throw new Error(`夹具登记失败：${name}（${r.problems.join('；')}）`)
    return r.identity.id
  }

  it('同一目标被两个身份绑定 → 第二个注册被拒并点名冲突', () => {
    const u1 = registerOk('u1', { agents: ['zcode'] })
    const r = registerIdentity({ ...FULL, name: 'u2', runtimeBindings: { agents: ['zcode'] } }, 'alice')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems).toEqual([`运行时目标已被身份 ${u1}（u1）绑定：zcode`])
    // 被拒的注册不落盘
    expect(listIdentities().map((i) => i.name)).toEqual(['u1'])
  })

  it('update 改绑已被占用的目标 → 拒绝；改绑到自己已占的目标 → 通过（幂等）', () => {
    const u1 = registerOk('u1', { agents: ['zcode'] })
    const u2 = registerOk('u2')
    const taken = updateIdentity(u2, { runtimeBindings: { agents: ['zcode'] } }, 'alice')
    expect(taken.ok).toBe(false)
    if (!taken.ok) expect(taken.problems.join()).toContain('zcode')
    // 被拒的更新不落盘：u2 仍是未绑定
    expect(getIdentity(u2)).not.toHaveProperty('runtimeBindings')
    const own = updateIdentity(u1, { runtimeBindings: { agents: ['zcode'] } }, 'alice')
    expect(own.ok).toBe(true)
    expect(getIdentity(u1)?.runtimeBindings).toEqual({ agents: ['zcode'] })
  })

  it('不传 runtimeBindings 的注册与更新不改变既有行为', () => {
    const r = registerIdentity({ ...FULL, name: 'u3' }, 'alice')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.identity).not.toHaveProperty('runtimeBindings')
    const u = updateIdentity(r.identity.id, { owner: 'bob' }, 'alice')
    expect(u.ok).toBe(true)
    if (u.ok) expect(u.identity).not.toHaveProperty('runtimeBindings')
    expect(getIdentity(r.identity.id)).not.toHaveProperty('runtimeBindings')
  })

  it('注册时的绑定先规范化再落盘', () => {
    const r = registerIdentity({
      ...FULL, name: 'u1', runtimeBindings: { agents: [' zcode ', 'zcode', ''], matrixAccounts: ['@a-agent:sv'] },
    }, 'alice')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.identity.runtimeBindings).toEqual({ agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] })
    expect(getIdentity(r.identity.id)?.runtimeBindings).toEqual({ agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] })
  })

  it('传入空数组时剔除该键：注册不落键；更新即解绑并释放目标', () => {
    const bare = registerIdentity({
      ...FULL, name: 'u1', runtimeBindings: { agents: [], matrixAccounts: ['  '] },
    }, 'alice')
    expect(bare.ok).toBe(true)
    if (!bare.ok) return
    expect(bare.identity).not.toHaveProperty('runtimeBindings')
    const u2 = registerOk('u2', { agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] })
    expect(getIdentity(u2)?.runtimeBindings).toEqual({ agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] })
    const cleared = updateIdentity(u2, { runtimeBindings: { agents: [], matrixAccounts: [] } }, 'alice')
    expect(cleared.ok).toBe(true)
    expect(getIdentity(u2)).not.toHaveProperty('runtimeBindings')
    // 目标已释放，别的身份可以绑定
    expect(registerIdentity({ ...FULL, name: 'u3', runtimeBindings: { agents: ['zcode'] } }, 'alice').ok).toBe(true)
  })

  it('绑定整体替换、不与原值合并；更新不传 runtimeBindings 则保留原绑定', () => {
    const id = registerOk('u1', { agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] })
    const kept = updateIdentity(id, { owner: 'bob' }, 'alice')
    expect(kept.ok).toBe(true)
    expect(getIdentity(id)?.runtimeBindings).toEqual({ agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] })
    const replaced = updateIdentity(id, { runtimeBindings: { matrixAccounts: ['@b-agent:sv'] } }, 'alice')
    expect(replaced.ok).toBe(true)
    expect(getIdentity(id)?.runtimeBindings).toEqual({ matrixAccounts: ['@b-agent:sv'] })
    // agents 已随整体替换清空，zcode 可被其他身份绑定
    expect(registerIdentity({ ...FULL, name: 'u2', runtimeBindings: { agents: ['zcode'] } }, 'alice').ok).toBe(true)
  })

  it('绑定形态非法 → 注册与更新都拒绝，且不落盘', () => {
    const bad = registerIdentity({ ...FULL, name: 'u1', runtimeBindings: { agents: [1] } as never }, 'alice')
    expect(bad.ok).toBe(false)
    expect(listIdentities()).toEqual([])
    const id = registerOk('u1', { agents: ['zcode'] })
    const rejected = updateIdentity(id, { runtimeBindings: { agents: 'zcode' } as never }, 'alice')
    expect(rejected.ok).toBe(false)
    expect(getIdentity(id)?.runtimeBindings).toEqual({ agents: ['zcode'] })
  })

  it('Matrix 账号同样唯一：两个数组任一命中即拒绝', () => {
    const u1 = registerOk('u1', { matrixAccounts: ['@a-agent:sv'] })
    const r = registerIdentity({
      ...FULL, name: 'u2', runtimeBindings: { agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] },
    }, 'alice')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems).toEqual([`运行时目标已被身份 ${u1}（u1）绑定：@a-agent:sv`])
  })
})
