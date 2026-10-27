// inject 目标树缺席跳过守门（2026-10-27 standalone 模块包挂账清偿）：
// cockpit 源码包只含 vendor/hermes-studio，series 里 74 个 agent 补丁原先硬死。
// 现形态：agent 树缺席 → SKIP 并汇总；本测用 OVERLAY_UPSTREAM_ROOT 指向仅含
// hermes-studio 的临时根做真实 standalone inject（不碰在服主树）。
import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

function injectAt(upstreamRoot: string, cwd = ROOT): { code: number; out: string } {
  const fakeHome = mkdtempSync(join(tmpdir(), 'sa-home-'))
  // HOME 隔离：inject 出口的 deploy-agent-runtime 会写 ~/.hermes/hermes-agent
  // （B1 双树同步），测试绝不碰真实 home——homedir() 跟随 $HOME。
  // stdout＋stderr 合并采集：SKIP 走 console.warn（stderr）。
  const r = spawnSync('node', [join(ROOT, 'scripts/inject.mjs')], {
    env: { ...process.env, OVERLAY_UPSTREAM_ROOT: upstreamRoot, HOME: fakeHome },
    encoding: 'utf8',
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  })
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

describe('inject 缺目标树跳过（standalone cockpit 包形态）', () => {
  it.skipIf(!existsSync(join(ROOT, 'vendor/hermes-studio/package.json')))(
    '仅含 hermes-studio 的临时根：agent 补丁 SKIP 汇总、studio 补丁全应用、rc=0',
    () => {
      const tmp = mkdtempSync(join(tmpdir(), 'standalone-cockpit-'))
      // 纯净 studio 基线（git archive HEAD，排除在服注入态）
      execFileSync(
        'bash',
        ['-c', `git -C ${JSON.stringify(ROOT)} archive HEAD vendor/hermes-studio | tar -x -C ${JSON.stringify(tmp)} --strip-components=1`],
      )
      expect(existsSync(join(tmp, 'hermes-studio/package.json'))).toBe(true)
      expect(existsSync(join(tmp, 'hermes-agent'))).toBe(false)

      const r = injectAt(tmp, tmp)
      expect(r.code, `standalone inject 应成功：\n${r.out.slice(-600)}`).toBe(0)
      expect(r.out).toContain('(hermes-agent tree absent, standalone/partial checkout)')
      expect(r.out).toMatch(/共 \d+ 个补丁因 hermes-agent 树缺席跳过/)
      // studio 全量应用（约 336 个）且无 zcode 报错（zcodeRoot 缺席=容错空集）
      const applied = (r.out.match(/applied patch/g) ?? []).length
      expect(applied, 'studio 补丁应全量应用').toBeGreaterThan(300)
    }, 300_000)

  it('缺席判定锚与汇总行在源码在位（防漂移）', () => {
    const src = readFileSync(join(ROOT, 'scripts/inject.mjs'), 'utf8')
    expect(src).toContain('(hermes-agent tree absent, standalone/partial checkout)')
    expect(src).toContain('skippedAbsentTree')
    expect(src).toContain("resolve(hermesAgentRoot, 'hermes_cli')")
  })
})
