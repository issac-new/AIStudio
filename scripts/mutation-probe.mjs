#!/usr/bin/env node
// 变异探针（v0.4 治理可信度修复）。
//
// 目的：不是「门存在」，而是「门会红」。对每个 L0 门注入一个已知缺陷，
// 在临时目录跑 qgate，期望非 PASS；探针没抓到 = 门已失效，必须登记修复。
//
// 用法：
//   node scripts/mutation-probe.mjs [--case <id>] [--json] [--record]
// 退出码：0=全部探针检出；1=有探针未检出；2=setup/CLI 缺失。
// 纪律：只在 mkdtemp 临时目录写，不碰仓库；--record 只 append 证据。

import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(ROOT, 'custom', 'qgate', 'dist', 'cli.js')
const RECORD = join(ROOT, '.qgate', 'mutation-probes.jsonl')

export const CASES = [
  {
    id: 'scope-out-of-declared',
    gate: 'L0.scope-check',
    description: '声明 docs/**，改动 custom/a.ts → 必须 FAIL（范围门真的在比对）',
    files: { '.qgate/scope.yaml': 'paths:\n  - docs/**\n' },
    changed: 'custom/a.ts',
    expect: 'FAIL',
  },
  {
    id: 'scope-empty',
    gate: 'L0.scope-check',
    description: '声明 paths: [] → 必须 FAIL（空声明是配置错误，不是证据不足）',
    files: { '.qgate/scope.yaml': 'paths: []\n' },
    changed: 'custom/a.ts',
    expect: 'FAIL',
  },
  {
    id: 'acceptance-missing-covered-by',
    gate: 'L0.acceptance-coverage',
    description: '验收条目 coveredBy: [] → 必须 FAIL（无映射不能算覆盖）',
    files: { '.qgate/acceptance.yaml': 'criteria:\n  - id: A1\n    statement: x\n    coveredBy: []\n' },
    expect: 'FAIL',
  },
  {
    id: 'registers-missing',
    gate: 'L0.registers',
    description: '无 .qgate/registers → 必须非 PASS（未登记 ≠ 已治理）',
    files: {},
    expectNonPass: true,
  },
  {
    id: 'requirement-trace-missing',
    gate: 'L0.requirement-trace',
    description: '无 requirements.json → 必须非 PASS（追溯不能空过）',
    files: {},
    expectNonPass: true,
  },
]

export function parseVerdict(output, gate) {
  const esc = gate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${esc}:\\s*(PASS|FAIL|CONDITIONAL|INCONCLUSIVE|WAIVED|NOT_APPLICABLE)`).exec(output)
  return m ? m[1] : 'UNKNOWN'
}

export function runCase(testCase) {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-mutation-'))
  try {
    mkdirSync(join(dir, '.qgate'), { recursive: true })
    for (const [rel, content] of Object.entries(testCase.files ?? {})) {
      mkdirSync(join(dir, rel, '..'), { recursive: true })
      writeFileSync(join(dir, rel), content)
    }
    const args = [CLI, 'run', testCase.gate, '--trigger', 'task_close', '--include-disabled']
    if (testCase.changed) args.push('--changed', testCase.changed)
    const res = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 60_000 })
    const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
    const verdict = parseVerdict(output, testCase.gate)
    const detected = testCase.expectNonPass ? verdict !== 'PASS' && verdict !== 'UNKNOWN' : verdict === testCase.expect
    return { id: testCase.id, gate: testCase.gate, verdict, expected: testCase.expect ?? 'non-PASS', detected, output: output.slice(-800) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write(`usage: node scripts/mutation-probe.mjs [--case <id>] [--json] [--record]\ncases:\n${CASES.map((c) => `  ${c.id}: ${c.description}`).join('\n')}\n`)
    return 0
  }
  const caseIdx = argv.indexOf('--case')
  const only = caseIdx >= 0 ? argv[caseIdx + 1] : undefined
  const selected = only ? CASES.filter((c) => c.id === only) : CASES
  if (selected.length === 0) {
    err.write(`mutation-probe: unknown case: ${only}\n`)
    return 2
  }
  const results = selected.map((c) => runCase(c))
  if (argv.includes('--record')) {
    const ts = new Date().toISOString()
    for (const r of results) appendFileSync(RECORD, JSON.stringify({ ts, ...r, output: undefined }) + '\n')
  }
  if (argv.includes('--json')) out.write(JSON.stringify({ results }, null, 2) + '\n')
  else {
    for (const r of results) out.write(`${r.detected ? '✓' : '✗'} ${r.id}: verdict=${r.verdict} expected=${r.expected}\n`)
  }
  return results.every((r) => r.detected) ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
