// 角色工具矩阵守门（2026-11-05 AI Native D1）：30/30 profile 全覆盖、角色全定义、
// deny 面与默认策略包不冲突。矩阵是治理正本（谁来审计谁能用什么），执法在 toolpolicy。
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const MATRIX = resolve(ROOT, 'team/shared/role-tool-matrix.yaml')

function parseYamlSections(text: string): { roles: Set<string>; profileRoles: Map<string, string> } {
  const roles = new Set<string>()
  const profileRoles = new Map<string, string>()
  let section = ''
  for (const line of text.split('\n')) {
    if (/^roles:/.test(line)) { section = 'roles'; continue }
    if (/^profile_roles:/.test(line)) { section = 'profiles'; continue }
    if (/^#|^$/.test(line)) continue
    const roleDef = /^  ([a-z-]+):$/.exec(line)
    if (section === 'roles' && roleDef) { roles.add(roleDef[1]); continue }
    const mapping = /^  ([A-Za-z0-9_-]+): ([a-z-]+)$/.exec(line)
    if (section === 'profiles' && mapping) profileRoles.set(mapping[1], mapping[2])
  }
  return { roles, profileRoles }
}

describe('角色工具矩阵（D1 治理正本）', () => {
  const text = existsSync(MATRIX) ? readFileSync(MATRIX, 'utf8') : ''
  const { roles, profileRoles } = parseYamlSections(text)

  it('矩阵文件在位且非空', () => {
    expect(existsSync(MATRIX), 'team/shared/role-tool-matrix.yaml 缺席').toBe(true)
    expect(text.length).toBeGreaterThan(0)
  })

  it('30/30 profile 全覆盖（新 profile 必须显式归角色）', () => {
    const dirs = readdirSync(resolve(ROOT, 'team/profiles'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
    expect(dirs.length).toBeGreaterThan(0)
    const unassigned = dirs.filter((d) => !profileRoles.has(d))
    expect(unassigned, `以下 profile 未归角色（矩阵 profile_roles 补条目）：\n${unassigned.join('\n')}`).toEqual([])
  })

  it('映射只指向已定义角色', () => {
    const bad = [...profileRoles.entries()].filter(([, role]) => !roles.has(role))
    expect(bad, `指向未定义角色：${bad.map(([p, r]) => `${p}→${r}`).join('、')}`).toEqual([])
  })

  it('八角色齐备（coder/tester/researcher/orchestrator/ops/data/security/product）', () => {
    for (const r of ['coder', 'tester', 'researcher', 'orchestrator', 'ops', 'data', 'security', 'product']) {
      expect(roles.has(r), `角色 ${r} 缺定义`).toBe(true)
    }
  })

  it('每角色三段声明（allow/ask/deny）都在位', () => {
    // 段级断言：每个角色块内三键各至少一行
    const blocks = text.split(/\n  (?=[a-z-]+:$)/).slice(1)
    for (const b of blocks) {
      const name = /^  ([a-z-]+):$/m.exec(b)?.[1]
      if (!name || !roles.has(name)) continue
      expect(b, `角色 ${name} 缺 allow`).toMatch(/allow:/)
      expect(b, `角色 ${name} 缺 ask`).toMatch(/ask:/)
      expect(b, `角色 ${name} 缺 deny`).toMatch(/deny:/)
    }
  })

  it('默认策略包红线与矩阵并存（策略包在位且规则可解析）', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'config/default-tool-policies.json'), 'utf8'))
    expect(pkg.version).toBe(1)
    expect(pkg.mode).toBe('permissive')
    const denyIds = pkg.rules.filter((r: { action: string }) => r.action === 'deny').map((r: { id: string }) => r.id)
    expect(denyIds).toEqual(expect.arrayContaining(['deny-secret-read', 'deny-git-dir-write', 'deny-destructive-shell']))
  })
})

describe('managed-settings（组织锁定面）', () => {
  it('仓内基线缺席=未托管（fail-soft），badging 不猜数', async () => {
    const { loadManagedSettings, resetManagedSettingsCache } = await import('../server/managedsettings/managed-settings')
    const prev = process.env.HOME
    try {
      process.env.HOME = '/nonexistent-d1-test'
      resetManagedSettingsCache()
      const m = loadManagedSettings()
      expect(m === null || m._source?.includes('config/managed-settings.json') === true).toBe(true)
    } finally {
      process.env.HOME = prev
      resetManagedSettingsCache()
    }
  })

  it('总闸默认开：env 未设=执法、显式 0=关、managed 锁定优先', async () => {
    const { masterSwitchOn } = await import('../server/toolpipeline/enforce-gate')
    const prev = process.env.HERMES_TOOL_ENFORCE
    try {
      delete process.env.HERMES_TOOL_ENFORCE
      expect(masterSwitchOn(), 'D1 后总闸默认开').toBe(true)
      process.env.HERMES_TOOL_ENFORCE = '0'
      expect(masterSwitchOn(), '显式 0=逃生门').toBe(false)
      process.env.HERMES_TOOL_ENFORCE = '1'
      expect(masterSwitchOn()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.HERMES_TOOL_ENFORCE
      else process.env.HERMES_TOOL_ENFORCE = prev
    }
  })
})

describe('默认策略包执法语义（enforce-gate 集成）', () => {
  it('凭证路径读被默认包拒绝（builtin-default 回落生效）', async () => {
    const { evaluateEnforcement } = await import('../server/toolpipeline/enforce-gate')
    const v = evaluateEnforcement('read_file', { path: '/x/.env' }, undefined, { masterOn: true, policyOf: undefined })
    // policyOf 缺省走 loadPolicySnapshot——NODE_ENV=test 且未指目录会隔离；
    // 显式指到仓根（默认包）验证 deny
    process.env.HERMES_TOOL_POLICY_FILE = resolve(ROOT, 'config/default-tool-policies.json')
    try {
      const { loadPolicySnapshot } = await import('../server/toolpolicy/policy-store')
      const snap = loadPolicySnapshot(Date.now() + 10_000)
      expect(snap.exists, '默认包应可加载').toBe(true)
      const v2 = evaluateEnforcement('read_file', { path: '/x/.env' }, undefined, {
        masterOn: true, policyOf: () => snap,
      })
      expect(v2.enforcing && !v2.allow).toBe(true)
      expect(v2.rule).toBe('policy-deny')
      const okRead = evaluateEnforcement('read_file', { path: '/repo/src/a.ts' }, undefined, {
        masterOn: true, policyOf: () => snap,
      })
      expect(okRead.enforcing && okRead.allow, '普通读路径放行').toBe(true)
      const push = evaluateEnforcement('terminal_exec', { command: 'git push origin main' }, undefined, {
        masterOn: true, policyOf: () => snap,
      })
      expect(push.rule, 'git push 走审批').toBe('policy-require-approval')
      const sudo = evaluateEnforcement('terminal_exec', { command: 'sudo rm x' }, undefined, {
        masterOn: true, policyOf: () => snap,
      })
      expect(sudo.rule, 'sudo 红线拒').toBe('policy-deny')
    } finally {
      delete process.env.HERMES_TOOL_POLICY_FILE
    }
  })
})
