// @vitest-environment node
// Task 7 负例：verify-dist 按运行时资产清单校验（--server 模式逐项存在+摘要对账；
// client-only 模式保留给 npm run build，不校验 server 面）。真子进程跑真脚本。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve(import.meta.dirname, '..', 'verify-dist.mjs')

const INDEX_HTML = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><title>AIStudio</title>
<link rel="modulepreload" crossorigin href="/assets/index-x.js" /></head>
<body><div id="app"></div>
<script type="module" crossorigin src="/assets/index-x.js"></script></body></html>
`

let upstream: string
let distServer: string

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function makeClientDist(): void {
  const distClient = resolve(upstream, 'hermes-studio', 'dist', 'client')
  mkdirSync(resolve(distClient, 'assets'), { recursive: true })
  writeFileSync(resolve(distClient, 'index.html'), INDEX_HTML)
  writeFileSync(resolve(distClient, 'assets', 'index-x.js'), 'export const x = 1;\n')
}

/** 造 server 产物面：index.js + runtime 资产 + 清单。清单恒列全量四项；
 *  omit=从磁盘摘掉一项（清单仍列——模拟「清单在、实物缺」）。 */
function makeServerDist(omit?: string): void {
  mkdirSync(distServer, { recursive: true })
  writeFileSync(resolve(distServer, 'index.js'), '// server bundle\n')
  const files: Array<[string, string]> = [
    ['runtime/pricing/models.yaml', 'currency: CNY\nmodels: {}\n'],
    ['runtime/roster/squads.yaml', 'squads: {}\n'],
    ['runtime/roster/columns.yaml', 'columns: {}\n'],
    ['semantica-bridge.py', '# bridge\n'],
  ]
  const assets: Array<{ rel: string; sha256: string; bytes: number }> = []
  for (const [rel, content] of files) {
    if (rel !== omit) {
      const target = resolve(distServer, rel)
      mkdirSync(resolve(target, '..'), { recursive: true })
      writeFileSync(target, content)
    }
    // 清单条目恒在——「缺实物」才测得出存在性校验
    assets.push({ rel, sha256: sha256(content), bytes: content.length })
  }
  writeFileSync(resolve(distServer, 'runtime-assets.json'), `${JSON.stringify({ schemaVersion: 1, assets }, null, 2)}\n`)
}

function run(args: string[] = []): { code: number; stderr: string; stdout: string } {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, OVERLAY_UPSTREAM_ROOT: upstream },
  })
  return { code: r.status ?? -1, stderr: r.stderr ?? '', stdout: r.stdout ?? '' }
}

beforeEach(() => {
  upstream = mkdtempSync(join(tmpdir(), 'verify-dist-rt-'))
  distServer = resolve(upstream, 'hermes-studio', 'dist', 'server')
})
afterEach(() => rmSync(upstream, { recursive: true, force: true }))

describe('verify-dist 运行时资产清单（--server）', () => {
  it('清单齐全：--server 退出 0', () => {
    makeClientDist()
    makeServerDist()
    const r = run(['--server'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('runtime 资产')
  })

  it('缺任一清单资产（squads.yaml）：非零并点名', () => {
    makeClientDist()
    makeServerDist('runtime/roster/squads.yaml')
    const r = run(['--server'])
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('squads.yaml')
  })

  it('缺 semantica-bridge.py：非零并点名', () => {
    makeClientDist()
    makeServerDist('semantica-bridge.py')
    const r = run(['--server'])
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('semantica-bridge.py')
  })

  it('清单本身缺席：--server 非零（不静默跳过校验面）', () => {
    makeClientDist()
    mkdirSync(distServer, { recursive: true })
    writeFileSync(resolve(distServer, 'index.js'), '// x\n')
    const r = run(['--server'])
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('runtime-assets.json')
  })

  it('server 入口缺席：--server 非零', () => {
    makeClientDist()
    mkdirSync(resolve(distServer, 'runtime', 'pricing'), { recursive: true })
    writeFileSync(resolve(distServer, 'runtime', 'pricing', 'models.yaml'), 'x: 1\n')
    writeFileSync(resolve(distServer, 'runtime-assets.json'), JSON.stringify({
      schemaVersion: 1,
      assets: [{ rel: 'runtime/pricing/models.yaml', sha256: sha256('x: 1\n'), bytes: 5 }],
    }))
    const r = run(['--server'])
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('index.js')
  })

  it('内容漂移（同在清单、字节不符）：非零', () => {
    makeClientDist()
    // 清单记录原始摘要，落盘文件被篡改（多一行）——存在性检查过不了关，摘要对账拦下
    const files: Array<[string, string]> = [
      ['runtime/pricing/models.yaml', 'currency: CNY\n'],
    ]
    const assets = files.map(([rel, c]) => ({ rel, sha256: sha256(c), bytes: c.length }))
    mkdirSync(resolve(distServer, 'runtime', 'pricing'), { recursive: true })
    writeFileSync(resolve(distServer, 'index.js'), '// s\n')
    writeFileSync(resolve(distServer, 'runtime', 'pricing', 'models.yaml'), 'currency: USD\n')
    writeFileSync(resolve(distServer, 'runtime-assets.json'), JSON.stringify({ schemaVersion: 1, assets }))
    const r = run(['--server'])
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('models.yaml')
  })

  it('client-only（无 --server）：server 面缺席不阻断（npm run build 的 postbuild 语义保留）', () => {
    makeClientDist()
    const r = run()
    expect(r.code).toBe(0)
  })
})

describe('单文件资产源映射单一事实源（P2 Task 4：src 下沉 runtime-assets.mjs）', () => {
  it('build.mjs 不再硬编码单文件资产源——映射消费自 runtime-assets.mjs', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const root = resolve(import.meta.dirname, '../..')
    const build = readFileSync(resolve(root, 'scripts/build.mjs'), 'utf8')
    expect(build).not.toContain('semantica-bridge.py')
    expect(build).not.toContain('decisiongraph')
    expect(build).toMatch(/runtimeAssetSource|RUNTIME_ASSET_FILES/)
    const lib = readFileSync(resolve(root, 'scripts/platform/lib/runtime-assets.mjs'), 'utf8')
    expect(lib).toMatch(/export function runtimeAssetSource/)
    expect(lib).toContain("['custom/server/decisiongraph/semantica-bridge.py', 'semantica-bridge.py']")
  })
})
