/** skillGuardHook × skill-acl 集成测试（2026-11-19 技能四层授权批）。 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _resetSkillAclCacheForTests } from '../skill-acl'
import { _setLatestForTests } from '../skill-scan'
import {
  _useGuardLedgerForTests,
  readSkillGuardAudit,
  skillGuardHook,
} from '../skill-guard-hook'

let dir: string
let aclPath: string
let auditPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'skill-guard-acl-'))
  aclPath = join(dir, 'skill-acl.json')
  auditPath = join(dir, 'guard.jsonl')
  process.env.SKILLGOV_ACL_PATH = aclPath
  process.env.SKILLGOV_ENFORCE = '1'
  _useGuardLedgerForTests(auditPath)
  _setLatestForTests(null)
  _resetSkillAclCacheForTests()
})

afterEach(() => {
  delete process.env.SKILLGOV_ACL_PATH
  delete process.env.SKILLGOV_ENFORCE
  _setLatestForTests(null)
  _resetSkillAclCacheForTests()
})

function writePolicy(policy: unknown): void {
  writeFileSync(aclPath, JSON.stringify(policy), 'utf8')
  _resetSkillAclCacheForTests()
}

describe('skillGuardHook 调用授权', () => {
  const hook = skillGuardHook()

  it('ACL 拒绝 skill_view：allow:false，审计带调用者身份', async () => {
    writePolicy({ version: 1, profiles: { worker: { invoke: { allow: ['docs'] } } } })
    const pre = await hook.preExecute('skill_view', { name: 'prod-deploy' }, {
      userId: 'u1', profileId: 'worker', sessionId: 's1', runId: 'r1',
    })
    expect(pre).toEqual({ allow: false, error: expect.stringContaining('prod-deploy') })
    const entry = readSkillGuardAudit().find((e) => e.action === 'block' && e.skill === 'prod-deploy')
    expect(entry?.userId).toBe('u1')
    expect(entry?.profileId).toBe('worker')
    expect(entry?.sessionId).toBe('s1')
    expect(entry?.runId).toBe('r1')
    expect(entry?.detail).toContain('acl:')
  })

  it('ACL 允许：放行', async () => {
    writePolicy({ version: 1, profiles: { worker: { invoke: { allow: ['docs'] } } } })
    expect(await hook.preExecute('skill_view', { name: 'docs' }, { profileId: 'worker' })).toBeUndefined()
  })

  it('skill_manage 用 edit 规则，不与 invoke 串用', async () => {
    writePolicy({
      version: 1,
      profiles: {
        worker: {
          invoke: { allow: ['docs'] },
          edit: { allow: ['github-*'] },
        },
      },
    })
    expect(await hook.preExecute('skill_view', { name: 'docs' }, { profileId: 'worker' })).toBeUndefined()
    const blocked = await hook.preExecute('skill_manage', { name: 'docs' }, { profileId: 'worker' })
    expect(blocked).toEqual({ allow: false, error: expect.stringContaining('docs') })
    expect(await hook.preExecute('skill_manage', { name: 'github-pr' }, { profileId: 'worker' })).toBeUndefined()
  })

  it('enforce 关：ACL 不生效（零行为变化）', async () => {
    writePolicy({ version: 1, profiles: { worker: { invoke: { allow: [] } } } })
    delete process.env.SKILLGOV_ENFORCE
    expect(await hook.preExecute('skill_view', { name: 'prod-deploy' }, { profileId: 'worker' })).toBeUndefined()
  })

  it('未配置 ACL 文件：保持现状放行', async () => {
    expect(await hook.preExecute('skill_view', { name: 'anything' }, { profileId: 'worker' })).toBeUndefined()
  })

  it('postExecute 审计记录身份，不改内容语义', async () => {
    const post = await hook.postExecute('skill_view', { name: 'docs' }, { ok: true, content: '干净内容' }, {
      userId: 'u1', profileId: 'worker',
    })
    expect(post).toBeUndefined()
    const entry = readSkillGuardAudit().find((e) => e.action === 'viewed' && e.skill === 'docs')
    expect(entry?.userId).toBe('u1')
    expect(entry?.profileId).toBe('worker')
  })
})
