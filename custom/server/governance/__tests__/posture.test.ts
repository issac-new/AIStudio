// AGT 吸收轮 A（2026-10-21）：治理姿态对账面单测——三态灯语义与偏差清单。
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { collectGovernancePosture } from '../posture'
import { _pinManagedSettingsForTests, _unpinManagedSettingsForTests } from '../../managedsettings/managed-settings'

const root = mkdtempSync(join(tmpdir(), 'posture-'))

function makeHome(name: string, profiles: Record<string, string | null>, rootYaml?: string): string {
  const home = join(root, name)
  mkdirSync(home, { recursive: true })
  if (rootYaml !== undefined) writeFileSync(join(home, 'config.yaml'), rootYaml)
  for (const [p, yaml] of Object.entries(profiles)) {
    if (yaml === null) { mkdirSync(join(home, 'profiles', p), { recursive: true }); continue }
    mkdirSync(join(home, 'profiles', p), { recursive: true })
    writeFileSync(join(home, 'profiles', p, 'config.yaml'), yaml)
  }
  return home
}

describe('governance posture（治理姿态对账）', () => {
  it('三态灯：off=裸奔；显式 smart/manual=已治理；未声明=部分（生效=默认 smart 不冤枉）', () => {
    const home = makeHome('t1', {
      off1: 'approvals:\n  mode: off\n',
      smart1: 'approvals:\n  mode: smart\n',
      manual1: 'approvals:\n  mode: manual\n',
      undeclared: 'model: glm-4.7\n',
      nocfg: null,
    }, 'approvals:\n  mode: smart\n')
    const r = collectGovernancePosture({ hermesHome: home, env: {} })
    const by = Object.fromEntries(r.profiles.map((p) => [p.name, p]))
    expect(by.default.lamp).toBe('governed') // 根 config 显式 smart
    expect(by.off1.lamp).toBe('bare')
    expect(by.off1.approvalsMode).toBe('off')
    expect(by.smart1.lamp).toBe('governed')
    expect(by.manual1.lamp).toBe('governed')
    expect(by.undeclared.lamp).toBe('partial')
    expect(by.undeclared.approvalsDeclared).toBe(false)
    expect(by.nocfg.lamp).toBe('partial')
    expect(by.nocfg.deviations.some((d) => d.includes('不存在'))).toBe(true)
    expect(r.summary).toMatchObject({ total: 6, governed: 3, partial: 2, bare: 1, configMissing: 1 })
  })

  it('期望对账：声明期望与实际不符 → 偏差清单可见', () => {
    const home = makeHome('t2', { alpha: 'approvals:\n  mode: smart\n' })
    const expFile = join(root, 't2-exp.json')
    writeFileSync(expFile, JSON.stringify({ profiles: { alpha: { approvalsMode: 'manual' } } }))
    process.env.HERMES_POSTURE_EXPECTATIONS = expFile
    try {
      const r = collectGovernancePosture({ hermesHome: home, env: {} })
      const alpha = r.profiles.find((p) => p.name === 'alpha')
      expect(alpha?.expectedApprovalsMode).toBe('manual')
      expect(alpha?.deviations.some((d) => d.includes('实际=smart') && d.includes('期望=manual'))).toBe(true)
      expect(r.expectations.exists).toBe(true)
    } finally {
      delete process.env.HERMES_POSTURE_EXPECTATIONS
    }
  })

  it('全局面：执法总闸/strict/规则计数如实呈现（总闸未配置＝默认开；strict 未配置＝关）', () => {
    const home = makeHome('t3', {})
    const r = collectGovernancePosture({ hermesHome: home, env: {} })
    // 总闸与执法正身同判据（D1 2026-11-05 默认开）：未设环境变量时执法在生效，读数不能显示「关」
    expect(r.global.enforceMasterOn).toBe(true)
    expect(r.global.strictOn).toBe(false)
    expect(r.global.sandboxRoots).toBe(0)
    const r2 = collectGovernancePosture({
      hermesHome: home,
      env: { HERMES_TOOL_ENFORCE: '1', HERMES_TOOL_ENFORCE_STRICT: '1', HERMES_TOOL_SANDBOX_ROOTS: '/tmp:/var/tmp' },
    })
    expect(r2.global.enforceMasterOn).toBe(true)
    expect(r2.global.strictOn).toBe(true)
    expect(r2.global.sandboxRoots).toBe(2)
  })
})

describe('治理姿态总闸读数与执法正身同口径（2026-11-28）', () => {
  it('未设置环境变量：执法总闸按默认开显示，不显示成关', () => {
    const home = makeHome('t-master-default', {})
    const r = collectGovernancePosture({ hermesHome: home, env: {} })
    expect(r.global.enforceMasterOn).toBe(true)
  })

  it('显式设为 0 才显示关', () => {
    const home = makeHome('t-master-off', {})
    const off = collectGovernancePosture({ hermesHome: home, env: { HERMES_TOOL_ENFORCE: '0' } })
    expect(off.global.enforceMasterOn).toBe(false)
    const on = collectGovernancePosture({ hermesHome: home, env: { HERMES_TOOL_ENFORCE: '1' } })
    expect(on.global.enforceMasterOn).toBe(true)
  })

  it('部署侧锁定优先：锁定开则环境变量设 0 也显示开', () => {
    _pinManagedSettingsForTests({ version: 1, toolEnforceLocked: true, toolEnforce: 1 })
    try {
      const home = makeHome('t-master-locked', {})
      const r = collectGovernancePosture({ hermesHome: home, env: { HERMES_TOOL_ENFORCE: '0' } })
      expect(r.global.enforceMasterOn).toBe(true)
    } finally {
      _unpinManagedSettingsForTests()
    }
  })
})
