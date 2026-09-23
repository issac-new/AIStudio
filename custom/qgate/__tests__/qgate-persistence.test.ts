// persistence executor 集成回归：复用 examples/payment-demo 真夹具（起服务+真 SQLite）。
// 覆盖：植入缺陷被逮（field-diff + invariant 双 FAIL）→ 修复后 PASS。
import { describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runGate } from '../src/core/run.js'
import { parseGateSpec } from '../src/core/parse.js'
import type { GateSpec } from '../src/core/types.js'
import { parse as parseYaml } from 'yaml'

const here = dirname(fileURLToPath(import.meta.url))
const demoSrc = join(here, '..', 'examples', 'payment-demo')

function makeFixture(): { dir: string; qgateDir: string; spec: GateSpec } {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-p4-'))
  cpSync(demoSrc, dir, { recursive: true })
  const qgateDir = join(dir, '.qgate')
  rmSync(join(qgateDir, 'runs'), { recursive: true, force: true })
  rmSync(join(qgateDir, 'evidence'), { recursive: true, force: true })
  rmSync(join(dir, 'data'), { recursive: true, force: true })
  // 场景文件随 pack 走；夹具内放一份让 qgateDir 相对解析命中
  const scenario = readFileSync(join(here, '..', 'gate-packs', 'persistence', 'scenarios', 'payment-create.yaml'), 'utf8')
  writeFileSync(join(qgateDir, 'payment-create.yaml'), scenario, 'utf8')
  const gateYaml = readFileSync(join(here, '..', 'gate-packs', 'persistence', 'gates', 'persistence-integrity.yaml'), 'utf8')
  const spec = parseGateSpec(parseYaml(gateYaml))
  if (!spec) throw new Error('persistence gate spec failed to parse')
  mkdirSync(join(dir, 'data'), { recursive: true })
  return { dir, qgateDir, spec }
}

describe('persistence executor（payment-demo 真夹具）', () => {
  it('植入缺陷（amount 单位换算错）→ 门 FAIL：field-diff 与 invariant 双证据', { timeout: 60_000 }, async () => {
    const fx = makeFixture()
    try {
      // demo 自带植入缺陷（db.mjs storedAmount = amount * 100）
      const result = await runGate({ spec: fx.spec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(result.run.verdict).toBe('FAIL')
      const diff = result.evidence.find((e) => e.type === 'field-diff')
      const inv = result.evidence.find((e) => e.type === 'invariant-result')
      expect(diff?.result).toBe('fail')
      expect(inv?.result).toBe('fail')
      // 五类证据齐且 exercised
      for (const type of ['integration-test-result', 'db-before', 'db-after', 'field-diff', 'invariant-result']) {
        const ev = result.evidence.find((e) => e.type === type)
        expect(ev, type).toBeDefined()
        expect(ev?.execution).toBe('exercised')
      }
      // 制品落盘
      expect(existsSync(join(fx.qgateDir, 'evidence', result.run.runId, 'field-diff.json'))).toBe(true)
    } finally {
      rmSync(fx.dir, { recursive: true, force: true })
    }
  })

  it('修复缺陷（storedAmount = amount）→ 门 PASS', { timeout: 60_000 }, async () => {
    const fx = makeFixture()
    try {
      const dbFile = join(fx.dir, 'db.mjs')
      writeFileSync(dbFile, readFileSync(dbFile, 'utf8').replace('const storedAmount = amount * 100', 'const storedAmount = amount'), 'utf8')
      const result = await runGate({ spec: fx.spec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir })
      expect(result.run.verdict).toBe('PASS')
    } finally {
      rmSync(fx.dir, { recursive: true, force: true })
    }
  })
})
