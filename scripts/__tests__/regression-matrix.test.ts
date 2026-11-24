// 回归矩阵守门（2026-11-23 全面复盘批）。
// 锁四件事：①没有测试面游离在自动关口之外；②仓内发现的测试文件都能对应到一个测试面；
// ③矩阵里的 CI 引用可解析；④钩子、npm 入口与仓规确实接线。
// 另锁执行器语义：失败、未执行、超时分别记账，退出码遵循 config/cli-contract.json。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const mod = () => import('../regression-matrix.mjs')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

let tmp = ''
beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), 'regress-matrix-')) })
afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

describe('矩阵自身合法', () => {
  it('配置可加载且通过结构校验', async () => {
    const { loadMatrix, validateMatrix } = await mod()
    const matrix = loadMatrix(ROOT)
    expect(validateMatrix(matrix)).toEqual([])
    expect(matrix.axes.length).toBeGreaterThan(10)
  })

  it('id 唯一；每个测试面都由自动关口承接（推送前钩子或 CI）', async () => {
    const { loadMatrix } = await mod()
    const matrix = loadMatrix(ROOT)
    const ids = matrix.axes.map((a: any) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orphans = matrix.axes
      .filter((a: any) => (a.covers?.length ?? 0) > 0)
      .filter((a: any) => !['always', 'paths'].includes(a.prepush) && !a.ci)
      .map((a: any) => a.id)
    expect(orphans, '带 covers 的测试面必须由 prepush 或 ci 强制').toEqual([])
  })

  it('非测试面的检查项至少归属一个人工或自动关口', async () => {
    const { loadMatrix } = await mod()
    const matrix = loadMatrix(ROOT)
    const loose = matrix.axes
      .filter((a: any) => !(a.covers?.length ?? 0))
      .filter((a: any) => !['always', 'paths'].includes(a.prepush) && !a.ci && !(a.scopes ?? []).includes('merge'))
      .map((a: any) => a.id)
    expect(loose).toEqual([])
  })

  it('CI 引用的工作流文件存在且含锚点命令', async () => {
    const { loadMatrix } = await mod()
    const matrix = loadMatrix(ROOT)
    const missing: string[] = []
    for (const a of matrix.axes) {
      if (!a.ci) continue
      const file = resolve(ROOT, '.github/workflows', a.ci.workflow)
      if (!existsSync(file) || !readFileSync(file, 'utf8').includes(a.ci.anchor)) missing.push(`${a.id} → ${a.ci.workflow}#${a.ci.anchor}`)
    }
    expect(missing).toEqual([])
  })

  it('vitest 面的 covers 与根 vitest.config.ts 的 include 逐项一致', async () => {
    const { loadMatrix } = await mod()
    const axis = loadMatrix(ROOT).axes.find((a: any) => a.id === 'vitest')
    const m = /include:\s*\[([^\]]*)\]/.exec(read('vitest.config.ts'))
    expect(m).not.toBeNull()
    const include = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()
    expect([...axis.covers].sort()).toEqual(include)
  })
})

describe('测试文件发现', () => {
  // vendor 体量大，清单远超子进程默认的 1MB 输出缓冲。
  const tracked = () => execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean)

  it('仓内每个已跟踪的测试文件都能对应到一个测试面', async () => {
    const { loadMatrix, discoverUncovered } = await mod()
    const uncovered = discoverUncovered(loadMatrix(ROOT), tracked())
    expect(uncovered, `未登记的测试文件：\n${uncovered.join('\n')}`).toEqual([])
  })

  it('新增一个未登记的测试目录会被发现规则抓住', async () => {
    const { loadMatrix, discoverUncovered } = await mod()
    const uncovered = discoverUncovered(loadMatrix(ROOT), ['custom/a.test.ts', 'tools/tests/foo.test.ts', 'vendor/x.test.ts', 'team/profiles/p/plugins/x/tests/test_x.py'])
    expect(uncovered).toEqual(['tools/tests/foo.test.ts'])
  })
})

describe('测试面选择', () => {
  const ids = (sel: any) => sel.axes.map((x: any) => x.axis.id)

  it('推送前档：无相关变更时只跑 always 面', async () => {
    const { loadMatrix, selectAxes } = await mod()
    const matrix = loadMatrix(ROOT)
    const always = matrix.axes.filter((a: any) => a.prepush === 'always').map((a: any) => a.id)
    expect(ids(selectAxes(matrix, { scope: 'prepush', changed: [] }))).toEqual(always)
    expect(ids(selectAxes(matrix, { scope: 'prepush', changed: ['docs/superpowers/specs/x.md'] }))).toEqual(always)
  })

  it('推送前档：变更命中 paths 面的路径时把它带上', async () => {
    const { loadMatrix, selectAxes } = await mod()
    const matrix = loadMatrix(ROOT)
    const always = matrix.axes.filter((a: any) => a.prepush === 'always').map((a: any) => a.id)
    const ycode = ['yc-typecheck', 'yc-test-eng', 'yc-db-schema', 'yc-lint']
    expect(ids(selectAxes(matrix, { scope: 'prepush', changed: ['zcode-patches/012-android-jdk-major-check.patch'] }))).toEqual([...always, ...ycode])
    // 执行顺序即矩阵登记顺序（qgate 登记在 always 面之前）。
    expect(ids(selectAxes(matrix, { scope: 'prepush', changed: ['zcode-patches/series', 'custom/qgate/src/x.ts'] }))).toEqual(['qgate', ...always, ...ycode])
    expect(ids(selectAxes(matrix, { scope: 'prepush', changed: ['skills/swarm-yuan/assets/precheck.sh'] }))).toEqual([...always, 'yuan-registry'])
  })

  it('合并前档与全量档按 scopes 取面；显式 --axis 不受档位与路径限制', async () => {
    const { loadMatrix, selectAxes } = await mod()
    const matrix = loadMatrix(ROOT)
    expect(ids(selectAxes(matrix, { scope: 'merge' }))).toEqual(matrix.axes.filter((a: any) => a.scopes.includes('merge')).map((a: any) => a.id))
    expect(ids(selectAxes(matrix, { scope: 'full' }))).toEqual(matrix.axes.map((a: any) => a.id))
    expect(ids(selectAxes(matrix, { scope: 'prepush', axisIds: ['yc-lint', 'yuan-sweep'] }))).toEqual(['yc-lint', 'yuan-sweep'])
  })

  it('显式指定不存在的测试面是用法错误', async () => {
    const { loadMatrix, selectAxes } = await mod()
    expect(() => selectAxes(loadMatrix(ROOT), { scope: 'prepush', axisIds: ['no-such-axis'] })).toThrowError(expect.objectContaining({ category: 'usage' }))
  })
})

describe('执行器语义（真实子进程）', () => {
  const fixture = (over: Record<string, unknown>) => ({ id: 'fx', title: '夹具', scopes: ['prepush'], prepush: 'always', covers: [], ci: null, run: { argv: ['node', '-e', 'process.exit(0)'], timeoutMs: 20000 }, ...over })
  const opts = () => ({ root: tmp, env: { ...process.env }, python: 'python3', stream: null })

  it('退出码 0 记通过；非 0 记失败并带退出码', async () => {
    const { runAxis } = await mod()
    const ok = await runAxis(fixture({}), opts())
    expect(ok.status).toBe('passed')
    const bad = await runAxis(fixture({ run: { argv: ['node', '-e', 'console.error("boom"); process.exit(3)'], timeoutMs: 20000 } }), opts())
    expect(bad.status).toBe('failed')
    expect(bad.exitCode).toBe(3)
    expect(bad.tail).toContain('boom')
  })

  it('命令不存在记未执行（不是失败，更不是通过）', async () => {
    const { runAxis } = await mod()
    const r = await runAxis(fixture({ run: { argv: ['definitely-not-a-binary-xyz', '--version'], timeoutMs: 20000 } }), opts())
    expect(r.status).toBe('not_executed')
    expect(r.reason).toContain('command-not-found')
  })

  it('超时记失败并说明原因', async () => {
    const { runAxis } = await mod()
    const r = await runAxis(fixture({ run: { argv: ['node', '-e', 'setTimeout(() => {}, 5000)'], timeoutMs: 300 } }), opts())
    expect(r.status).toBe('failed')
    expect(r.reason).toContain('timeout')
  })

  it('前置步骤失败或命令缺席 → 整面未执行', async () => {
    const { runAxis } = await mod()
    const r = await runAxis(fixture({ setup: [{ argv: ['definitely-not-a-binary-xyz'], timeoutMs: 20000 }] }), opts())
    expect(r.status).toBe('not_executed')
    expect(r.reason).toContain('setup')
    const f = await runAxis(fixture({ setup: [{ argv: ['node', '-e', 'process.exit(7)'], timeoutMs: 20000 }] }), opts())
    expect(f.status).toBe('not_executed')
    expect(f.reason).toContain('setup-failed')
  })

  it('占位符替换：${PYTHON} 与 ${REPO_ROOT}，环境变量与 cwd 生效', async () => {
    const { runAxis } = await mod()
    mkdirSync(join(tmp, 'sub'), { recursive: true })
    // macOS 的临时目录经符号链接，子进程报告的是真实路径，右侧同样取真实路径。
    const r = await runAxis(
      fixture({ run: { cwd: 'sub', argv: ['${PYTHON}', '-c', 'import os,sys; sys.exit(0 if os.getcwd()==os.path.realpath(os.path.join(os.environ["R_ROOT"], "sub")) and os.environ["FX"]=="1" else 9)'], env: { FX: '1', R_ROOT: '${REPO_ROOT}' }, timeoutMs: 20000 } }),
      opts(),
    )
    expect([r.status, r.exitCode, r.reason]).toEqual(['passed', 0, null])
  })

  // 2026-11-23 真实树实跑抓到：runPlan 曾把解释器「解析结果对象」而非路径传给各面，
  // 单面调用 runAxis 的用例覆盖不到这条装配线。
  it('runPlan 把解析到的解释器路径传给各面（经真实解释器执行）', async () => {
    const { runPlan } = await mod()
    const where = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' })
    expect(where.status, where.stderr).toBe(0)
    const python3 = where.stdout.trim()
    const axis = fixture({ run: { argv: ['${PYTHON}', '-c', 'import os,sys; sys.exit(0 if sys.executable==os.environ["FX_PY"] else 9)'], timeoutMs: 20000 } })
    const matrix = { python: { candidates: [{ source: 'fx', path: '${FX_PY}' }], fallback: null }, axes: [axis] }
    const results = await runPlan(matrix, { scope: 'prepush', axes: [{ axis, reason: 'always' }] }, { root: tmp, env: { ...process.env, FX_PY: python3 }, stream: null })
    expect([results[0].status, results[0].reason]).toEqual(['passed', null])
  })

  // 2026-11-24 事故：推送前钩子里跑推演门，夹具继承 GIT_DIR 后改写了真实仓库并推到远端。
  it('测试面的子进程不继承 GIT_ 开头的环境变量', async () => {
    const { runPlan, scrubGitEnv } = await mod()
    expect(scrubGitEnv({ GIT_DIR: '/real/.git', GIT_WORK_TREE: '/real', PATH: '/bin', HOME: '/h' })).toEqual({ PATH: '/bin', HOME: '/h' })
    const axis = fixture({ run: { argv: ['node', '-e', 'process.exit(process.env.GIT_DIR || process.env.GIT_INDEX_FILE ? 9 : 0)'], timeoutMs: 20000 } })
    const matrix = { python: { candidates: [], fallback: null }, axes: [axis] }
    const results = await runPlan(matrix, { scope: 'prepush', axes: [{ axis, reason: 'always' }] }, {
      root: tmp, env: { PATH: process.env.PATH, GIT_DIR: '/real/.git', GIT_INDEX_FILE: '/real/.git/index' }, stream: null,
    })
    expect([results[0].status, results[0].reason]).toEqual(['passed', null])
  })

  it('推演门入口脚本在起始处清掉 git 内部变量（直接调用脚本也受保护）', () => {
    const gates = read('simharness/tests/run-gates.sh')
    const unsetAt = gates.search(/^unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE/m)
    const firstWork = gates.search(/^for t in /m)
    expect(unsetAt).toBeGreaterThan(0)
    expect(unsetAt).toBeLessThan(firstWork)
  })

  it('退出码映射：全过 0；有失败 1；仅未执行 2；两者兼有 4', async () => {
    const { overallExit } = await mod()
    const r = (status: string) => ({ status })
    expect(overallExit([r('passed')]).exitCode).toBe(0)
    expect(overallExit([r('passed'), r('failed')]).exitCode).toBe(1)
    expect(overallExit([r('not_executed')]).exitCode).toBe(2)
    expect(overallExit([r('not_executed'), r('failed')]).exitCode).toBe(4)
  })

  it('解释器解析：显式 env 优先，文件不存在则顺延，全空返回 null', async () => {
    const { resolvePython } = await mod()
    const matrix = { python: { candidates: [{ source: 'env', path: '${AISTUDIO_PYTHON}' }, { source: 'file', path: '${HOME}/definitely-missing/bin/python' }], fallback: null } }
    expect(resolvePython(matrix, { AISTUDIO_PYTHON: process.execPath, HOME: tmp })).toEqual({ python: process.execPath, source: 'env' })
    expect(resolvePython(matrix, { AISTUDIO_PYTHON: '/nope/python', HOME: tmp })).toBeNull()
  })
})

describe('接线', () => {
  it('推送前钩子确实调用矩阵的推送前档', () => {
    expect(read('.swarm-yuan/hooks/pre-push')).toContain('scripts/regression-matrix.mjs run --scope prepush')
  })

  it('npm 入口与仓规指向同一入口', () => {
    expect(JSON.parse(read('package.json')).scripts.regress).toBe('node scripts/regression-matrix.mjs')
    expect(read('AGENTS.md')).toContain('npm run regress -- --scope merge')
    expect(read('docs/DESIGN.md')).toContain('config/regression-matrix.json')
  })

  it('真进程：省略子命令即执行（文档入口 npm run regress -- --scope merge 可用）', () => {
    const script = resolve(ROOT, 'scripts/regression-matrix.mjs')
    const run = spawnSync(process.execPath, [script, '--axis', 'governance-budget', '--format', 'json'], { cwd: ROOT, encoding: 'utf8' })
    expect(run.status, run.stderr.slice(-400)).toBe(0)
    const envelope = JSON.parse(run.stdout)
    expect(envelope.status).toBe('ok')
    expect(envelope.data.results.map((r: any) => r.id)).toEqual(['governance-budget'])
  })

  it('真进程：plan 的 JSON 输出可整段解析，run 指定不存在的面退出 3 且 stderr 是信封', async () => {
    const script = resolve(ROOT, 'scripts/regression-matrix.mjs')
    const plan = spawnSync(process.execPath, [script, 'plan', '--scope', 'prepush', '--format', 'json'], { cwd: ROOT, encoding: 'utf8' })
    expect(plan.status, plan.stderr).toBe(0)
    const envelope = JSON.parse(plan.stdout)
    expect(envelope.schema_version).toBe(1)
    expect(envelope.data.axes.map((a: any) => a.id)).toContain('sim-gates')
    const bad = spawnSync(process.execPath, [script, 'run', '--axis', 'no-such-axis', '--format', 'json'], { cwd: ROOT, encoding: 'utf8' })
    expect(bad.status).toBe(3)
    expect(bad.stdout).toBe('')
    const err = JSON.parse(bad.stderr.trim().split('\n').pop()!)
    expect(err.error.category).toBe('usage')
    expect(err.error.remediation).toBeTruthy()
  })
})
