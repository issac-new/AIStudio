/** skill-acl 纯函数测试（2026-11-19 技能四层授权批）。 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  _resetSkillAclCacheForTests,
  evaluateSkillAcl,
  matchSkill,
} from '../skill-acl'

let dir: string
let aclPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'skill-acl-'))
  aclPath = join(dir, 'skill-acl.json')
  process.env.SKILLGOV_ACL_PATH = aclPath
  _resetSkillAclCacheForTests()
})

afterEach(() => {
  delete process.env.SKILLGOV_ACL_PATH
  _resetSkillAclCacheForTests()
})

function writePolicy(policy: unknown): void {
  writeFileSync(aclPath, JSON.stringify(policy), 'utf8')
  _resetSkillAclCacheForTests()
}

describe('matchSkill', () => {
  it('精确名、通配与大小写', () => {
    expect(matchSkill('github', 'github')).toBe(true)
    expect(matchSkill('GitHub', 'github')).toBe(true)
    expect(matchSkill('github-*', 'github-pr-review')).toBe(true)
    expect(matchSkill('*-review', 'pr-review')).toBe(true)
    expect(matchSkill('*', 'anything')).toBe(true)
    expect(matchSkill('github-*', 'gitlab-pr')).toBe(false)
    expect(matchSkill('', 'x')).toBe(false)
  })
})

describe('evaluateSkillAcl', () => {
  it('未配置策略文件：保持现状放行', () => {
    const d = evaluateSkillAcl({ skill: 'anything', action: 'invoke', context: { profileId: 'p' } })
    expect(d.allowed).toBe(true)
    expect(d.source).toBe('none')
  })

  it('profile allow 清单：列内放行、列外拒绝', () => {
    writePolicy({
      version: 1,
      profiles: { worker: { invoke: { allow: ['github-*', 'docs'] } } },
    })
    expect(evaluateSkillAcl({ skill: 'github-pr', action: 'invoke', context: { profileId: 'worker' } }).allowed).toBe(true)
    expect(evaluateSkillAcl({ skill: 'docs', action: 'invoke', context: { profileId: 'worker' } }).allowed).toBe(true)
    const denied = evaluateSkillAcl({ skill: 'prod-deploy', action: 'invoke', context: { profileId: 'worker' } })
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toContain('未包含')
  })

  it('deny 优先且跨 principal 生效', () => {
    writePolicy({
      version: 1,
      profiles: { worker: { invoke: { allow: ['*'] } } },
      users: { u1: { invoke: { deny: ['prod-*'] } } },
    })
    const d = evaluateSkillAcl({ skill: 'prod-deploy', action: 'invoke', context: { profileId: 'worker', userId: 'u1' } })
    expect(d.allowed).toBe(false)
    expect(d.source).toBe('user')
    expect(d.reason).toContain('prod-*')
  })

  it('用户 allow + profile 无规则：用户规则生效', () => {
    writePolicy({ version: 1, users: { u1: { invoke: { allow: ['docs'] } } } })
    expect(evaluateSkillAcl({ skill: 'docs', action: 'invoke', context: { userId: 'u1' } }).allowed).toBe(true)
    expect(evaluateSkillAcl({ skill: 'other', action: 'invoke', context: { userId: 'u1' } }).allowed).toBe(false)
  })

  it('显式空 allow 列表按关闭式清单拒绝', () => {
    writePolicy({ version: 1, profiles: { worker: { invoke: { allow: [] } } } })
    const d = evaluateSkillAcl({ skill: 'docs', action: 'invoke', context: { profileId: 'worker' } })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('allow 列表为空')
  })

  it('未命中 principal 时按 default 判定；default=deny 全局关闭', () => {
    writePolicy({ version: 1, default: 'deny', users: { u1: { invoke: { allow: ['docs'] } } } })
    expect(evaluateSkillAcl({ skill: 'docs', action: 'invoke', context: { userId: 'u1' } }).allowed).toBe(true)
    const d = evaluateSkillAcl({ skill: 'docs', action: 'invoke', context: { userId: 'u2' } })
    expect(d.allowed).toBe(false)
    expect(d.source).toBe('default')
  })

  it('install/invoke/edit 三层互不串用', () => {
    writePolicy({
      version: 1,
      profiles: { worker: { invoke: { allow: ['docs'] }, edit: { deny: ['docs'] } } },
    })
    expect(evaluateSkillAcl({ skill: 'docs', action: 'invoke', context: { profileId: 'worker' } }).allowed).toBe(true)
    const edit = evaluateSkillAcl({ skill: 'docs', action: 'edit', context: { profileId: 'worker' } })
    expect(edit.allowed).toBe(false)
    expect(edit.source).toBe('profile')
  })

  it('策略文件解析失败：fail-closed', () => {
    writeFileSync(aclPath, '{not json', 'utf8')
    _resetSkillAclCacheForTests()
    const d = evaluateSkillAcl({ skill: 'docs', action: 'invoke', context: { profileId: 'worker' } })
    expect(d.allowed).toBe(false)
    expect(d.source).toBe('acl_invalid')
  })

  it('空技能名拒绝', () => {
    const d = evaluateSkillAcl({ skill: '  ', action: 'invoke' })
    expect(d.allowed).toBe(false)
  })
})
