// 守门：typecheck:client 工具故障必须 INCONCLUSIVE 退出 2，不得静默当 0 错基线。
// 溯源：主会话实测 PATH=/nonexistent 时 `--check` 返回 exit 0 + INCONCLUSIVE 文案——
// 假阴性门（工具崩溃被当"通过"）。契约见 docs/superpowers/specs/2026-11-05-platform-rewrite-design.md
// §判定契约：缺席、崩溃、超时、信号退出或输出不可判定 → 统一 exit 2、不写基线。
//
// 测法：子进程直跑脚本本体（非 import 函数）——退出码 0/1/2 是本工具的核心契约，
// process.exit 语义只有真实子进程能忠实复现；import 化重构反而要模拟 exit 与路径上下文。
// 故障注入：临时 PATH 里放假 npx（脚本按平台取 npx/npx.cmd，execFileSync 走 PATH 解析）。
// 仅 POSIX：win32 分支取 npx.cmd，CI 也不在 Windows 跑本套件（swarm-yuan.yml 仅 bash -n）。
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SCRIPT = join(ROOT, 'scripts/typecheck-client-baseline.mjs')
const BASELINE = join(ROOT, 'config/typecheck-client-baseline.json')
const BASELINE_JSON = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { errors: 0 }

/** 造临时 PATH 目录并写入假 npx（shell 脚本，忽略入参，行为由 scriptBody 决定）。 */
function fakeNpxDir(scriptBody: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fake-npx-'))
  writeFileSync(join(dir, 'npx'), `#!/bin/sh\n${scriptBody}\n`)
  chmodSync(join(dir, 'npx'), 0o755)
  return dir
}

interface RunResult { status: number; stdout: string; stderr: string }

/**
 * 真实子进程直跑基线脚本。两种 PATH 注入：
 * - prepend：假 npx 目录前置到真实 PATH（假 npx 内部还要用 sleep/yes/head 等系统命令，
 *   整体替换 PATH 会让假 npx 自己先崩成 command-not-found，注入面失真——首轮实录）。
 * - PATH：整体替换（仅 ENOENT 用例需要——PATH 里必须完全没有 npx）。
 */
function runBaseline(opts: { prepend?: string; PATH?: string; args?: string[]; env?: Record<string, string> }): RunResult {
  const path = opts.PATH ?? (opts.prepend ? `${opts.prepend}:${process.env.PATH ?? ''}` : process.env.PATH)
  const r = spawnSync(process.execPath, [SCRIPT, ...(opts.args ?? [])], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PATH: path, ...opts.env },
  })
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** 基线文件指纹：内容 + mtime（mtime 变化即发生过写，内容相同也算污染）。 */
function baselineState(): { content: string; mtimeMs: number } | null {
  if (!existsSync(BASELINE)) return null
  const st = statSync(BASELINE)
  return { content: readFileSync(BASELINE, 'utf8'), mtimeMs: st.mtimeMs }
}

// 自愈护栏：若实现回归把 INCONCLUSIVE 误判为 conclusive，生成模式会真写基线文件
// （把 18 写成故障样例的假数）。每条用例先快照，afterEach 检测污染即回灌并还原
// mtime，保证测试失败不破坏工作树里的真实基线。
let before: ReturnType<typeof baselineState>

describe.skipIf(process.platform === 'win32')('typecheck:client 工具故障 INCONCLUSIVE 退出 2', () => {
  afterEach(() => {
    const now = baselineState()
    if (!before || !now) return
    if (now.content !== before.content) writeFileSync(BASELINE, before.content)
    if (now.mtimeMs !== before.mtimeMs) utimesSync(BASELINE, new Date(before.mtimeMs), new Date(before.mtimeMs))
  })

  /**
   * 生成模式故障注入的公共断言：exit 2 + INCONCLUSIVE + 基线内容与 mtime 不变。
   * reasonSub 锚定该用例对应的故障家族（ENOENT/ETIMEDOUT/ENOBUFS/signal=SIGKILL/status=127），
   * 防止"经崩溃兜底分支碰巧 exit 2"的空心通过——每类故障必须由它自己的分类分支判定。
   */
  function expectInconclusive(r: RunResult, reasonSub: string) {
    expect(r.status, `stdout=${r.stdout}\nstderr=${r.stderr}`).toBe(2)
    expect(r.stderr).toContain('INCONCLUSIVE')
    expect(r.stderr, `应命中故障家族 ${reasonSub}`).toContain(reasonSub)
    expect(baselineState(), '基线文件被意外写入或删除').toEqual(before)
  }

  it('崩溃（非零退出且无 TS 错误行）→ 生成模式 exit 2 + INCONCLUSIVE + 基线不写', () => {
    before = baselineState()
    expectInconclusive(runBaseline({ prepend: fakeNpxDir('echo "spawn exploded" >&2\nexit 127') }), 'status=127')
  })

  it('spawn ENOENT（PATH 中无 npx）→ 生成模式 exit 2 + INCONCLUSIVE + 基线不写', () => {
    before = baselineState()
    expectInconclusive(runBaseline({ PATH: mkdtempSync(join(tmpdir(), 'no-npx-')) }), 'code=ENOENT')
  })

  it('超时（先输出 TS 错误行后挂起）→ 优先 INCONCLUSIVE exit 2，不按残缺清单判定', () => {
    before = baselineState()
    expectInconclusive(runBaseline({
      prepend: fakeNpxDir('echo "src/a.ts(1,1): error TS2322: partial"\nsleep 5'),
      env: { TYPECHECK_CLIENT_TIMEOUT_MS: '400' },
    }), 'code=ETIMEDOUT')
  })

  it('信号退出（输出 TS 错误行后 kill -9）→ 优先 INCONCLUSIVE exit 2', () => {
    before = baselineState()
    expectInconclusive(runBaseline({
      prepend: fakeNpxDir('echo "src/a.ts(1,1): error TS2322: fake"\nkill -9 $$'),
    }), 'signal=SIGKILL')
  })

  // 64MiB maxBuffer 由脚本设定（与本用例解耦）；yes 灌 68MiB 的 TS 错误行触发截断
  it('maxBuffer 溢出（输出超 64MiB 的 TS 错误行被截断）→ 优先 INCONCLUSIVE exit 2', () => {
    before = baselineState()
    expectInconclusive(runBaseline({
      prepend: fakeNpxDir('yes "src/a.ts(1,1): error TS2322: flood" | head -c 68000000'),
    }), 'code=ENOBUFS')
  })

  it('崩溃 --check 门禁模式 → exit 2 + INCONCLUSIVE + 基线不写（不得静默放行）', () => {
    before = baselineState()
    expectInconclusive(runBaseline({
      prepend: fakeNpxDir('echo "spawn exploded" >&2\nexit 127'),
      args: ['--check'],
    }), 'status=127')
  })

  // ---------- 正常类型错误：既有 0/1 棘轮路径不回归 ----------
  // 假 npx 输出 N 条 error TS 行 + exit 1（tsc 有错时的真实形态）；N 相对基线动态取数，
  // Task 8 清偿下调基线后本组仍成立。
  function npxWithErrors(n: number): string {
    if (n <= 0) return 'exit 0'
    return `i=0\nwhile [ $i -lt ${n} ]; do echo "src/fake($i,1): error TS2322: probe"; i=$((i+1)); done\nexit 1`
  }

  it('超基线（基线+5 条）→ --check exit 1，样例可见，基线不动', () => {
    before = baselineState()
    const r = runBaseline({ prepend: fakeNpxDir(npxWithErrors(BASELINE_JSON.errors + 5)), args: ['--check'] })
    expect(r.status, `stdout=${r.stdout}\nstderr=${r.stderr}`).toBe(1)
    expect(r.stderr).toContain('棘轮')
    expect(r.stderr).toContain('src/fake(0,1): error TS2322')
    expect(baselineState()).toEqual(before)
  })

  it('基线内（max(0, 基线-5) 条）→ --check exit 0，基线不动', () => {
    before = baselineState()
    const r = runBaseline({
      prepend: fakeNpxDir(npxWithErrors(Math.max(0, BASELINE_JSON.errors - 5))),
      args: ['--check'],
    })
    expect(r.status, `stdout=${r.stdout}\nstderr=${r.stderr}`).toBe(0)
    expect(r.stdout).toContain('棘轮')
    expect(baselineState()).toEqual(before)
  })

  it('干净通过（exit 0 无输出）→ --check exit 0', () => {
    before = baselineState()
    const r = runBaseline({ prepend: fakeNpxDir('exit 0'), args: ['--check'] })
    expect(r.status, `stdout=${r.stdout}\nstderr=${r.stderr}`).toBe(0)
    expect(baselineState()).toEqual(before)
  })
})
