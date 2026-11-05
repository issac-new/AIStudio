#!/usr/bin/env node
// 独立审计抽检（v0.4 治理可信度修复）。
//
// 背景：门禁由被治理者自评存在结构性利益冲突（「我跑的门都过了」）。本脚本不代替
// 独立审计，只提供可复现的抽样与证据：固定 seed 抽 5 个 PASS 门 + 5 份 spec，
// 输出可交给独立会话/审计代理复核的清单。
//
// 用法：
//   node scripts/audit-sample.mjs [--seed <string>] [--count 5] [--json] [--record]
// 退出码：0=抽样完成（发现项如实列出）；2=参数错误；3=门池不可用/为空（setup 失败）。
// 纪律：只读 state/runs/specs；不修改证据、不执行门。

import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SPECS_DIR = 'docs/superpowers/specs'
const RECEIPTS = '.swarm-yuan/spec-receipts.jsonl'
const LEDGER = '.swarm-yuan/audit-samples.jsonl'
const SECTION_BASELINE = '.swarm-yuan/spec-sections-baseline.txt'
const CLI = 'custom/qgate/dist/cli.js'

function hashSeed(s) {
  let h = 2166136261
  for (const ch of String(s)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32：同一 seed 同一序列，审计抽样可复现。 */
export function rng(seed) {
  let a = hashSeed(seed)
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sampleDeterministic(items, count, seed) {
  const arr = [...items]
  const rand = rng(seed)
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, Math.min(count, arr.length))
}

export function checkSpecSections(text) {
  const missing = []
  for (const name of ['变更', '决策记录', '验证', '设计文档影响']) {
    if (!new RegExp(`^#+\\s*.*${name}`, 'm').test(text)) missing.push(name)
  }
  return { ok: missing.length === 0, missing }
}

function loadReceipts() {
  if (!existsSync(join(ROOT, RECEIPTS))) return new Set()
  const covered = new Set()
  for (const line of readFileSync(join(ROOT, RECEIPTS), 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      covered.add(JSON.parse(line).spec)
    } catch {
      /* lint 单独报 */
    }
  }
  return covered
}

function loadSectionBaseline() {
  const path = join(ROOT, SECTION_BASELINE)
  if (!existsSync(path)) return new Set()
  return new Set(readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')))
}

function sampleGates(count) {
  const cli = join(ROOT, CLI)
  if (!existsSync(cli)) return { available: false, rows: [] }
  const res = spawnSync(process.execPath, [cli, 'health', '--scope', 'all', '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  try {
    const report = JSON.parse(res.stdout)
    const okGates = report.gates.filter((g) => g.health === 'ok')
    return { available: true, rows: okGates.map((g) => ({ gateId: g.gateId, verdict: g.verdict, freshness: g.freshness, lastPassAt: g.lastPassAt })) }
  } catch {
    return { available: false, rows: [] }
  }
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write('usage: node scripts/audit-sample.mjs [--seed <string>] [--count 5] [--json] [--record]\n')
    out.write('exit: 0=sample ok (findings listed); 2=bad args; 3=gate pool unavailable/empty\n')
    return 0
  }
  const get = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : fallback
  }
  const seed = get('--seed', 'governance-truth-2026-11-05')
  const count = Number(get('--count', '5'))
  if (!Number.isInteger(count) || count <= 0) {
    err.write('audit-sample: --count must be a positive integer\n')
    return 2
  }
  const gateSample = sampleGates(count)
  const gates = sampleDeterministic(gateSample.rows, count, `${seed}:gates`)
  const specs = readdirSync(join(ROOT, SPECS_DIR)).filter((f) => f.endsWith('.md')).sort()
  const specSample = sampleDeterministic(specs, count, `${seed}:specs`)
  const covered = loadReceipts()
  const sectionExempt = loadSectionBaseline()
  const specRows = specSample.map((f) => {
    const rel = `${SPECS_DIR}/${f}`
    const text = readFileSync(join(ROOT, rel), 'utf8')
    const sections = checkSpecSections(text)
    return { spec: rel, hasReceipt: covered.has(rel), sections, sectionsExempt: sectionExempt.has(rel) }
  })
  const report = {
    generatedAt: new Date().toISOString(),
    seed,
    gatesAvailable: gateSample.available,
    gates,
    specs: specRows,
    findings: [
      ...(gateSample.available ? [] : ['qgate dist 缺失，门抽检不可用']),
      ...(gateSample.available && gates.length === 0 ? ['门池为空：没有 health=ok 的门可抽（样本不能代表治理常态）'] : []),
      ...specRows.filter((s) => !s.hasReceipt).map((s) => `${s.spec}: 无内容收据`),
      ...specRows.filter((s) => !s.sections.ok && !s.sectionsExempt).map((s) => `${s.spec}: 缺段 ${s.sections.missing.join(',')}`),
    ],
  }
  if (argv.includes('--record')) appendFileSync(join(ROOT, LEDGER), JSON.stringify(report) + '\n')
  if (argv.includes('--json')) out.write(JSON.stringify(report, null, 2) + '\n')
  else {
    out.write(`audit sample: seed=${seed} gates=${gates.length} specs=${specRows.length} findings=${report.findings.length}\n`)
    for (const g of gates) out.write(`  GATE ${g.gateId} verdict=${g.verdict} freshness=${g.freshness}\n`)
    for (const s of specRows) out.write(`  SPEC ${s.spec} receipt=${s.hasReceipt} sections=${s.sections.ok ? 'ok' : s.sections.missing.join(',')}${s.sectionsExempt && !s.sections.ok ? ' (baseline-exempt)' : ''}\n`)
    for (const f of report.findings) out.write(`  FINDING ${f}\n`)
  }
  // 门池不可用/为空是 setup 失败，不能当作「抽样完成」；spec 发现项仍只列出不失败。
  if (!gateSample.available || gates.length === 0) return 3
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
