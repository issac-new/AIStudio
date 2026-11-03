// 四性自评报告节守门（F3）：缺席写未采集、制品齐备出读数、HTML 含披露注记。
// 通过真实 python3 子进程跑模块 CLI，验证的是模块本身而不是 JS 侧的近似实现。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(__dirname, '../mux/four_properties.py')
let runDir = ''

function py(args: string[]): string {
  return execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8' })
}

function writeJson(rel: string, doc: unknown): void {
  const p = join(runDir, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, JSON.stringify(doc))
}

beforeEach(() => {
  runDir = mkdtempSync(join(tmpdir(), 'fourprop-'))
})

afterEach(() => {
  rmSync(runDir, { recursive: true, force: true })
})

describe('four_properties.collect', () => {
  it('无任何制品时四行全部「未采集」，不写 0', () => {
    const rows = JSON.parse(py([runDir])) as Array<{ name: string; value: string; status: string }>
    expect(rows.map((r) => r.name)).toEqual(['准确性', '可靠性', '安全性', '可治理性'])
    for (const r of rows) {
      expect(r.status).toBe('未采集')
      expect(r.value).toContain('未采集')
    }
  })

  it('制品齐备时输出可核对读数', () => {
    writeJson('evidence/ac-trace.json', {
      acTotal: 4,
      rows: [],
      judgement: { ok: false, unbound: ['AC-3'], noResult: ['AC-2'], failed: [], orphanCases: [] },
    })
    writeJson('governance/stage-keys/req-frozen.json', { stage: 'req-frozen' })
    writeJson('governance/stage-keys/design-approved.json', { stage: 'design-approved' })
    writeJson('evidence/posture-admission.json', {
      admission: { mode: 'require-for-gate', admits: false, blockers: ['a', 'b'] },
    })
    writeJson('evidence/independence-summary.json', { independent: 3, sameModel: 1, unknown: 2 })

    const rows = JSON.parse(py([runDir])) as Array<{ name: string; value: string }>
    const by = Object.fromEntries(rows.map((r) => [r.name, r.value]))
    expect(by['准确性']).toContain('AC 4 条')
    expect(by['准确性']).toContain('存在缺口')
    expect(by['准确性']).toContain('缺口 2')
    expect(by['可靠性']).toContain('齐备 2/4')
    expect(by['可靠性']).toContain('dev-done')
    expect(by['安全性']).toContain('require-for-gate')
    expect(by['安全性']).toContain('阻断 2 项')
    expect(by['可治理性']).toContain('独立 3')
    expect(by['可治理性']).toContain('共模 1')
  })

  it('坏档按未采集处理并给原因，不抛', () => {
    mkdirSync(join(runDir, 'evidence'), { recursive: true })
    writeFileSync(join(runDir, 'evidence/ac-trace.json'), '{oops')
    const rows = JSON.parse(py([runDir])) as Array<{ name: string; value: string }>
    const acc = rows.find((r) => r.name === '准确性')
    expect(acc?.value).toContain('解析失败')
  })

  it('--html 输出含节标题与「未采集不等于 0」披露', () => {
    const html = py([runDir, '--html'])
    expect(html).toContain('四性自评')
    expect(html).toContain('data-testid="four-properties"')
    expect(html).toContain('不等于 0')
  })
})
