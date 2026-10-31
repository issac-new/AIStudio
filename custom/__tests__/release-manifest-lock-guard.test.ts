// 2026-10-31 版本归一批：整体包版本三载体（package.json 真源＋package-lock.json 派生两处）
// 必须互相对齐，release:check 拦截漂移。v1.0.1–v1.0.4 四轮 lock 根版本滞留 1.0.0-overlay 的
// 根治防复发门：真树全绿＋注入陈旧 lock fixture 断言拦截（AIStudio_TestCarrierOverride 钩子）。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SCRIPT = resolve(ROOT, 'scripts/verify-release-manifest.mjs')

function runCheck(env: Record<string, string> = {}): { status: number; output: string } {
  try {
    const out = execFileSync('node', [SCRIPT], { env: { ...process.env, ...env }, encoding: 'utf8' })
    return { status: 0, output: out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { status: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('release:check 整体包版本三载体对账（版本归一批 2026-10-31）', () => {
  it('真树全绿：package.json 真源与 lock 两处 root version 对齐', () => {
    const r = runCheck()
    expect(r.status, r.output).toBe(0)
  })

  it('package-lock 根版本漂移即拦：注入陈旧 lock fixture 断言非零退出＋人话报错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-guard-'))
    const lock = JSON.parse(readFileSync(resolve(ROOT, 'package-lock.json'), 'utf8')) as {
      version: string
      packages: Record<string, { version?: string }>
    }
    // 模拟历史漂移形态：root version 停在旧版
    lock.packages[''].version = '1.0.0-overlay'
    const fixture = join(dir, 'stale-lock.json')
    writeFileSync(fixture, JSON.stringify(lock))
    const r = runCheck({ AIStudio_TestCarrierOverride: JSON.stringify({ 'package-lock.json': fixture }) })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('package-lock.json 根版本')
    expect(r.output).toContain('1.0.0-overlay')
  })
})
