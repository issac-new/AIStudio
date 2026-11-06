// hrgov-seed 种子纪律守门（spec 2026-11-06-workunit-responsibility-ledger.md §7 验证段）：
// 首次运行建单元草案 + people 候选（inactive）；二次运行零新建（幂等）；
// 已存在同名身份不覆盖；--dry-run 不写盘。owner 只认 owner-registry 的 owner 行命中。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { derivePeople, deriveUnits, seed } from '../maintenance/hrgov-seed.mjs'

let tmp: string
let root: string

function git(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync('git', ['-C', root, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败：${r.stderr}`)
  return r
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hrgov-seed-'))
  root = join(tmp, 'repo')
  // team 夹具：两个 profile（a 引号描述、b 裸描述）＋ owner-registry 只命中 a
  mkdirSync(join(root, 'team/profiles/a'), { recursive: true })
  mkdirSync(join(root, 'team/profiles/b'), { recursive: true })
  mkdirSync(join(root, 'team/shared'), { recursive: true })
  writeFileSync(join(root, 'team/profiles/a/profile.yaml'), 'description: "甲单元：负责 A 域"\ndescription_auto: false\n')
  writeFileSync(join(root, 'team/profiles/b/profile.yaml'), 'description: 乙单元：负责 B 域\ndescription_auto: false\n')
  writeFileSync(
    join(root, 'team/shared/owner-registry.yaml'),
    ['version: 1', 'registry:', '- profile: a', '  owner: Alice', '  owns:', '  - module: 模块甲', '    scope: 范围', '  backup: []', ''].join('\n'),
  )
  // git 作者面：临时仓两次提交、两个作者（Alice/Bob）；committer 固定为 Seeder
  git(['init', '-q'])
  git(['config', 'user.name', 'Seeder'])
  git(['config', 'user.email', 'seed@local'])
  git(['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(root, 'README.md'), '1\n')
  git(['add', '.'])
  git(['commit', '-qm', 'c1'], { GIT_AUTHOR_NAME: 'Alice', GIT_AUTHOR_EMAIL: 'alice@example.com' })
  writeFileSync(join(root, 'README.md'), '2\n')
  git(['add', '.'])
  git(['commit', '-qm', 'c2'], { GIT_AUTHOR_NAME: 'Bob', GIT_AUTHOR_EMAIL: 'bob@example.com' })
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('derivePeople：git 作者行 → people 候选', () => {
  it('按邮箱去重（小写归一、先见先得），解析不了的行跳过', () => {
    const rows = derivePeople([
      'Alice <Alice@Example.com>',
      'Alice <alice@example.com>', // 同邮箱重复 → 只留一条
      'Bob <bob@example.com>',
      'no-email-line', // 解析不了 → 跳过不猜
      '',
    ])
    expect(rows).toEqual([
      { name: 'Alice', emails: ['alice@example.com'], source: 'git' },
      { name: 'Bob', emails: ['bob@example.com'], source: 'git' },
    ])
  })
})

describe('deriveUnits：owner 只认 owner 行命中', () => {
  it('命中给 owner 名，未命中 unassigned；草案均为 agent + registered', () => {
    const units = deriveUnits([{ name: 'a' }, { name: 'b' }], { a: 'Alice' }, [])
    expect(units.map((u) => [u.name, u.owner])).toEqual([
      ['a', 'Alice'],
      ['b', 'unassigned'],
    ])
    expect(units.every((u) => u.kind === 'agent' && u.lifecycle?.stage === 'registered')).toBe(true)
  })

  it('同名身份已存在 → 跳过不建', () => {
    expect(deriveUnits([{ name: 'a' }], { a: 'Alice' }, [{ name: 'a' }])).toEqual([])
  })
})

describe('seed：首次 / 幂等 / 不覆盖 / dry-run', () => {
  it('首次：建 2 单元草案 + 2 people 候选（inactive、source=git、owner 按注册表命中）', () => {
    const store = join(tmp, 'store')
    const r = seed({ root, storeDir: store })
    expect(r).toEqual({ peopleCreated: 2, peopleSkipped: 0, unitsCreated: 2, unitsSkipped: 0, dryRun: false })

    const people = JSON.parse(readFileSync(join(store, 'people.json'), 'utf8'))
    expect(people.people.map((p: any) => p.name).sort()).toEqual(['Alice', 'Bob'])
    expect(people.people.every((p: any) => p.active === false && p.source === 'git' && /^p-\d+$/.test(p.id))).toBe(true)
    expect(people.nextSeq).toBe(3)

    const ids = JSON.parse(readFileSync(join(store, 'identities.json'), 'utf8'))
    expect(ids.identities.map((i: any) => i.name).sort()).toEqual(['a', 'b'])
    const a = ids.identities.find((i: any) => i.name === 'a')
    const b = ids.identities.find((i: any) => i.name === 'b')
    expect(a.owner).toBe('Alice')
    expect(b.owner).toBe('unassigned') // 未命中注册表 → 不猜，显式无主
    expect(a.kind).toBe('agent')
    expect(a.lifecycle).toEqual({ stage: 'registered', history: [] })
    expect(ids.nextSeq).toBe(3)
    expect(ids.nextDelegationSeq).toBe(1)
  })

  it('二次：零新建（幂等），既有文件一字不改', () => {
    const store = join(tmp, 'store')
    const beforePeople = readFileSync(join(store, 'people.json'), 'utf8')
    const beforeIds = readFileSync(join(store, 'identities.json'), 'utf8')
    const r = seed({ root, storeDir: store })
    expect(r).toEqual({ peopleCreated: 0, peopleSkipped: 2, unitsCreated: 0, unitsSkipped: 2, dryRun: false })
    expect(readFileSync(join(store, 'people.json'), 'utf8')).toBe(beforePeople)
    expect(readFileSync(join(store, 'identities.json'), 'utf8')).toBe(beforeIds)
  })

  it('已存在同名身份不覆盖：a 已在册 → 只建 b，a 的 owner/kind/白名单原样', () => {
    const store = join(tmp, 'store-existing')
    mkdirSync(store, { recursive: true })
    writeFileSync(
      join(store, 'identities.json'),
      JSON.stringify({
        identities: [
          {
            id: 'aid-042',
            name: 'a',
            kind: 'human',
            owner: '张三',
            toolAllowlist: ['keep-me'],
            credentials: [],
            delegations: [],
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        nextSeq: 43,
        nextDelegationSeq: 1,
      }),
    )
    const r = seed({ root, storeDir: store })
    expect(r.unitsCreated).toBe(1)
    expect(r.unitsSkipped).toBe(1)

    const ids = JSON.parse(readFileSync(join(store, 'identities.json'), 'utf8'))
    const a = ids.identities.find((i: any) => i.name === 'a')
    expect(a.owner).toBe('张三')
    expect(a.kind).toBe('human')
    expect(a.toolAllowlist).toEqual(['keep-me'])
    const b = ids.identities.find((i: any) => i.name === 'b')
    expect(b.id).toBe('aid-043') // 序号接续既有 nextSeq
    expect(b.owner).toBe('unassigned')
    expect(ids.nextSeq).toBe(44)
  })

  it('--dry-run：只打印不写盘（存储目录不创建）', () => {
    const store = join(tmp, 'store-dry')
    const r = seed({ root, storeDir: store, dryRun: true })
    expect(r.dryRun).toBe(true)
    expect(r.peopleCreated).toBe(2)
    expect(r.unitsCreated).toBe(2)
    expect(existsSync(store)).toBe(false)
  })
})
