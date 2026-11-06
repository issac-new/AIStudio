// P2 Task 3 守门：文档投影生成器（sync-training-docs.mjs）。
// 铁律：版本/路由计数/全量清单只从真实载体生成（route-manifest 真注册链＋
// package.json＋RELEASE-MANIFEST＋features.ts 经注册链解析），手册内的 marker
// 块与重算结果漂移即 --check 非零——手册不得手维护第二份路由清单。
// 夹具法：--root 指向临时树（拷真载体），DOCS_PROJECTION_MANIFEST_FILE 注入
// 清单 seam（免 vite-node 真跑；真链一致性由 route-manifest.test.ts 集成例锁）。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const GEN = join(ROOT, 'scripts/platform/docs/sync-training-docs.mjs')
const MANUAL_REL = 'docs/manuals/aistudio-training-and-user-guide.md'

let tmp: string
let fixtureRoot: string
let manifestFile: string

/** 最小可判清单夹具（形状=route-manifest.ts 输出；计数与 routes/stageTabs 一致）。 */
function fixtureManifest(overrides: Record<string, unknown> = {}) {
  return {
    routes: [
      { name: 'ia2.eval', path: '/app/eval', visitPath: '/app/eval', kind: 'page', public: false, requiresSuperAdmin: false, allowCanonical: false, allowQuery: false, allowBlank: false, expect: [] },
      { name: 'ia2.bpa', path: '/app/bpa', visitPath: '/app/bpa', kind: 'page', public: false, requiresSuperAdmin: false, allowCanonical: false, allowQuery: false, allowBlank: false, expect: [] },
      { name: 'legacy.chat', path: '/chat', visitPath: '/chat', kind: 'redirect', public: false, requiresSuperAdmin: false, allowCanonical: false, allowQuery: false, allowBlank: false, expect: [] },
    ],
    stageTabs: [
      { name: 'ia2.stage1', stage: 1, key: 'brief', path: '/app/stage/setup', visitPath: '/app/stage/setup?tab=brief', expect: [] },
      { name: 'ia2.stage6', stage: 6, key: 'govern', path: '/app/stage/govern', visitPath: '/app/stage/govern?tab=govern', expect: ['failClosed'] },
    ],
    featureGates: { matrixChat: true, ide: false, pet: true },
    counts: { routes: 3, pages: 2, redirects: 1, stageTabs: 2, visitStates: 5 },
    ...overrides,
  }
}

function runGen(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [GEN, ...args], {
    cwd: fixtureRoot, encoding: 'utf8',
    env: { ...process.env, DOCS_PROJECTION_MANIFEST_FILE: manifestFile, ...env },
  })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'docs-sync-t-'))
  fixtureRoot = join(tmp, 'repo')
  mkdirSync(join(fixtureRoot, 'docs/manuals'), { recursive: true })
  cpSync(join(ROOT, 'package.json'), join(fixtureRoot, 'package.json'))
  cpSync(join(ROOT, 'RELEASE-MANIFEST.json'), join(fixtureRoot, 'RELEASE-MANIFEST.json'))
  cpSync(join(ROOT, MANUAL_REL), join(fixtureRoot, MANUAL_REL))
  manifestFile = join(tmp, 'manifest.json')
  writeFileSync(manifestFile, JSON.stringify(fixtureManifest()))
})

afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('sync-training-docs：marker 块写入与对账', () => {
  it('--write 落块（版本/计数/全量清单/模块版本/特性开关），--check 对账绿', () => {
    const w = runGen(['--write', '--root', fixtureRoot])
    expect(w.code, w.stderr).toBe(0)
    const manual = readFileSync(join(fixtureRoot, MANUAL_REL), 'utf8')
    const pkg = JSON.parse(readFileSync(join(fixtureRoot, 'package.json'), 'utf8'))
    expect(manual).toContain('docs-projection:begin')
    expect(manual).toContain('docs-projection:end')
    // 版本来自 package.json 真载体
    expect(manual).toContain(`适用版本：AIStudio ${pkg.version}（package.json）`)
    // 路由计数来自清单
    expect(manual).toContain('routes=3（page 2 / redirect 1）')
    expect(manual).toContain('stageTabs=2')
    expect(manual).toContain('visitStates=5')
    // 全量清单：三条路由逐名在块内
    for (const name of ['ia2.eval', 'ia2.bpa', 'legacy.chat']) expect(manual).toContain(`| ${name} |`)
    // 模块版本来自 RELEASE-MANIFEST
    const rel = JSON.parse(readFileSync(join(fixtureRoot, 'RELEASE-MANIFEST.json'), 'utf8'))
    for (const [key, mod] of Object.entries(rel.modules) as [string, { version: string }][]) {
      expect(manual).toContain(`${key} ${mod.version}`)
    }
    // 特性开关经注册链解析（on/off 面）
    expect(manual).toContain('matrixChat=on')
    expect(manual).toContain('ide=off')
    const c = runGen(['--check', '--root', fixtureRoot])
    expect(c.code, c.stdout + c.stderr).toBe(0)
  })

  it('版本漂移负例：package.json 版本变化 → --check 非零且点名版本', () => {
    runGen(['--write', '--root', fixtureRoot])
    const pkgPath = join(fixtureRoot, 'package.json')
    const orig = readFileSync(pkgPath, 'utf8')
    const bumped = JSON.parse(orig)
    bumped.version = '9.9.9-drift'
    writeFileSync(pkgPath, JSON.stringify(bumped, null, 2))
    try {
      const c = runGen(['--check', '--root', fixtureRoot])
      expect(c.code).not.toBe(0)
      expect(c.stdout + c.stderr).toContain('9.9.9-drift')
      expect(c.stdout + c.stderr).toContain('版本')
    } finally {
      writeFileSync(pkgPath, orig)
    }
  })

  it('路由漂移负例：清单计数/路由集变化 → --check 非零', () => {
    runGen(['--write', '--root', fixtureRoot])
    writeFileSync(manifestFile, JSON.stringify(fixtureManifest({
      routes: [...fixtureManifest().routes, {
        name: 'ia2.newpage', path: '/app/newpage', visitPath: '/app/newpage', kind: 'page', public: false, requiresSuperAdmin: false, allowCanonical: false, allowQuery: false, allowBlank: false, expect: [],
      }],
      counts: { routes: 4, pages: 3, redirects: 1, stageTabs: 2, visitStates: 6 },
    })))
    try {
      const c = runGen(['--check', '--root', fixtureRoot])
      expect(c.code).not.toBe(0)
      expect(c.stdout + c.stderr).toContain('routes=4')
    } finally {
      writeFileSync(manifestFile, JSON.stringify(fixtureManifest()))
    }
  })

  it('手改块内内容负例：块内清单被手增删 → --check 非零（手册不得手维护第二份清单）', () => {
    runGen(['--write', '--root', fixtureRoot])
    const manualPath = join(fixtureRoot, MANUAL_REL)
    const orig = readFileSync(manualPath, 'utf8')
    const begin = orig.indexOf('docs-projection:begin')
    const end = orig.indexOf('docs-projection:end')
    expect(begin).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(begin)
    // 手删一条路由行
    writeFileSync(manualPath, orig.replace('| legacy.chat |', '| hand-edited |'))
    try {
      const c = runGen(['--check', '--root', fixtureRoot])
      expect(c.code).not.toBe(0)
    } finally {
      writeFileSync(manualPath, orig)
    }
    expect(runGen(['--check', '--root', fixtureRoot]).code).toBe(0)
  })

  it('块缺席负例：手册无 marker → --check 非零并提示先 docs:sync', () => {
    const bareRoot = join(tmp, 'bare')
    mkdirSync(join(bareRoot, 'docs/manuals'), { recursive: true })
    cpSync(join(ROOT, 'package.json'), join(bareRoot, 'package.json'))
    cpSync(join(ROOT, 'RELEASE-MANIFEST.json'), join(bareRoot, 'RELEASE-MANIFEST.json'))
    writeFileSync(join(bareRoot, MANUAL_REL), '# 裸手册\n\n无投影块。\n')
    const c = runGen(['--check', '--root', bareRoot])
    expect(c.code).not.toBe(0)
    expect(c.stdout + c.stderr).toContain('docs:sync')
    // --write 补块后转绿
    const w = runGen(['--write', '--root', bareRoot])
    expect(w.code, w.stderr).toBe(0)
    expect(runGen(['--check', '--root', bareRoot]).code).toBe(0)
  })

  it('幂等：连续两次 --write 字节不变（无时间戳）', () => {
    runGen(['--write', '--root', fixtureRoot])
    const first = readFileSync(join(fixtureRoot, MANUAL_REL), 'utf8')
    runGen(['--write', '--root', fixtureRoot])
    expect(readFileSync(join(fixtureRoot, MANUAL_REL), 'utf8')).toBe(first)
  })

  it('package.json 接线：docs:sync/docs:check 在册，release:check 消费同一 check', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts['docs:sync']).toContain('sync-training-docs.mjs')
    expect(pkg.scripts['docs:sync']).toContain('--write')
    expect(pkg.scripts['docs:check']).toContain('sync-training-docs.mjs')
    expect(pkg.scripts['docs:check']).toContain('--check')
    // release:check 必须消费同一 docs check（文档漂移=发布漂移）
    expect(pkg.scripts['release:check']).toContain('docs:check')
    expect(existsSync(GEN)).toBe(true)
  })

  it('用法负例：无参数 → 非零 usage（不默认任何模式）', () => {
    const r = spawnSync(process.execPath, [GEN], { cwd: fixtureRoot, encoding: 'utf8', env: process.env })
    expect(r.status).not.toBe(0)
    expect(r.stderr + r.stdout).toContain('--write')
  })
})

describe('sync-training-docs：真仓自洽（无 seam 的生成器在位）', () => {
  it('真仓手册已含投影块且 markers 成对（内容一致性由 route-manifest 集成例真链对账）', () => {
    const manual = readFileSync(join(ROOT, MANUAL_REL), 'utf8')
    expect(manual).toContain('docs-projection:begin')
    expect(manual).toContain('docs-projection:end')
    const begin = manual.indexOf('docs-projection:begin')
    const end = manual.indexOf('docs-projection:end')
    expect(end).toBeGreaterThan(begin)
    const genHeader = execFileSync(process.execPath, [GEN, '--help'], { encoding: 'utf8', cwd: ROOT })
    expect(genHeader).toContain('--check')
    expect(genHeader).toContain('--write')
  })
})
