// 发布清单守门（2026-10-26 四模块裁定）：RELEASE-MANIFEST.json 与四模块
// 版本载体逐条对账——版本串必须真实存在于 carrier 文件，漂移即红。
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const MANIFEST_PATH = join(ROOT, 'RELEASE-MANIFEST.json')

type ModuleEntry = {
  name: string
  version: string
  versionCarrier: string
  carrierPattern?: string
  buildCommand: string
  artifacts: string
  install: string
  notes?: string
}
type Manifest = {
  schema: number
  product: string
  modules: Record<string, ModuleEntry>
  vendorBaseline: string
}

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest
}

function runCheck(env: Record<string, string> = {}): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [join(ROOT, 'scripts/verify-release-manifest.mjs')], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

describe('发布清单结构', () => {
  it('RELEASE-MANIFEST.json 存在且为合法 JSON（schema=1、四模块齐全）', () => {
    const m = loadManifest()
    expect(m.schema).toBe(1)
    expect(m.product).toBe('AIStudio')
    expect(Object.keys(m.modules).sort()).toEqual(['agent-teams', 'cockpit', 'ycode', 'yuan-skill'])
    expect(m.vendorBaseline).toContain('vendor/VENDOR.md')
  })

  it('每模块字段完备：name/version/versionCarrier/buildCommand/artifacts/install', () => {
    const m = loadManifest()
    for (const [key, mod] of Object.entries(m.modules)) {
      for (const field of ['name', 'version', 'versionCarrier', 'buildCommand', 'artifacts', 'install'] as const) {
        expect(mod[field], `${key}.${field} 必填`).toBeTruthy()
      }
    }
  })

  it('驾驶舱模块如实标注推演程序仅仓内（用户裁定 2026-10-26）', () => {
    const notes = loadManifest().modules.cockpit.notes ?? ''
    expect(notes).toContain('simharness')
    expect(notes).toContain('不随安装包')
  })

  it('packaging 节：4+1 源码包形态、依赖源码策略声明 pip/npm 口径', () => {
    const p = loadManifest().packaging
    expect(p?.format).toBe('tar.gz')
    expect(p?.outputDir).toBe('dist/release/')
    expect(p?.fullPackage?.name).toBe('aistudio-full')
    expect(String(p?.depSourcePolicy)).toContain('pip')
    expect(String(p?.depSourcePolicy)).toContain('npm')
    expect(String(p?.fullPackage?.note ?? '')).toContain('pip')
  })

  it('每模块 packageIncludes 非空且路径实在（防清单指向幻影目录）', () => {
    const m = loadManifest()
    for (const [key, mod] of Object.entries(m.modules)) {
      const includes: string[] = mod.packageIncludes ?? []
      expect(includes.length, `${key}.packageIncludes 不得为空`).toBeGreaterThan(0)
      for (const inc of includes) {
        expect(existsSync(join(ROOT, inc)), `${key} include 不存在：${inc}`).toBe(true)
      }
    }
  })
})

describe('版本载体对账（真源在 carrier，清单只抄录）', () => {
  it('cockpit：版本串存在于 RELEASE-NOTES.md 版本节，且大版本对齐 hermes-studio 底座', () => {
    const m = loadManifest()
    const carrier = readFileSync(join(ROOT, m.modules.cockpit.versionCarrier), 'utf8')
    expect(carrier).toContain(m.modules.cockpit.version)
    const vendor = readFileSync(join(ROOT, 'vendor/VENDOR.md'), 'utf8')
    const studio = /hermes-studio \| `[^`]+` \| v?(\d+\.\d+\.\d+)/.exec(vendor)?.[1]
    const hit = /^(v?\d+\.\d+\.\d+)-studio\.([1-9]\d*)$/.exec(m.modules.cockpit.version)
    expect(hit?.[1], 'cockpit 须=完整三位底座-studio.N').toBe(studio)
  })

  it('agent-teams：VERSION 真源首行=清单版本，且完整三位底座对齐 hermes-agent（2026-10-27 裁定＋纠正）', () => {
    const m = loadManifest()
    const first = readFileSync(join(ROOT, m.modules['agent-teams'].versionCarrier), 'utf8')
      .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))[0]
    expect(first).toBe(m.modules['agent-teams'].version)
    const vendor = readFileSync(join(ROOT, 'vendor/VENDOR.md'), 'utf8')
    const agent = /hermes-agent \| `[^`]+` \| v?(\d+\.\d+\.\d+)/.exec(vendor)?.[1]
    const hit = /^v(\d+\.\d+\.\d+)-team\.([1-9]\d*)$/.exec(m.modules['agent-teams'].version)
    expect(hit?.[1], 'agent-teams 须=完整三位底座-team.N').toBe(agent)
  })

  it('版本漂移负例：篡改 team/VERSION 首行 → release:check 非零（fixture 隔离）', () => {
    const m = loadManifest()
    const tmp = mkdtempSync(join(tmpdir(), 'verchk-'))
    const tampered = join(tmp, 'VERSION')
    writeFileSync(tampered, 'v9.9.9\n', 'utf8')
    const r = runCheck({ AIStudio_TestCarrierOverride: JSON.stringify({ [m.modules['agent-teams'].versionCarrier]: tampered }) })
    expect(r.code).not.toBe(0)
    expect(r.stdout + r.stderr).toContain('agent-teams')
  })

  it('ycode：底座版本=vendor/zcode/package.json 的 version 字段（JSON 真源）', () => {
    const m = loadManifest()
    expect(m.modules.ycode.carrierFormat).toBe('json:version')
    const pkg = JSON.parse(readFileSync(join(ROOT, m.modules.ycode.versionCarrier), 'utf8')) as { version: string }
    expect(pkg.version).toBe(m.modules.ycode.version)
  })

  it('ycode：基线 commit 仍见于 series 头，且活跃补丁数与 series 一致', () => {
    const m = loadManifest()
    const series = readFileSync(join(ROOT, 'zcode-patches/series'), 'utf8')
    expect(series).toContain(m.modules.ycode.baselineCommit ?? '') // 基线 commit 在 series 头可反查
    const declared = m.modules.ycode.carrierPattern ? Number(/(\d+)/.exec(m.modules.ycode.carrierPattern)?.[1] ?? 0) : 0
    const active = series.split('\n').filter(l => /^\d{3}-/.test(l.trim())).length
    expect(declared, '清单声明的活跃补丁数须等于 series 实际数').toBe(active)
  })

  it('yuan-skill：首条 semver 与 CHANGELOG.md 一致', () => {
    const m = loadManifest()
    const changelog = readFileSync(join(ROOT, m.modules['yuan-skill'].versionCarrier), 'utf8')
    expect(changelog).toContain(`[${m.modules['yuan-skill'].version}]`)
  })
})

describe('release:check 门禁（fail-fast）', () => {
  it('真实仓态全绿（exit 0）', () => {
    const r = runCheck()
    expect(r.stdout).toContain('release:check')
    expect(r.code).toBe(0)
  })

  it('篡改任一载体版本行 → 非零退出（防漂移负例，fixture 隔离不碰真文件）', () => {
    const m = loadManifest()
    const tmp = mkdtempSync(join(tmpdir(), 'relcheck-'))
    const carrierPath = join(ROOT, m.modules['yuan-skill'].versionCarrier)
    const orig = readFileSync(carrierPath, 'utf8')
    try {
      writeFileSync(join(tmp, 'tampered'), orig.replace(`[${m.modules['yuan-skill'].version}]`, '[v0.0.0]'), 'utf8')
      const r = runCheck({ AIStudio_TestCarrierOverride: JSON.stringify({ [m.modules['yuan-skill'].versionCarrier]: join(tmp, 'tampered') }) })
      expect(r.code).not.toBe(0)
      expect(r.stdout + r.stderr).toContain('yuan-skill')
    } finally {
      if (existsSync(carrierPath)) writeFileSync(carrierPath, orig, 'utf8')
    }
  })

  it('buildCommand 引用的脚本存在（不执行构建，只验在位）', () => {
    const m = loadManifest()
    for (const mod of Object.values(m.modules)) {
      const script = /node (scripts\/\S+|[\w./-]+\.mjs)/.exec(mod.buildCommand)?.[1]
      if (script && !script.startsWith('vendor/')) {
        expect(existsSync(join(ROOT, script)), `${script} 应存在`).toBe(true)
      }
    }
  })

  it('四模块 packageIncludes 均能被 git archive 按 pathspec 取到跟踪文件（空集=红）', () => {
    const m = loadManifest()
    for (const [key, mod] of Object.entries(m.modules)) {
      const args = ['archive', '--format=tar', '--output=/dev/null', 'HEAD', '--', ...(mod.packageIncludes ?? [])]
      expect(() => execFileSync('git', args, { cwd: ROOT }), `${key} pathspec 应命中跟踪文件`).not.toThrow()
    }
  })
})
