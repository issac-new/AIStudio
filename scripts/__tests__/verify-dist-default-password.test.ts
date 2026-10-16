// @vitest-environment node
// M8 出厂默认口令门禁反向测试（2026-10-16 安全轮，预警先行版）。
// 造临时假 dist 跑真脚本，断言退出码与 stderr 文案。
// 预警态纪律：命中只 WARN，退出码恒 0（不阻断构建）；豁免位同样只留痕。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// 本测试在 scripts/__tests__/ 下，上溯两级到 overlay 根
const script = resolve(import.meta.dirname, '..', '..', 'scripts', 'verify-dist.mjs')

let upstream: string
let distClient: string

// 真实 index.html 形态（preload/modulepreload 链，>200B 越过空壳门禁）
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SwarmStudio</title>
    <link rel="icon" href="/favicon.ico" />
    <link rel="modulepreload" crossorigin href="/assets/index-x.js" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" crossorigin src="/assets/index-x.js"></script>
  </body>
</html>
`

function makeDist(js: string): void {
  mkdirSync(resolve(distClient, 'assets'), { recursive: true })
  // 注意：index.html 必须 ≥200B，否则先撞上原有「空壳」完整性门禁，
  // 测的就不是口令扫描了（夹具要绕过既有门禁，只留待测面）。
  writeFileSync(resolve(distClient, 'index.html'), INDEX_HTML)
  writeFileSync(resolve(distClient, 'assets', 'index-x.js'), js)
}

function makeDistNoJs(): void {
  mkdirSync(resolve(distClient, 'assets'), { recursive: true })
  writeFileSync(resolve(distClient, 'index.html'), INDEX_HTML)
}

function run(extraEnv: Record<string, string> = {}): { code: number; stderr: string; stdout: string } {
  // spawnSync 才能同时拿到 stdout 与 stderr——execFileSync 成功时不捕获 stderr，
  // WARN（console.warn 走 stderr）会全漏（2026-10-16 M8 实测坑）。
  const r = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, OVERLAY_UPSTREAM_ROOT: upstream, ...extraEnv },
  })
  return { code: r.status ?? -1, stderr: r.stderr ?? '', stdout: r.stdout ?? '' }
}

beforeEach(() => {
  upstream = mkdtempSync(join(tmpdir(), 'verify-dist-up-'))
  distClient = resolve(upstream, 'hermes-studio', 'dist', 'client')
})

afterEach(() => {
  rmSync(upstream, { recursive: true, force: true })
  delete process.env.VERIFY_DIST_ALLOW_DEFAULT_PASSWORD
})

describe('M8 出厂默认口令扫描（WARN 态）', () => {
  it('干净产物：退出码 0，无 WARN', () => {
    makeDist('export const x = 1; // nothing sensitive here')
    const r = run()
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('出厂默认口令扫描零命中')
    expect(r.stderr).not.toContain('WARN')
  })

  it('P1 免密登录字面量：退出码仍 0（预警态不阻断），WARN 报出文件数', () => {
    makeDist('fetch("/api/auth/login",{body:JSON.stringify({username:"admin",password:"123456"})})')
    const r = run()
    expect(r.code).toBe(0)
    // WARN 行走 console.warn（stderr）——构建日志里可见，退出码不受影响
    expect(r.stderr).toContain('WARN')
    expect(r.stderr).toContain('P1(免密登录) 1 个文件')
  })

  it('P2 提示文案：退出码 0，WARN 报 P2', () => {
    makeDist('const t = "Default username: admin. Default password: 123456."')
    const r = run()
    expect(r.code).toBe(0)
    expect(r.stderr).toContain('WARN')
    expect(r.stderr).toContain('P2(提示文案) 1 个文件')
  })

  it('telegram token 占位符不误报（123456:ABC-DEF）', () => {
    makeDist('const placeholder = "123456:ABC-DEF123456ghIkl-zyx57W2v1u123ew11"')
    const r = run()
    expect(r.code).toBe(0)
    expect(r.stderr).not.toContain('WARN')
    expect(r.stdout).toContain('出厂默认口令扫描零命中')
  })

  it('豁免位：命中时退出码 0，WARN 标注已豁免', () => {
    makeDist('const a = {username:"admin",password:"123456"}')
    const r = run({ VERIFY_DIST_ALLOW_DEFAULT_PASSWORD: '1' })
    expect(r.code).toBe(0)
    expect(r.stderr).toContain('WARN(已豁免)')
  })

  it('既有完整性门禁不被削弱：无 JS 产物仍硬失败', () => {
    makeDistNoJs()
    const r = run()
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('FAIL')
  })
})
