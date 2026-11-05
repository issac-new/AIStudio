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

function injectAt(upstreamRoot: string, cwd = ROOT): { code: number; out: string; stateDir: string } {
  const fakeHome = mkdtempSync(join(tmpdir(), 'sa-home-'))
  const stateDir = join(fakeHome, 'state')
  // HOME 隔离：inject 出口的 deploy-agent-runtime 会写 ~/.hermes/hermes-agent
  // （B1 双树同步），测试绝不碰真实 home——homedir() 跟随 $HOME。
  // stdout＋stderr 合并采集：SKIP 走 console.warn（stderr）。
  const r = spawnSync('node', [join(ROOT, 'scripts/inject.mjs')], {
    // OVERLAY_STATE_OUT：派生 config 与注入清单落临时目录——真实 inject 会按脚本位置
    // 写仓根，测试若落仓根会把临时树路径烙进 vite.config.overlay.ts（2026-10-28 实录：
    // 随后 build:full 的产物因此写进已删除的临时树）。
    env: { ...process.env, OVERLAY_UPSTREAM_ROOT: upstreamRoot, HOME: fakeHome, OVERLAY_STATE_OUT: stateDir },
    encoding: 'utf8',
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  })
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? ''), stateDir }
}

describe('inject 缺目标树跳过（standalone cockpit 包形态）', () => {
  it.skipIf(!existsSync(join(ROOT, '.git')) || !existsSync(join(ROOT, 'vendor/hermes-studio/package.json')))(
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

      const repoConfig = join(ROOT, 'vite.config.overlay.mts')
      const before = existsSync(repoConfig) ? readFileSync(repoConfig, 'utf8') : null
      const r = injectAt(tmp, tmp)
      expect(r.code, `standalone inject 应成功：\n${r.out.slice(-600)}`).toBe(0)
      expect(r.out).toContain('(hermes-agent tree absent, standalone/partial checkout)')
      expect(r.out).toMatch(/共 \d+ 个补丁因 hermes-agent 树缺席跳过/)
      // studio 全量应用（约 336 个）且无 zcode 报错（zcodeRoot 缺席=容错空集）
      const applied = (r.out.match(/applied patch/g) ?? []).length
      expect(applied, 'studio 补丁应全量应用').toBeGreaterThan(300)
      // 隔离锚：派生 config 落 OVERLAY_STATE_OUT，仓根同名文件不得被创建或改写
      expect(existsSync(join(r.stateDir, 'vite.config.overlay.mts')), '派生 config 应落 OVERLAY_STATE_OUT').toBe(true)
      const after = existsSync(repoConfig) ? readFileSync(repoConfig, 'utf8') : null
      expect(after, '仓根 vite.config.overlay.ts 被测试污染').toBe(before)
      // P1 Task 5：manifest v2 落 OVERLAY_STATE_OUT——standalone 形态=partial（仅缺树跳过）
      const mPath = join(r.stateDir, '.overlay-injected.json')
      expect(existsSync(mPath), 'v2 manifest 应落 OVERLAY_STATE_OUT').toBe(true)
      const m = JSON.parse(readFileSync(mPath, 'utf8'))
      expect(m.schemaVersion).toBe(2)
      expect(m.status).toBe('partial')
      // 非 applied 项全部是缺树跳过（无失败伪装、无其它 partial 成因）
      expect(m.patches.filter((p: any) => p.status !== 'applied')
        .every((p: any) => p.reason === 'absent-tree')).toBe(true)
      // 兼容投影只从 applied 派生
      const appliedHermes = m.patches.filter((p: any) => p.status === 'applied' && p.channel === 'hermes')
      expect(m.appliedPatches).toHaveLength(appliedHermes.length)
      expect(m.appliedZcodePatches).toEqual([])
    }, 300_000)

  it('缺席判定锚与汇总行在源码在位（防漂移；P1 Task 5 起注入执行面移驻 executor）', () => {
    // 判定锚：inject.mjs 的 absentTreeCheck（树在位双锚 hermes_cli/pyproject.toml）
    const src = readFileSync(join(ROOT, 'scripts/inject.mjs'), 'utf8')
    expect(src).toContain("resolve(hermesAgentRoot, 'hermes_cli')")
    expect(src).toContain("resolve(hermesAgentRoot, 'pyproject.toml')")
    // SKIP 行与汇总计数：executor.mjs（P1 平台核心的注入执行面）
    const exec = readFileSync(join(ROOT, 'scripts/platform/inject/executor.mjs'), 'utf8')
    expect(exec).toContain('tree absent, standalone/partial checkout')
    expect(exec).toContain('absentSkipCount')
    expect(exec).toContain('树缺席跳过（standalone/partial checkout 形态；全仓检出无此现象）')
  })
})
