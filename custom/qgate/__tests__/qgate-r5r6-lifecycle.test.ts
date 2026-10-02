// v0.3 R5/R6 守门：CLI 生命周期四命令 + Stop new-only 降级与会话基线。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { isNewOnly, writeSessionBaseline, stopBudgetState } from '../plugin/hooks/qgate-lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const distCli = join(here, '..', 'dist', 'cli.js')

function tmpProject(profile = 'vibe-fast'): string {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-r5r6-'))
  const qgateDir = join(dir, '.qgate')
  mkdirSync(qgateDir, { recursive: true })
  writeFileSync(join(qgateDir, 'qgate.yaml'), `profile: ${profile}\nclaims: []\n`)
  return dir
}

const run = (args: string[], cwd: string) => spawnSync('node', [distCli, ...args], { cwd, encoding: 'utf8', timeout: 60_000 })

describe('R6 new-only 降级判定', () => {
  it('既有失败+fresh → true；新失败/证据不新鲜/INCONCLUSIVE/无基线 → false', () => {
    const state = { sessionId: 's1', blocks: 0, baseline: { at: 1, verdicts: { 'g.a': 'FAIL', 'g.b': 'FAIL' } } }
    expect(isNewOnly([{ gateId: 'g.a', verdict: 'FAIL', freshness: 'fresh' }, { gateId: 'g.b', verdict: 'FAIL', freshness: 'fresh' }], state)).toBe(true)
    expect(isNewOnly([{ gateId: 'g.new', verdict: 'FAIL', freshness: 'fresh' }], state)).toBe(false)          // 本会话新失败
    expect(isNewOnly([{ gateId: 'g.a', verdict: 'FAIL', freshness: 'stale' }], state)).toBe(false)            // 输入已变，须重跑再谈
    expect(isNewOnly([{ gateId: 'g.a', verdict: 'INCONCLUSIVE', freshness: 'fresh' }], state)).toBe(false)    // 证据不可得永不降级
    expect(isNewOnly([{ gateId: 'g.a', verdict: 'FAIL', freshness: 'fresh' }], { sessionId: 's1', blocks: 0 })).toBe(false)  // 无基线
    expect(isNewOnly([], state)).toBe(false)
  })

  it('writeSessionBaseline：逐门判定落 stop-state，同会话可读回', () => {
    const dir = tmpProject()
    try {
      writeSessionBaseline(join(dir, '.qgate'), 'sess-9', [{ gateId: 'g.a', verdict: 'PASS' }, { gateId: 'g.b', verdict: 'FAIL' }], 'feature-close')
      const state = stopBudgetState(join(dir, '.qgate'), 'sess-9')
      expect(state.baseline.verdicts).toEqual({ 'g.a': 'PASS', 'g.b': 'FAIL' })
      expect(state.blocks).toBe(0)
      // 换会话读 → 重置（不带旧基线）
      const fresh = stopBudgetState(join(dir, '.qgate'), 'sess-10')
      expect(fresh.baseline).toBeUndefined()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('R5 CLI 生命周期', () => {
  it('templates：列档位与门面', () => {
    const dir = tmpProject()
    try {
      const res = run(['templates'], dir)
      expect(res.status).toBe(0)
      expect(res.stdout).toContain('vibe-fast')
      expect(res.stdout).toContain('feature-close')
      expect(res.stdout).toContain('high-assurance')
      // vibe-fast 7 门：R8 收编 L0.convention-alignment + L1.symbol-grounding（L0/L1 域默认开，
      // 与 L0.registers 同待遇；symbol-grounding 逮幻觉 import 正是 lite 档核心风险）
      expect(res.stdout).toContain('→ 7 gates')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('inspect：诊断/登记清单/never-run 如实呈现', () => {
    const dir = tmpProject()
    try {
      const res = run(['inspect'], dir)
      expect(res.status).toBe(0)
      expect(res.stdout).toContain('diagnostics: clean')
      expect(res.stdout).toContain('– requirements.json')   // 未登记
      expect(res.stdout).toContain('never run')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('update --profile：切档生效并重载校验；未知档拒绝', () => {
    const dir = tmpProject()
    try {
      const ok = run(['update', '--profile', 'feature-close'], dir)
      expect(ok.status).toBe(0)
      expect(readFileSync(join(dir, '.qgate', 'qgate.yaml'), 'utf8')).toContain('profile: feature-close')
      const bad = run(['update', '--profile', 'nope'], dir)
      expect(bad.status).toBe(2)
      expect(bad.stderr).toContain('unknown profile')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('leftovers：干净 .qgate 无残留；散件被点名', () => {
    const dir = tmpProject()
    try {
      expect(run(['leftovers'], dir).stdout).toContain('no leftovers')
      writeFileSync(join(dir, '.qgate', 'stray-backup.json'), '{}')
      const res = run(['leftovers'], dir)
      expect(res.stdout).toContain('stray-backup.json')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
