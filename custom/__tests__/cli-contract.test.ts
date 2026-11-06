// CLI 契约守门（2026-11-06 spec：2026-11-06-ai-friendly-cli-contract.md）。
// 三件事：①库单测；②JSON/Shell/Python 词表一致（漂移即红）；③棘轮与试点入口行为。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const CONTRACT_PATH = join(ROOT, 'config/cli-contract.json')
const LINT_LIB = join(ROOT, 'scripts/lib/cli-contract-lint.mjs')

// @ts-expect-error .mjs 无类型声明；vitest 只做转译，不做类型检查
const contractLib: any = await import(join(ROOT, 'scripts/lib/cli-contract.mjs'))
// @ts-expect-error 同上
const lintLib: any = await import(LINT_LIB)

const CONTRACT: any = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'))
const tempDirs: string[] = []
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe('契约单一事实源', () => {
  it('Node 实现与 config/cli-contract.json 一致', () => {
    expect(contractLib.CONTRACT_VERSION).toBe(CONTRACT.contract_version)
    expect([...contractLib.FORMATS]).toEqual(CONTRACT.formats)
    expect([...contractLib.STATUSES]).toEqual(CONTRACT.statuses)
    expect([...contractLib.ERROR_CATEGORIES]).toEqual(CONTRACT.error_categories)
    expect({ ...contractLib.EXIT }).toEqual(CONTRACT.exit_codes)
  })

  it('Shell 镜像常量与 JSON 一致（漂移即红）', () => {
    const sh = readFileSync(join(ROOT, 'simharness/mux/mx-contract.sh'), 'utf8')
    const num = (name: string) => Number(new RegExp(`^${name}=(\\d+)$`, 'm').exec(sh)?.[1])
    expect(num('MX_CONTRACT_VERSION')).toBe(CONTRACT.contract_version)
    expect(num('MX_EXIT_OK')).toBe(CONTRACT.exit_codes.ok)
    expect(num('MX_EXIT_BUSINESS')).toBe(CONTRACT.exit_codes.business_failure)
    expect(num('MX_EXIT_ENV')).toBe(CONTRACT.exit_codes.environment)
    expect(num('MX_EXIT_USAGE')).toBe(CONTRACT.exit_codes.usage)
    expect(num('MX_EXIT_PARTIAL')).toBe(CONTRACT.exit_codes.partial)
    const cats = /^MX_ERROR_CATEGORIES="([^"]+)"$/m.exec(sh)?.[1].split(/\s+/)
    expect(cats).toEqual(CONTRACT.error_categories)
    const events = /^MX_EVENT_NAMES="([^"]+)"$/m.exec(sh)?.[1].split(/\s+/)
    expect(events).toEqual(CONTRACT.event_names)
  })

  it('Python 镜像常量与 JSON 一致（漂移即红）', () => {
    const r = spawnSync('python3', ['-c', [
      'import json,sys',
      `sys.path.insert(0, ${JSON.stringify(join(ROOT, 'simharness/mux'))})`,
      'import mx_cli_contract as c',
      'print(json.dumps({"version":c.CONTRACT_VERSION,"formats":list(c.FORMATS),"statuses":list(c.STATUSES),',
      '"categories":list(c.ERROR_CATEGORIES),"events":list(c.EVENT_NAMES),"exit":c.EXIT}))',
    ].join('\n')], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    const py = JSON.parse(r.stdout)
    expect(py.version).toBe(CONTRACT.contract_version)
    expect(py.formats).toEqual(CONTRACT.formats)
    expect(py.statuses).toEqual(CONTRACT.statuses)
    expect(py.categories).toEqual(CONTRACT.error_categories)
    expect(py.events).toEqual(CONTRACT.event_names)
    expect(py.exit).toEqual(CONTRACT.exit_codes)
  })
})

describe('parseArgv / 结果信封 / 脱敏 / 配置分层', () => {
  it('显式 --format，未知格式与未知参数都是 usage；位置参数不被选项吃掉', () => {
    const ok = contractLib.parseArgv(['--format', 'json', 'run-1'], { options: ['--out'] })
    expect(ok.format).toBe('json')
    expect(ok.positionals).toEqual(['run-1'])
    expect(() => contractLib.parseArgv(['--format', 'yaml'])).toThrow(/未知格式/)
    expect(() => contractLib.parseArgv(['--bogus'])).toThrow(/未知参数/)
    expect(() => contractLib.parseArgv(['--out'], { options: ['--out'] })).toThrow(/缺少取值/)
  })

  it('--events ndjson 与 --format json 互斥', () => {
    expect(() =>
      contractLib.parseArgv(['--format', 'json', '--events', 'ndjson']),
    ).toThrow(/互斥/)
    const events = contractLib.parseArgv(['--events', 'ndjson'])
    expect(events.events).toBe('ndjson')
    expect(events.format).toBe('human')
  })

  it('信封自洽：failed 必须带 error，非 failed 不得带 error', () => {
    const failed = contractLib.buildResult({
      status: 'failed',
      error: { category: 'environment', reason: 'r', remediation: 'fix' },
    })
    expect(failed.error.category).toBe('environment')
    expect(() => contractLib.buildResult({ status: 'failed' })).toThrow(/必须携带 error/)
    expect(() =>
      contractLib.buildResult({ status: 'ok', error: { category: 'internal', reason: 'r', remediation: 'x' } }),
    ).toThrow(/不得携带 error/)
  })

  it('脱敏覆盖 sk-、Bearer、api_key/token 三种常见形态', () => {
    const text = contractLib.redactSecrets(
      'key=sk-abcdefgh12345678 Bearer abcdefghijklmnop api_key="deadbeef" token: zzzzyyyy',
    )
    expect(text).not.toContain('sk-abcdefgh12345678')
    expect(text).not.toContain('abcdefghijklmnop')
    expect(text).not.toContain('deadbeef')
    expect(text).not.toContain('zzzzyyyy')
    expect(text).toContain('sk-***')
  })

  it('configInspect 报告最终取值与来源层（CLI > env > default）', () => {
    const inspect = contractLib.configInspect([
      { source: 'cli:--base', value: undefined },
      { source: 'env:MX_BASE', value: 'http://env' },
      { source: 'default', value: 'http://default' },
    ])
    expect(inspect.resolved).toEqual({ value: 'http://env', source: 'env:MX_BASE' })
    expect(inspect.layers.map((l: any) => l.used)).toEqual([false, true, false])
  })

  it('fail() 在 json 模式向 stderr 写单行信封并返回契约退出码', () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      writes.push(String(chunk))
      return true
    })
    const code = contractLib.fail(
      new contractLib.CliError('auth_required', 'Missing auth state', 'Run auth init'),
      { format: 'json', exit: false },
    )
    spy.mockRestore()
    expect(code).toBe(CONTRACT.exit_codes.environment)
    const envelope = JSON.parse(writes.join('').trim())
    expect(envelope.status).toBe('failed')
    expect(envelope.error).toMatchObject({
      category: 'auth_required',
      reason: 'Missing auth state',
      remediation: 'Run auth init',
    })
  })
})

describe('棘轮检查器', () => {
  it('基线外新入口有违规即失败；基线内祖父项放行；修复项只告警', () => {
    const root = tempDir('cli-lint-')
    mkdirSync(join(root, 'scripts'), { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      scripts: { x: 'node scripts/x.mjs', good: 'node scripts/good.mjs' },
    }))
    writeFileSync(join(root, 'scripts/x.mjs'), 'console.log("hello")\nprocess.exit(0)\n')
    writeFileSync(join(root, 'scripts/good.mjs'), [
      "import { parseArgv, emitResult } from './lib/cli-contract.mjs'",
      'const cli = parseArgv(process.argv.slice(2))',
      'emitResult({ format: cli.format, result: { ok: true } })',
    ].join('\n'))

    const fresh = lintLib.checkCliContract({ root, baseline: null })
    const xProblems = fresh.problems.filter((p: string) => p.includes('scripts/x.mjs'))
    expect(xProblems.length).toBe(1)
    expect(fresh.problems.some((p: string) => p.includes('scripts/good.mjs'))).toBe(false)

    const grandfathered = lintLib.checkCliContract({
      root,
      baseline: {
        entries: {
          'scripts/x.mjs': ['no-contract', 'no-error-envelope', 'no-format', 'stdout-log'],
        },
      },
    })
    expect(grandfathered.problems).toEqual([])

    const healed = lintLib.checkCliContract({
      root,
      baseline: { entries: { 'scripts/x.mjs': ['no-contract', 'no-error-envelope', 'no-format', 'stdout-log', 'no-redact'] } },
    })
    expect(healed.warnings.join('\n')).toContain('基线可收紧')
  })
})

describe('试点入口行为（真实进程）', () => {
  it('mx-gate-timing.sh --format json 先于 RUN_ID 也能解析，stdout 可整段 JSON.parse', () => {
    const sim = tempDir('mx-gt-')
    const run = join(sim, 'runs/run-x')
    mkdirSync(join(run, 'evidence'), { recursive: true })
    writeFileSync(join(run, 'state.env'), 'g1_frozen=1\n')
    writeFileSync(join(run, 'evidence/scenario.log'), [
      '[mux 10:00:00] [真值] G1 需求冻结 ✓',
      '[mux 10:10:00] [真值] G2 结论 ✗',
      '[mux 10:30:00] [真值] G2 结论 ✓',
    ].join('\n'))
    const r = spawnSync('bash', [
      join(ROOT, 'simharness/mux/mx-gate-timing.sh'), '--format', 'json', 'run-x',
    ], { encoding: 'utf8', env: { ...process.env, AIPAY_SIM_ROOT: sim } })
    expect(r.status, r.stderr).toBe(0)
    const envelope = JSON.parse(r.stdout.trim())
    expect(envelope.schema_version).toBe(1)
    expect(envelope.status).toBe('ok')
    expect(envelope.summary.run).toBe('run-x')
    expect(envelope.summary.gates).toBeGreaterThanOrEqual(2)
    expect(envelope.data.gates.some((g: any) => g.gate === 'G2' && g.rounds >= 1)).toBe(true)
    expect(envelope.artifacts.tsv).toContain('gate-timing.tsv')
  })

  it('mx-gate-timing.sh 缺 RUN_ID → 退出 3，stderr 是 usage 信封', () => {
    const r = spawnSync('bash', [
      join(ROOT, 'simharness/mux/mx-gate-timing.sh'), '--format', 'json',
    ], { encoding: 'utf8' })
    expect(r.status).toBe(3)
    const envelope = JSON.parse(r.stderr.trim().split('\n').pop()!)
    expect(envelope.error.category).toBe('usage')
    expect(envelope.error.remediation).toContain('mx-gate-timing.sh')
  })

  it('mx-eval-summary.py：PASS=0/ok、GAP=4/completed_with_errors、FAIL=1/failed+gate_failed', () => {
    const dir = tempDir('mx-eval-')
    const out = join(dir, 'eval-summary.json')
    const writeVerdict = (body: any) => writeFileSync(join(dir, 'verdict.json'), JSON.stringify(body))
    const run = () => spawnSync('python3', [
      join(ROOT, 'simharness/mux/mx-eval-summary.py'), '--dir', dir, '--out', out,
      '--verdict-file', join(dir, 'verdict.json'), '--format', 'json',
    ], { encoding: 'utf8' })

    writeVerdict({ ok: true, verdict: 'pass', line: 'EVAL-GATE-PASS' })
    let r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout.trim()).status).toBe('ok')

    writeVerdict({ ok: true, verdict: 'gap', gaps: ['覆盖 0/7'], line: 'EVAL-GATE-GAP' })
    r = run()
    expect(r.status, r.stderr).toBe(4)
    const gap = JSON.parse(r.stdout.trim())
    expect(gap.status).toBe('completed_with_errors')
    expect(gap.data.gaps).toContain('覆盖 0/7')

    writeVerdict({ ok: true, verdict: 'fail', fails: ['红线'], line: 'EVAL-GATE-FAIL' })
    r = run()
    expect(r.status, r.stderr).toBe(1)
    const failed = JSON.parse(r.stdout.trim())
    expect(failed.status).toBe('failed')
    expect(failed.error.category).toBe('gate_failed')
    expect(failed.error.remediation).toContain('eval-summary.json')
  })

  it('mx-capability-probes.mjs 基座不可达：退出 2，stdout 信封带 upstream_unavailable 与修复建议', () => {
    const out = tempDir('probe-')
    const r = spawnSync(process.execPath, [
      join(ROOT, 'simharness/mux/mx-capability-probes.mjs'),
      '--base', 'http://127.0.0.1:9', '--out', out, '--format', 'json',
    ], { encoding: 'utf8', timeout: 60000 })
    expect(r.status, r.stderr).toBe(2)
    const envelope = JSON.parse(r.stdout.trim())
    expect(envelope.status).toBe('failed')
    expect(envelope.error.category).toBe('upstream_unavailable')
    expect(envelope.error.remediation).toContain('网关')
    expect(envelope.artifacts.report).toContain('capability-probes.json')
  })
})
