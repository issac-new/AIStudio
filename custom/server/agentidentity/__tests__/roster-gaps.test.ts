import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _useStoreDirForTests, getIdentity, listRosterGaps, registerIdentity, rosterGaps, rosterStatus,
  updateIdentity,
} from '../agent-identity'

const FULL = {
  name: 'worker-coder',
  owner: 'alice',
  toolAllowlist: ['read_file', 'write_file'],
  capabilityBoundary: { can: ['按规格改代码'], cannot: ['改发布配置'] },
  auditRequirement: { sampling: 0.1, retentionDays: 30 },
}

describe('rosterGaps：户口五要素', () => {
  it('五要素齐备时无缺项、状态 complete', () => {
    expect(rosterGaps({ name: 'a', owner: 'b', toolAllowlist: ['x'], capabilityBoundary: FULL.capabilityBoundary, auditRequirement: FULL.auditRequirement })).toEqual([])
    expect(rosterStatus({ name: 'a', owner: 'b', toolAllowlist: ['x'], capabilityBoundary: FULL.capabilityBoundary, auditRequirement: FULL.auditRequirement })).toBe('complete')
  })

  it('缺能力边界（can）单独命中', () => {
    const gaps = rosterGaps({
      name: 'a', owner: 'b', toolAllowlist: ['x'],
      capabilityBoundary: { can: [], cannot: ['不碰发布'] },
      auditRequirement: FULL.auditRequirement,
    })
    expect(gaps.map((g) => g.field)).toEqual(['capability-boundary-can'])
  })

  it('缺能力边界（cannot）单独命中——不声明禁区等于默许扩权', () => {
    const gaps = rosterGaps({
      name: 'a', owner: 'b', toolAllowlist: ['x'],
      capabilityBoundary: { can: ['改代码'], cannot: [] },
      auditRequirement: FULL.auditRequirement,
    })
    expect(gaps.map((g) => g.field)).toEqual(['capability-boundary-cannot'])
    expect(gaps[0].detail).toContain('禁区')
  })

  it('缺审计要求（或抽样为 0）命中', () => {
    expect(rosterGaps({ name: 'a', owner: 'b', toolAllowlist: ['x'], capabilityBoundary: FULL.capabilityBoundary }).map((g) => g.field))
      .toEqual(['audit-requirement'])
    expect(rosterGaps({
      name: 'a', owner: 'b', toolAllowlist: ['x'], capabilityBoundary: FULL.capabilityBoundary,
      auditRequirement: { sampling: 0, retentionDays: 30 },
    }).map((g) => g.field)).toEqual(['audit-requirement'])
  })

  it('缺权限范围命中——空白名单是未声明，不等于无限制', () => {
    const gaps = rosterGaps({
      name: 'a', owner: 'b', toolAllowlist: [],
      capabilityBoundary: FULL.capabilityBoundary, auditRequirement: FULL.auditRequirement,
    })
    expect(gaps.map((g) => g.field)).toEqual(['permission-scope'])
    expect(gaps[0].detail).toContain('未声明')
  })

  it('缺负责人与名字都命中', () => {
    const gaps = rosterGaps({ name: '  ', owner: '', toolAllowlist: ['x'], capabilityBoundary: FULL.capabilityBoundary, auditRequirement: FULL.auditRequirement })
    expect(gaps.map((g) => g.field).sort()).toEqual(['name', 'owner'])
  })

  it('存量身份（无新字段）不抛异常，缺两项', () => {
    const gaps = rosterGaps({ name: 'old', owner: 'x', toolAllowlist: ['y'] })
    expect(gaps.map((g) => g.field)).toEqual(['capability-boundary-can', 'capability-boundary-cannot', 'audit-requirement'])
  })

  it('空白条目不计入（防止用空字符串凑数）', () => {
    const gaps = rosterGaps({
      name: 'a', owner: 'b', toolAllowlist: ['x'],
      capabilityBoundary: { can: ['  '], cannot: [''] },
      auditRequirement: { sampling: 0.2, retentionDays: 1 },
    })
    expect(gaps.map((g) => g.field)).toEqual(['capability-boundary-can', 'capability-boundary-cannot'])
  })
})

describe('注册链路：新字段可写可读，且缺口不影响注册', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentidentity-'))
    _useStoreDirForTests(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.AGENT_IDENTITY_STORE
  })

  it('带五要素注册后 rosterGaps 为空', () => {
    const r = registerIdentity(FULL, 'tester')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(rosterGaps(r.identity)).toEqual([])
  })

  it('存量式注册（只有三要素）仍成功——不 fail-closed 制造迁移悬崖', () => {
    const r = registerIdentity({ name: 'legacy', kind: 'agent', owner: 'alice', toolAllowlist: ['x'] }, 'tester')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(rosterStatus(r.identity)).toBe('blocked')
  })

  it('update 可补齐能力边界与审计要求', () => {
    const r = registerIdentity({ name: 'legacy2', kind: 'agent', owner: 'alice', toolAllowlist: ['x'] }, 'tester')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const u = updateIdentity(r.identity.id, {
      capabilityBoundary: { can: ['改代码'], cannot: ['发布'] },
      auditRequirement: { sampling: 0.2, retentionDays: 7 },
    }, 'tester')
    expect(u.ok).toBe(true)
    expect(rosterStatus(getIdentity(r.identity.id)!)).toBe('complete')
  })

  it('listRosterGaps 汇总 blocked 计数', () => {
    registerIdentity(FULL, 'tester')
    registerIdentity({ name: 'l3', kind: 'agent', owner: 'bob', toolAllowlist: [] }, 'tester')
    const r = listRosterGaps()
    expect(r.total).toBe(2)
    expect(r.blocked).toBe(1)
  })

  it('抽样比例越界被夹取到 0..1', () => {
    const r = registerIdentity({ ...FULL, name: 'clamp', auditRequirement: { sampling: 3, retentionDays: 5 } }, 'tester')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.identity.auditRequirement?.sampling).toBe(1)
  })
})
