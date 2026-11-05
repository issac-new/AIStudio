// harness-doctor 单元（2026-11-05 AI Native 吸收批 T4）：八项体检在假树上的
// 判定语义——fail 探针（sunset 过期）、warn 探针（sandbox/loop-limits 缺席）、
// 退出码契约（fail=1 / 无 fail=0）、--json 输出可解析。
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const SCRIPT = resolve(__dirname, '../harness-doctor.mjs')

function run(root: string, extra: string[] = []): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT, ...extra], {
      env: { ...process.env, DOCTOR_ROOT: root, PATH: process.env.PATH ?? '' },
      encoding: 'utf8',
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string }
    return { code: err.status ?? 1, out: err.stdout ?? '' }
  }
}

function baseTree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'doctor-'))
  mkdirSync(join(dir, 'vendor/hermes-agent/hermes_cli'), { recursive: true })
  mkdirSync(join(dir, 'vendor/hermes-agent/agent'), { recursive: true })
  mkdirSync(join(dir, 'team/profiles/p1'), { recursive: true })
  mkdirSync(join(dir, '.swarm-yuan'), { recursive: true })
  mkdirSync(join(dir, 'config'), { recursive: true })
  writeFileSync(join(dir, 'AGENTS.md'), '# A\n\n单一仓正本，行数足够。\n'.repeat(6))
  // 一致的迭代默认（T5 收敛在位）
  writeFileSync(join(dir, 'vendor/hermes-agent/hermes_cli/config.py'),
    'TURN_LIMIT_DEFAULT = 200\n')
  writeFileSync(join(dir, 'vendor/hermes-agent/hermes_cli/_parser.py'),
    'add("--max-turns", help="...(default: 200, or agent.max_turns in config)")\n')
  writeFileSync(join(dir, 'vendor/hermes-agent/cli.py'),
    'max_turns: Maximum tool-calling iterations (default: 200)\n')
  writeFileSync(join(dir, 'vendor/hermes-agent/run_agent.py'),
    'max_iterations: int = 200,\n')
  writeFileSync(join(dir, 'vendor/hermes-agent/agent/conversation_loop.py'),
    'static_system_prefix = 1\nwall_clock_exhausted = 1\n')
  writeFileSync(join(dir, 'team/profiles/p1/config.yaml'), 'approvals:\n  mode: "off"\n')
  writeFileSync(join(dir, '.swarm-yuan/spec-receipts.jsonl'),
    `${JSON.stringify({ at: new Date().toISOString(), spec: 'x', receipt: 'a'.repeat(40), commit: 'b'.repeat(40) })}\n`)
  writeFileSync(join(dir, 'config/mechanism-budget.json'),
    JSON.stringify({ limits: {}, changes: [], sunset: [{ id: 'x', owner: 'o', reviewBy: '2099-01-01', retireWhen: 'r' }] }))
  return dir
}

describe('harness-doctor 八项体检', () => {
  it('健康假树：0 fail 退出 0，八项齐报', () => {
    const dir = baseTree()
    try {
      const { code, out } = run(dir)
      expect(code, out).toBe(0)
      expect(out).toContain('8 项')
      expect(out).not.toContain('[sunset] ✗')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('sunset 过期 → fail 且退出码 1', () => {
    const dir = baseTree()
    try {
      writeFileSync(join(dir, 'config/mechanism-budget.json'),
        JSON.stringify({ limits: {}, changes: [], sunset: [{ id: 'old-thing', owner: 'o', reviewBy: '2020-01-01', retireWhen: 'r' }] }))
      const { code, out } = run(dir)
      expect(code).toBe(1)
      expect(out).toContain('old-thing')
      expect(out).toContain('复审过期')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('迭代默认值漂移 → loop-limits fail', () => {
    const dir = baseTree()
    try {
      writeFileSync(join(dir, 'vendor/hermes-agent/cli.py'),
        'max_turns: Maximum tool-calling iterations (default: 60)\n')
      const { code, out } = run(dir)
      expect(code).toBe(1)
      expect(out).toContain('四方不一致')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('vendor 缺席 → loop-limits/cache-layout 降 warn 不 fail（未注入态合法）', () => {
    const dir = baseTree()
    try {
      rmSync(join(dir, 'vendor'), { recursive: true, force: true })
      const { code } = run(dir)
      expect(code).toBe(0) // warn 不抬退出码
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('--json 输出可解析且 ok/fails 字段在位', () => {
    const dir = baseTree()
    try {
      const { out } = run(dir, ['--json'])
      const parsed = JSON.parse(out[out.indexOf('{') >= 0 ? out.indexOf('{') : 0] === undefined ? '{}' : out.slice(out.indexOf('{')))
      expect(parsed.ok).toBe(true)
      expect(parsed.findings.length).toBe(8)
      expect(typeof parsed.fails).toBe('number')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
