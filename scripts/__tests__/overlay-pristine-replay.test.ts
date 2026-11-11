import { describe, it, expect, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// 补丁系列 pristine 全量重放守门（2026-11-07 specs/2026-11-07-zcode-patches-pristine-replay.md）。
// 缺陷背景：zcode 002 在 3.17.1 轮重生成后，3.17.2 基线同步（474bc28da）「零重生成」
// 未跟补丁也未重放——fresh clone/worktree 的 inject 在 002 断链（blocked-by-failed 连锁
// 跳过 003-009），main 靠完成态清单增量跳过从未暴露，CI 又不跑 inject（qgate.yml 只
// install+tsc+vitest），缺陷静默存活四天。本守门在临时 worktree（=pristine）跑真实
// `npm run clean && npm run inject` 管线并断言清单 complete——任何 lane 的补丁×基线
// 漂移（同步批漏重生成）在此当场红。
// 注意：纯 `npm run inject` 的 runtime 部署是 DRY-RUN（宿主 ~/.hermes 不动；实测
// /tmp/inject-replay.log 2026-11-07），CI 环境无宿主也安全。
const REPO = resolve(__dirname, '..', '..')
const TMP_WT = join(tmpdir(), `overlay-replay-${process.pid}`)

function run(cmd: string, cwd: string) {
  return execSync(cmd, { cwd, encoding: 'utf8', timeout: 240_000, stdio: ['ignore', 'pipe', 'pipe'] })
}

// 临时 worktree 注册与删除走 git 通道（与 .claude/worktrees 同纪律；孤儿由 prune 兜底）。
// 超时 120s：全量套件并行满载下 git worktree remove --force 对大树可超 vitest 默认 10s
// 钩子时限（2026-11-11 zcode 3.18.0 同步批全量两连红实证：测试本体过、清理钩子超时假红）。
afterAll(() => {
  try { run('git worktree remove --force .', TMP_WT) } catch { /* 目录可能已被删 */ }
  try { execSync('git worktree prune', { cwd: REPO }) } catch { /* best-effort */ }
  rmSync(TMP_WT, { recursive: true, force: true })
}, 120_000)

describe('overlay 补丁系列 pristine 全量重放（三 lane 真管线）', () => {
  it('clean+inject 在 pristine worktree 达到 manifest complete（zcode 002-009 + patches 全系可应用）', () => {
    execSync('git worktree prune', { cwd: REPO })
    // detached HEAD：不建分支（守门只读性质，避免 CI 里留下分支引用）
    run(`git worktree add --detach "${TMP_WT}" HEAD`, REPO)

    // pristine 断言：worktree 的 vendor 从未被注入（无清单）
    expect(existsSync(join(TMP_WT, '.overlay-injected.json'))).toBe(false)

    // 真管线：clean（对 pristine 全是反向 WARN，良性）→ inject（全系列应用）
    run('npm run clean', TMP_WT)
    run('npm run inject', TMP_WT)

    const manifest = JSON.parse(readFileSync(join(TMP_WT, '.overlay-injected.json'), 'utf8'))
    expect(manifest.status).toBe('complete')
    const failed = (manifest.patches ?? []).filter((p: any) => p.status === 'failed')
    expect(failed, `失败补丁: ${failed.map((p: any) => p.name).join(', ')}`).toHaveLength(0)

    // 抽验本批缺陷点：zcode lane 8 枚全落、002 内容真在树里（importSessionV4 落盘）
    const applied = (manifest.patches ?? []).map((p: any) => p.name)
    for (const p of ['002-import-session-rpc.patch', '003-zcode-cua-live.patch', '009-claude-skills-compat-root.patch']) {
      expect(applied).toContain(p)
    }
    const validation = readFileSync(join(TMP_WT, 'vendor/zcode/packages/shared/src/validation.ts'), 'utf8')
    expect(validation).toContain('"claudeCode", "codex", "kimi"')
  }, 300_000)
})
