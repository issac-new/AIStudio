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

  it('空名字拒绝', () => {
    expect(upsertPerson({ name: '  ', emails: [], source: 'manual' }, 't').ok).toBe(false)
  })
})
