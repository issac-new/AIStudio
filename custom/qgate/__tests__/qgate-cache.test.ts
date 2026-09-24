// §49 缓存接线守门：同输入二跑命中（execution=cached），输入变化即 miss，缓存文件落盘。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runGate } from '../src/core/run.js'
import type { GateSpec } from '../src/core/types.js'

const spec = (over: Partial<GateSpec['spec']> = {}): GateSpec => ({
  apiVersion: 'qgate/v1alpha1',
  kind: 'Gate',
  metadata: { id: 't.gate', version: '0.1.0' },
  spec: {
    domain: 'L1',
    claims: ['c1'],
    triggers: ['task_close'],
    executors: [{ id: 'e1', type: 'command', command: ['true'], evidenceType: 'x' }],
    evidence: { required: ['x'] },
    policy: { failure: 'block', inconclusive: 'block', maxAgeHours: 24 },
    ...over,
  },
})

function tmpProject(): { dir: string; qgateDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-cache-'))
  const qgateDir = join(dir, '.qgate')
  mkdirSync(qgateDir, { recursive: true })
  return { dir, qgateDir }
}

describe('§49 缓存与增量执行（runGate 接线）', () => {
  it('同输入二跑：第二跑证据 execution=cached 且判定一致；缓存文件落 .qgate/cache/evidence/', async () => {
    const fx = tmpProject()
    try {
      const first = await runGate({ spec: spec(), trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: ['src/a.ts'] })
      expect(first.run.verdict).toBe('PASS')
      expect(first.evidence.every((e) => e.execution === 'exercised')).toBe(true)

      const second = await runGate({ spec: spec(), trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: ['src/a.ts'] })
      expect(second.run.verdict).toBe('PASS')
      expect(second.evidence.every((e) => e.execution === 'cached')).toBe(true)

      const cacheFiles = readdirSync(join(fx.qgateDir, 'cache', 'evidence'))
      expect(cacheFiles.length).toBeGreaterThanOrEqual(1)
    } finally {
      rmSync(fx.dir, { recursive: true, force: true })
    }
  })

  it('输入变化（变更集不同）→ key 漂移 → miss 重跑（exercised）', async () => {
    const fx = tmpProject()
    try {
      await runGate({ spec: spec(), trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: ['src/a.ts'] })
      const changed = await runGate({ spec: spec(), trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: ['src/b.ts'] })
      expect(changed.evidence.every((e) => e.execution === 'exercised')).toBe(true)

      // 门配置变化（换 executor）→ miss
      const other = spec({ executors: [{ id: 'e2', type: 'command', command: ['true'], evidenceType: 'x' }] })
      const reconfigured = await runGate({ spec: other, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: ['src/b.ts'] })
      expect(reconfigured.evidence.every((e) => e.execution === 'exercised')).toBe(true)
    } finally {
      rmSync(fx.dir, { recursive: true, force: true })
    }
  })

  it('缓存的 FAIL 语义保持：坏门二跑仍 FAIL（不因缓存虚报 PASS）', async () => {
    const fx = tmpProject()
    try {
      const bad = spec({ executors: [{ id: 'e1', type: 'command', command: ['false'], evidenceType: 'x' }] })
      const first = await runGate({ spec: bad, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: ['src/a.ts'] })
      expect(first.run.verdict).toBe('FAIL')
      const second = await runGate({ spec: bad, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: ['src/a.ts'] })
      expect(second.run.verdict).toBe('FAIL')
      expect(second.evidence.every((e) => e.execution === 'cached')).toBe(true)
    } finally {
      rmSync(fx.dir, { recursive: true, force: true })
    }
  })
})
