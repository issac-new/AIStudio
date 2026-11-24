import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _usePeopleStoreForTests, activatePerson, getPerson, listPeople, upsertPerson } from '../people'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'people-')); _usePeopleStoreForTests(dir) })
afterEach(() => { _usePeopleStoreForTests(null); rmSync(dir, { recursive: true, force: true }) })

describe('people registry', () => {
  it('登记后默认 inactive，激活后可读', () => {
    const r = upsertPerson({ name: 'plusprimer', emails: ['plusprimer@me.com'], source: 'git' }, 'test')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.person.active).toBe(false)
    const a = activatePerson(r.person.id, 'test')
    expect(a.ok).toBe(true)
    expect(getPerson(r.person.id)?.active).toBe(true)
  })

  it('同邮箱幂等，不重复建人', () => {
    const a = upsertPerson({ name: 'A', emails: ['x@y.z'], source: 'git' }, 't')
    const b = upsertPerson({ name: 'A2', emails: ['x@y.z'], source: 'git' }, 't')
    expect(a.ok && b.ok).toBe(true)
    expect(listPeople()).toHaveLength(1)
  })

  it('显式 id 未命中但邮箱已属他人 → 拒绝合并且不改写原人（2026-11-25 批一审查修复）', () => {
    // 登录名=自然人 id 是署名前提：显式 id 被静默吞掉、返回并改写别人，直接破坏该环路。
    const a = upsertPerson({ name: '甲', emails: ['a@x'], source: 'manual' }, 't')
    expect(a.ok).toBe(true)
    if (!a.ok || !a.person) return
    const originalId = a.person.id
    const r = upsertPerson({ id: 'admin', name: '管理员', emails: ['a@x'] }, 't')
    expect(r.ok).toBe(false)
    expect(r.problems.join()).toMatch(/不能合并|他人/)
    // 原人未被改写，也未新建人
    expect(getPerson(originalId)?.name).toBe('甲')
    expect(getPerson('admin')).toBeNull()
    expect(listPeople()).toHaveLength(1)
    // 显式 id 命中本人时维持原行为（幂等更新，不受新闸影响）
    const again = upsertPerson({ id: originalId, name: '甲某', emails: ['a@x'] }, 't')
    expect(again.ok).toBe(true)
    expect(getPerson(originalId)?.name).toBe('甲某')
    // 未传 id 走邮箱命中也维持原行为
    const byEmail = upsertPerson({ name: '甲又', emails: ['a@x'] }, 't')
    expect(byEmail.ok).toBe(true)
    expect(byEmail.person?.id).toBe(originalId)
  })

  it('空名字拒绝', () => {
    expect(upsertPerson({ name: '  ', emails: [], source: 'manual' }, 't').ok).toBe(false)
  })

  it('mxids 剔除空白并去重，全形与裸 localpart 都按显式值保存', () => {
    const r = upsertPerson({
      name: 'Alice',
      emails: ['alice@example.com'],
      mxids: [' @alice:example.org ', 'alice', '@alice:example.org', '', '   ', 'alice'],
      source: 'manual',
    }, 't')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 不从 email 推断 mxid，也不把裸 localpart 补成某个服务器的全形。
    expect(r.person.mxids).toEqual(['@alice:example.org', 'alice'])
    expect(getPerson(r.person.id)?.mxids).toEqual(['@alice:example.org', 'alice'])
  })

  it('mxids 畸形值拒绝，且不写入半规范化名册', () => {
    const r = upsertPerson({
      name: 'Alice', emails: [], mxids: ['@alice:example.org', '@missing-server'], source: 'manual',
    }, 't')
    expect(r.ok).toBe(false)
    expect(r.problems.join('\n')).toContain('@missing-server')
    expect(listPeople()).toEqual([])
  })
})
