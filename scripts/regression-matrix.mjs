#!/usr/bin/env node
// 回归矩阵执行器：按 config/regression-matrix.json 规划并执行各测试面。
// 矩阵是「有哪些测试面、各由哪条命令跑、在哪个关口必须跑」的唯一事实源；本文件只做
// 选择、执行与记账，不内嵌任何测试面清单。
// 契约（config/cli-contract.json）：--format 显式选择；JSON 模式 stdout 只出结果信封，
// 进度与子进程输出走 stderr；退出码 0 全过／1 有失败／2 环境不满足未执行／3 用法错误／
// 4 失败与未执行兼有。未执行不得记成通过，也不得静默跳过。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CliError, EXIT, buildResult, emitResult, fail, parseArgv, partialResult, redactSecrets, usageError,
} from './lib/cli-contract.mjs'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SCOPES = Object.freeze(['prepush', 'merge', 'full'])
const COMMANDS = Object.freeze(['plan', 'run'])
const PREPUSH_MODES = Object.freeze(['always', 'paths', 'never'])
const TAIL_LINES = 60

export function loadMatrix(root = REPO_ROOT) {
  let raw
  try {
    raw = readFileSync(resolve(root, 'config/regression-matrix.json'), 'utf8')
  } catch (err) {
    throw new CliError('config', `config/regression-matrix.json 不可读：${err.message}`, '在仓库根执行，或确认该文件未被删除')
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new CliError('config', `config/regression-matrix.json 不是合法 JSON：${err.message}`, '修正该文件的 JSON 语法后重试')
  }
}

export function validateMatrix(matrix) {
  const problems = []
  if (matrix?.schema_version !== 1) problems.push('schema_version 必须为 1')
  if (!Array.isArray(matrix?.axes) || matrix.axes.length === 0) problems.push('axes 必须是非空数组')
  const ids = new Set()
  for (const axis of matrix?.axes ?? []) {
    const where = `测试面 ${axis?.id ?? '(no-id)'}`
    if (!/^[a-z0-9][a-z0-9-]*$/.test(axis?.id ?? '')) problems.push(`${where}: id 须为 kebab-case`)
    if (ids.has(axis?.id)) problems.push(`${where}: id 重复`)
    ids.add(axis?.id)
    if (!axis?.title) problems.push(`${where}: 缺 title`)
    const scopes = axis?.scopes ?? []
    if (scopes.length === 0 || scopes.some((s) => !SCOPES.includes(s))) problems.push(`${where}: scopes 须为 ${SCOPES.join('|')} 的非空子集`)
    if (!PREPUSH_MODES.includes(axis?.prepush)) problems.push(`${where}: prepush 须为 ${PREPUSH_MODES.join('|')}`)
    if (axis?.prepush !== 'never' && !scopes.includes('prepush')) problems.push(`${where}: prepush≠never 时 scopes 须含 prepush`)
    if (axis?.prepush === 'paths' && !(axis.paths?.length)) problems.push(`${where}: prepush=paths 须声明 paths`)
    const run = axis?.run
    if (!run || (!run.argv && !run.steps?.length)) problems.push(`${where}: 缺 run.argv 或 run.steps`)
    if (!(run?.timeoutMs > 0)) problems.push(`${where}: 缺 run.timeoutMs`)
    if (!Array.isArray(axis?.covers ?? [])) problems.push(`${where}: covers 须为数组`)
    if (axis?.ci != null && !(axis.ci.workflow && axis.ci.anchor)) problems.push(`${where}: ci 须同时含 workflow 与 anchor`)
    for (const key of ['paths', 'covers']) {
      for (const glob of axis?.[key] ?? []) {
        try { globToRegExp(glob) } catch { problems.push(`${where}: 非法 glob ${glob}`) }
      }
    }
  }
  for (const axis of matrix?.axes ?? []) {
    if (axis?.requires && !ids.has(axis.requires)) problems.push(`测试面 ${axis.id}: requires 指向不存在的 ${axis.requires}`)
  }
  return problems
}

// 仓内 glob：双星可跨目录，单星不跨目录；"a、" + 双星 + "、b" 允许零层目录。
// （示例不写成路径字面量：其中的星号加斜杠会提前结束注释。）
export function globToRegExp(glob) {
  let source = ''
  let i = 0
  while (i < glob.length) {
    const char = glob[i]
    if (char === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          source += '(?:[^/]+/)*'
          i += 3
        } else {
          source += '.*'
          i += 2
        }
      } else {
        source += '[^/]*'
        i += 1
      }
      continue
    }
    source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    i += 1
  }
  return new RegExp(`^${source}$`)
}

const cache = new Map()
const matcher = (glob) => {
  if (!cache.has(glob)) cache.set(glob, globToRegExp(glob))
  return cache.get(glob)
}

export function matchesAny(path, globs) {
  return (globs ?? []).some((glob) => matcher(glob).test(path))
}

/** 在给定文件清单里找出「像测试、未被排除、又不属于任何测试面 covers」的文件。 */
export function discoverUncovered(matrix, files) {
  const discovery = matrix.discovery ?? { patterns: [], exclude: [] }
  const include = discovery.patterns.map(globToRegExp)
  const exclude = discovery.exclude.map(globToRegExp)
  const covered = matrix.axes.flatMap((axis) => (axis.covers ?? []).map(globToRegExp))
  return files.filter((file) =>
    !exclude.some((re) => re.test(file))
    && include.some((re) => re.test(file))
    && !covered.some((re) => re.test(file)))
}

export function selectAxes(matrix, { scope = 'prepush', changed = [], axisIds = [] } = {}) {
  if (!SCOPES.includes(scope)) throw usageError(`未知档位 ${scope}`, `--scope 只接受 ${SCOPES.join('|')}`)
  if (axisIds.length) {
    const known = new Map(matrix.axes.map((axis) => [axis.id, axis]))
    const unknown = axisIds.filter((id) => !known.has(id))
    if (unknown.length) {
      throw usageError(`未登记的测试面：${unknown.join(', ')}`, `可用测试面见 node scripts/regression-matrix.mjs plan --scope full --format json`)
    }
    return { scope, axes: axisIds.map((id) => ({ axis: known.get(id), reason: 'explicit' })) }
  }
  const axes = []
  for (const axis of matrix.axes) {
    if (!(axis.scopes ?? []).includes(scope)) continue
    if (scope === 'prepush' && axis.prepush === 'paths') {
      if (!matchesAnyChanged(changed, axis.paths ?? [])) continue
      axes.push({ axis, reason: 'paths' })
      continue
    }
    axes.push({ axis, reason: scope === 'prepush' ? 'always' : 'scope' })
  }
  return { scope, axes }
}

function matchesAnyChanged(changed, globs) {
  return changed.some((path) => matchesAny(path, globs))
}

/** 显式选面时把被依赖的面补到前面（scope 档位运行时它们本就同档，不会重复）。 */
export function expandRequires(matrix, axes) {
  const byId = new Map(matrix.axes.map((axis) => [axis.id, axis]))
  const out = []
  const seen = new Set()
  const add = (axis) => {
    if (seen.has(axis.id)) return
    seen.add(axis.id)
    if (axis.requires) {
      const required = byId.get(axis.requires)
      if (required) add(required)
    }
    out.push(axis)
  }
  axes.forEach(add)
  return out
}

/** pytest 面的解释器：按矩阵声明序取第一个存在的；全空返回 null（调用方记未执行）。 */
export function resolvePython(matrix, env = process.env) {
  const substitute = (text) => text.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, key) => env[key] ?? '')
  for (const candidate of matrix.python?.candidates ?? []) {
    const path = substitute(candidate.path)
    if (path && existsSync(path)) return { python: path, source: candidate.source }
  }
  const fallback = matrix.python?.fallback
  if (fallback) {
    const probe = spawnSync(fallback.command, fallback.probe ?? [], { encoding: 'utf8' })
    if (probe.status === 0) return { python: fallback.command, source: fallback.source }
  }
  return null
}

function runCommand({ argv, cwd, env, timeoutMs, stream }) {
  return new Promise((done) => {
    const started = Date.now()
    const tail = []
    let size = 0
    const absorb = (chunk) => {
      const text = chunk.toString()
      tail.push(text)
      size += text.length
      while (size > 16_000 && tail.length > 1) size -= tail.shift().length
      if (stream) stream(text)
    }
    let child
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd, env, stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })
    } catch (err) {
      done({ exitCode: null, signal: null, spawnError: err, timedOut: false, durationMs: 0, tail: '' })
      return
    }
    let settled = false
    let timedOut = false
    let spawnError = null
    const timer = setTimeout(() => {
      timedOut = true
      try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    }, timeoutMs)
    const settle = (exitCode, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const text = tail.join('')
      done({
        exitCode, signal, spawnError, timedOut,
        durationMs: Date.now() - started,
        tail: text.split('\n').slice(-TAIL_LINES).join('\n').trim(),
      })
    }
    child.stdout.on('data', absorb)
    child.stderr.on('data', absorb)
    child.on('error', (err) => { spawnError = err; settle(null, null) })
    child.on('close', (code, signal) => settle(code, signal))
  })
}

const fillWith = (root, python) => (text) =>
  String(text).replace(/\$\{REPO_ROOT\}/g, root).replace(/\$\{PYTHON\}/g, python ?? '')
const fillEnv = (env, fill) => Object.fromEntries(Object.entries(env ?? {}).map(([k, v]) => [k, fill(v)]))

export async function runAxis(axis, { root, env = process.env, python = null, stream = null }) {
  const started = Date.now()
  const fill = fillWith(root, python)
  const finish = (status, extra = {}) => ({ id: axis.id, title: axis.title, status, durationMs: Date.now() - started, exitCode: null, reason: null, tail: '', ...extra })

  if (JSON.stringify(axis).includes('${PYTHON}') && !python) return finish('not_executed', { reason: 'python-unresolved' })

  for (const step of axis.setup ?? []) {
    const run = await runCommand({
      argv: step.argv.map(fill),
      cwd: resolve(root, step.cwd ?? '.'),
      env: { ...env, ...fillEnv(step.env, fill) },
      timeoutMs: step.timeoutMs ?? axis.run.timeoutMs,
      stream,
    })
    if (run.spawnError) return finish('not_executed', { reason: `setup-not-executed: ${step.argv.join(' ')}（${run.spawnError.code ?? run.spawnError.message}）`, tail: run.tail })
    if (run.timedOut || run.exitCode !== 0) {
      return finish('not_executed', { reason: `setup-failed: ${step.argv.join(' ')}（${run.timedOut ? '超时' : `退出码 ${run.exitCode}`}）`, tail: run.tail })
    }
  }

  const steps = axis.run.steps ?? [axis.run.argv]
  let last = null
  for (const raw of steps) {
    const argv = raw.map(fill)
    last = await runCommand({
      argv,
      cwd: resolve(root, axis.run.cwd ?? '.'),
      env: { ...env, ...fillEnv(axis.run.env, fill) },
      timeoutMs: axis.run.timeoutMs,
      stream,
    })
    if (last.spawnError) return finish('not_executed', { reason: `command-not-found: ${argv[0]}（${last.spawnError.code ?? last.spawnError.message}）`, tail: last.tail })
    if (last.timedOut) return finish('failed', { reason: `timeout（上限 ${axis.run.timeoutMs}ms）`, tail: last.tail })
    if (last.exitCode !== 0) {
      return finish('failed', { reason: `退出码 ${last.exitCode}${last.signal ? `，信号 ${last.signal}` : ''}`, exitCode: last.exitCode, tail: last.tail })
    }
  }
  return finish('passed', { exitCode: 0, tail: last?.tail ?? '' })
}

export function overallExit(results) {
  const failed = results.filter((r) => r.status === 'failed')
  const notExecuted = results.filter((r) => r.status === 'not_executed')
  const names = (list) => list.map((r) => r.id).join(', ')
  if (failed.length && notExecuted.length) {
    return {
      status: 'completed_with_errors', exitCode: EXIT.partial, error: null,
      failures: [
        ...failed.map((r) => ({ axis: r.id, kind: 'failed', reason: r.reason })),
        ...notExecuted.map((r) => ({ axis: r.id, kind: 'not_executed', reason: r.reason })),
      ],
    }
  }
  if (failed.length) {
    return {
      status: 'failed', exitCode: EXIT.business_failure, failures: [],
      error: {
        category: 'gate_failed',
        reason: `${failed.length} 个测试面失败：${names(failed)}`,
        remediation: '按输出尾部定位失败项，修复后重跑同一条命令；单面复跑可加 --axis <id>。',
      },
    }
  }
  if (notExecuted.length) {
    return {
      status: 'failed', exitCode: EXIT.environment, failures: [],
      error: {
        category: 'environment',
        reason: `${notExecuted.length} 个测试面未执行：${names(notExecuted)}（${notExecuted.map((r) => `${r.id}=${r.reason}`).join('；')}）`,
        remediation: '未执行不算通过：按各面 reason 补齐环境（缺解释器设 AISTUDIO_PYTHON 或安装 hermes venv；缺命令先装对应工具链），再重跑。',
      },
    }
  }
  return { status: 'ok', exitCode: EXIT.ok, error: null, failures: [] }
}

// git 钩子会把 GIT_DIR 等内部变量传给子进程。测试夹具自带 git 操作（自建仓库、改名分支、
// 截断历史），继承这些变量后不再自建仓库，操作会落到调用方所在的真实仓库与其远端
// （2026-11-24 事故实录：推送前钩子里跑推演门，夹具改写了本仓 main 并推到了远端）。
// 测试面的子进程一律不继承 GIT_ 开头的变量，按工作目录自行发现仓库，与普通终端一致。
export function scrubGitEnv(env) {
  return Object.fromEntries(Object.entries(env ?? {}).filter(([key]) => !key.startsWith('GIT_')))
}

export async function runPlan(matrix, selection, { root, env = process.env, onEvent = null, stream = null } = {}) {
  const python = resolvePython(matrix, env)?.python ?? null
  const childEnv = scrubGitEnv(env)
  const results = []
  for (const axis of expandRequires(matrix, selection.axes.map((item) => item.axis))) {
    onEvent?.({ event: 'started', axis: axis.id, title: axis.title })
    const result = await runAxis(axis, { root, env: childEnv, python, stream })
    results.push(result)
    onEvent?.({ event: 'item_failed', axis: axis.id, status: result.status, reason: result.reason, durationMs: result.durationMs })
  }
  return results
}

function readChanged(spec) {
  if (!spec) return []
  if (!spec.startsWith('@')) return spec.split(',').map((s) => s.trim()).filter(Boolean)
  return readFileSync(spec.slice(1), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
}

function changedSince(base, root) {
  const out = spawnSync('git', ['-c', 'core.quotepath=off', 'diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' })
  if (out.status !== 0) throw usageError(`无法读取 ${base}...HEAD 的变更清单`, '确认 base 是已存在的提交或分支，例如 origin/main')
  return out.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
}

const USAGE = [
  '用法：node scripts/regression-matrix.mjs [plan|run] [选项]（省略子命令即执行）',
  '  --scope prepush|merge|full   档位（默认 prepush）',
  '  --changed a,b | --changed @file   变更路径清单；prepush 档据此决定 paths 面是否执行',
  '  --base <git-ref>             等价于 --changed 取 <base>...HEAD 的变更清单',
  '  --axis <id>                  显式指定测试面，可重复；不受档位与路径限制',
  '  --format human|json          输出格式（默认 human）',
  '  --events ndjson              进度事件流，与 --format json 互斥',
].join('\n')

/** parseArgv 对重复选项是后者覆盖；--axis 允许重复，先并成一份逗号清单再解析。 */
function mergeRepeated(argv, flag) {
  const out = []
  const collected = []
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag) {
      if (argv[i + 1] === undefined) throw usageError(`${flag} 缺少取值`, USAGE)
      collected.push(argv[i + 1])
      i += 1
    } else if (argv[i].startsWith(`${flag}=`)) {
      collected.push(argv[i].slice(flag.length + 1))
    } else {
      out.push(argv[i])
    }
  }
  if (collected.length) out.push(flag, collected.join(','))
  return out
}

export async function main(argv) {
  let format = 'human'
  let events = null
  try {
    const parsed = parseArgv(mergeRepeated(argv, '--axis'), { flags: ['--help'], options: ['--scope', '--changed', '--base', '--axis'] })
    format = parsed.format
    events = parsed.events
    const values = parsed.values
    // 省略子命令即执行：文档里的入口写法是 `npm run regress -- --scope merge`。
    const command = parsed.positionals[0] ?? 'run'
    const extra = parsed.positionals.slice(1)
    const axisIds = String(values.axis ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (values.help) {
      process.stderr.write(`${USAGE}\n`)
      return 0
    }
    if (!COMMANDS.includes(command)) throw usageError(`未知子命令 ${command}`, USAGE)
    if (extra.length) throw usageError(`多余参数 ${extra.join(' ')}`, USAGE)
    if (values.changed && values.base) throw usageError('--changed 与 --base 只能给一个', USAGE)

    const matrix = loadMatrix()
    const problems = validateMatrix(matrix)
    if (problems.length) {
      throw new CliError('config', `config/regression-matrix.json 不合法：${problems.join('；')}`, '按 scripts/__tests__/regression-matrix.test.ts 的结构约束修正矩阵')
    }
    const changed = values.base ? changedSince(values.base, REPO_ROOT) : readChanged(values.changed)
    const scope = values.scope ?? 'prepush'
    const selection = selectAxes(matrix, { scope, changed, axisIds })

    if (command === 'plan') {
      const data = {
        scope,
        changed: changed.length,
        axes: selection.axes.map(({ axis, reason }) => ({ id: axis.id, title: axis.title, reason })),
      }
      emitResult({ format, result: buildResult({ status: 'ok', summary: { scope, axes: data.axes.length }, data }), human: () => data.axes.map((a) => `${a.reason.padEnd(8)} ${a.id}  ${a.title}`).join('\n') })
      return 0
    }

    const emit = (event) => { if (events) emitEventLine(event) }
    const stream = events ? null : (text) => process.stderr.write(text)
    const note = (line) => { if (!events) process.stderr.write(`${line}\n`) }
    const results = await runPlan(matrix, selection, {
      root: REPO_ROOT,
      stream,
      onEvent: (event) => {
        if (event.event === 'started') {
          note(`[regress] ▶ ${event.axis}  ${event.title}`)
          emit({ ...event, event: 'started' })
          return
        }
        const mark = event.status === 'passed' ? '✓' : event.status === 'failed' ? '✗' : '⊘'
        note(`[regress] ${mark} ${event.axis}  ${Math.round(event.durationMs / 1000)}s${event.reason ? `  ${event.status}：${event.reason}` : ''}`)
        emit({ ...event, event: event.status === 'passed' ? 'progress' : 'item_failed' })
      },
    })
    const overall = overallExit(results)
    const counts = {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      notExecuted: results.filter((r) => r.status === 'not_executed').length,
    }
    const brief = `回归矩阵 ${scope}：${counts.total} 面，${counts.passed} 通过，${counts.failed} 失败，${counts.notExecuted} 未执行`
    const list = results.map((r) => ({ id: r.id, status: r.status, exitCode: r.exitCode, reason: redactSecrets(r.reason ?? ''), durationMs: r.durationMs }))

    if (events) {
      emitEventLine({ event: 'completed', scope, counts, status: overall.status, exitCode: overall.exitCode, results: list })
      return overall.exitCode
    }
    if (overall.status === 'completed_with_errors') {
      emitResult({ format, result: partialResult({ summary: { scope, ...counts }, data: { results: list } }), human: () => `${brief}\n${overall.failures.map((f) => `  ${f.kind === 'failed' ? '✗' : '⊘'} ${f.axis}  ${f.reason}`).join('\n')}` })
      return overall.exitCode
    }
    emitResult({
      format,
      result: buildResult({ status: overall.status, summary: { scope, ...counts }, data: { results: list }, error: overall.error ?? undefined }),
      human: () => (overall.error ? `${brief}\n  ${overall.error.reason}\n  修复：${overall.error.remediation}` : brief),
    })
    return overall.exitCode
  } catch (err) {
    return fail(err, { format: events ? 'human' : format })
  }
}

function emitEventLine(event) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code },
    (err) => { fail(err) },
  )
}
