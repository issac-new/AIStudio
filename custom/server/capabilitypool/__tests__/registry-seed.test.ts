import { describe, expect, it } from 'vitest'

// @ts-expect-error .mjs 维护脚本无类型声明；运行由 vitest/esbuild 处理
import { buildRegistrySeed } from '../../../../scripts/maintenance/capability-registry-seed.mjs'

const input = {
  profilesYaml: `
profiles:
  worker-coder:
    skills_enabled: [software-development]
    skills_pinned: [skill-recall]
  worker-tester:
    skills_enabled: [testing]
  unknown-profile:
    skills_enabled: []
`,
  graphYaml: `
nodes:
  agents:
    - name: worker-coder
      capabilities: [coding, code-review]
    - name: aiteam-scout
      capabilities: [osint]
    - name: unknown-profile
      capabilities: []
`,
  roleMatrixYaml: `
profile_roles:
  worker-coder: coder
  worker-tester: tester
  aiteam-scout: researcher
`,
  skillProvisioningJson: JSON.stringify({
    version: 1,
    roles: [{ match: 'worker-coder', skills: ['manifest-skill'] }],
  }),
}

describe('buildRegistrySeed', () => {
  it('按证据生成行：能力图标签优先、未声明写 unknown、角色映射四维', () => {
    const seed = buildRegistrySeed(input)
    const byName = new Map(seed.rows.map((row) => [row.assignee, row]))

    expect(byName.get('worker-coder')).toMatchObject({
      roleTemplate: 'dev',
      deliverableKinds: 'code,test-report',
      vcsScope: 'own-branch-only',
      integrationAuthority: 'none',
      capabilities: 'coding,code-review',
      skills: 'manifest-skill',
    })
    expect(byName.get('worker-tester')).toMatchObject({
      roleTemplate: 'tester',
      capabilities: 'unknown',
      skills: 'testing',
    })
    expect(byName.get('aiteam-scout')).toMatchObject({
      roleTemplate: 'analyst',
      capabilities: 'osint',
      skills: 'unknown',
    })
    expect(byName.get('unknown-profile')).toMatchObject({
      roleTemplate: 'generic',
      capabilities: 'unknown',
      skills: 'unknown',
    })
    expect(seed.stats).toEqual({
      profiles: 4,
      capabilitiesDeclared: 2,
      capabilitiesUnknown: 2,
      roleMapped: 3,
    })
    expect(seed.markdown).toContain('| worker-coder | dev | code,test-report |')
    expect(seed.markdown).toContain('| unknown-profile | generic |')
  })

  it('重复生成确定性一致（幂等）', () => {
    const a = buildRegistrySeed(input)
    const b = buildRegistrySeed(input)
    expect(a.markdown).toBe(b.markdown)
    expect(a.rows).toEqual(b.rows)
  })
})
