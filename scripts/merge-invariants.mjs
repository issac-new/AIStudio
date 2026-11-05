#!/usr/bin/env node
// 合并后不变量（v0.4 治理可信度修复）。
//
// 背景：2026-11-04 实录显示 merge 环节曾把 VENDOR.md 台账静默回退旧版，同轮无人对
// merge 全量内容负责。post-merge 的退出码被 git 忽略，所以真正的阻断点必须放在
// merge-to-main.mjs 与 pre-push；本脚本提供统一的静态不变量检查。
//
// 用法：
//   node scripts/merge-invariants.mjs [--check] [--record] [--json] [--quiet]
//        [--require-qgate-health]
// 退出码：0=静态不变量全过；1=有失配；2=读取/环境错误。
// 检查项：
//   1) RELEASE-MANIFEST 多载体对账（复用 verify-release-manifest.mjs）
//   2) 附录 A 集合等式（A.1 ∪ 角色表 == specs 根 Markdown）
//   3) L2 kit 字节一致（assets ↔ hooks 副本）
//   4) 收据 JSONL 合法（字段/路径/哈希形态）
//   5) qgate health（默认 advisory；--require-qgate-health 才阻断）

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SPECS_DIR = 'docs/superpowers/specs'
const APPENDIX = `${SPECS_DIR}/2026-10-21-swarmstudio-appendix-a-spec-index.md`
const RECEIPTS = '.swarm-yuan/spec-receipts.jsonl'
const LEDGER = '.swarm-yuan/merge-invariants.jsonl'
const CLI = 'custom/qgate/dist/cli.js'

function stem(file) {
  return file.replace(/\.md$/, '')
}

export function compareDocsSets(specFiles, appendixRows, roleRows) {
  const specs = new Set(specFiles.map(stem))
  const a1 = appendixRows.map(stem)
  const role = roleRows.map(stem)
  const duplicates = [...new Set(a1.filter((x, i) => a1.indexOf(x) !== i))]
  const overlap = a1.filter((x) => role.includes(x))
  const union = new Set([...a1, ...role])
  const missing = [...specs].filter((x) => !union.has(x))
  const ghosts = [...union].filter((x) => !specs.has(x))
  return { missing, ghosts, duplicates, overlap, specs: specs.size, a1: a1.length, role: role.length }
}

export function parseAppendix(text) {
  const lines = text.split('\n')
  const roleStart = lines.findIndex((l) => l.startsWith('### 角色/排除'))
  const a1 = []
  const role = []
  const isRow = (l) => /^\|\s*2026-/.test(l)
  const cell = (l) => l.split('|')[1]?.trim() ?? ''
  for (let i = 0; i < lines.length; i += 1) {
    if (!isRow(lines[i])) continue
    if (roleStart >= 0 && i > roleStart) role.push(cell(lines[i]))
    else a1.push(cell(lines[i]))
  }
  return { appendixRows: a1, roleRows: role }
}

function checkManifest() {
  const script = join(ROOT, 'scripts/verify-release-manifest.mjs')
  if (!existsSync(script)) return { id: 'release-manifest', status: 'skip', detail: 'verify-release-manifest.mjs missing' }
  const res = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  const ok = res.status === 0
  return { id: 'release-manifest', status: ok ? 'pass' : 'fail', detail: ok ? 'carriers aligned' : `${res.stdout ?? ''}${res.stderr ?? ''}`.slice(-800) }
}

function checkDocs() {
  try {
    const specFiles = readdirSync(join(ROOT, SPECS_DIR)).filter((f) => f.endsWith('.md'))
    const { appendixRows, roleRows } = parseAppendix(readFileSync(join(ROOT, APPENDIX), 'utf8'))
    const r = compareDocsSets(specFiles, appendixRows, roleRows)
    const ok = r.missing.length === 0 && r.ghosts.length === 0 && r.duplicates.length === 0 && r.overlap.length === 0
    return { id: 'docs-index', status: ok ? 'pass' : 'fail', detail: ok ? `${r.specs} specs covered` : JSON.stringify(r) }
  } catch (e) {
    return { id: 'docs-index', status: 'fail', detail: e.message }
  }
}

function checkL2Parity() {
  // 只有 spec-first-lib.sh 是 byte-for-byte 副本（l2-kit-parity 锁的就是它）；
  // spec-first-pre-commit.sh 由生成器渲染（含路径/开关差异），不能字节比较。
  const pairs = [
    ['skills/swarm-yuan/assets/spec-first-lib.sh', '.swarm-yuan/hooks/spec-first-lib.sh'],
  ]
  const bad = []
  for (const [a, b] of pairs) {
    try {
      if (!readFileSync(join(ROOT, a)).equals(readFileSync(join(ROOT, b)))) bad.push(b)
    } catch {
      bad.push(b)
    }
  }
  const required = ['.swarm-yuan/hooks/spec-first-pre-commit.sh', '.swarm-yuan/hooks/pre-commit', '.swarm-yuan/hooks/pre-push']
  for (const f of required) if (!existsSync(join(ROOT, f))) bad.push(f)
  return { id: 'l2-parity', status: bad.length === 0 ? 'pass' : 'fail', detail: bad.length === 0 ? 'lib bytes + hooks present' : `mismatch/missing: ${bad.join(', ')}` }
}

function checkReceipts() {
  try {
    const rows = readFileSync(join(ROOT, RECEIPTS), 'utf8').split('\n').filter((l) => l.trim())
    const problems = []
    for (let i = 0; i < rows.length; i += 1) {
      let r
      try {
        r = JSON.parse(rows[i])
      } catch {
        problems.push(`line ${i + 1}: JSON parse`)
        continue
      }
      if (!r.at || !r.spec || !r.receipt || !r.commit) problems.push(`line ${i + 1}: missing field`)
      else if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(String(r.receipt))) problems.push(`line ${i + 1}: bad hash`)
      else if (!existsSync(join(ROOT, String(r.spec)))) problems.push(`line ${i + 1}: spec missing`)
    }
    return { id: 'receipts', status: problems.length === 0 ? 'pass' : 'fail', detail: problems.length === 0 ? `${rows.length} rows` : problems.slice(0, 5).join('; ') }
  } catch (e) {
    return { id: 'receipts', status: 'fail', detail: e.message }
  }
}

function checkQgateHealth() {
  const cli = join(ROOT, CLI)
  if (!existsSync(cli)) return { id: 'qgate-health', status: 'skip', detail: 'qgate dist missing' }
  const res = spawnSync(process.execPath, [cli, 'health', '--scope', 'all', '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  try {
    const report = JSON.parse(res.stdout)
    return { id: 'qgate-health', status: report.exitCode === 0 ? 'pass' : 'advisory', detail: JSON.stringify(report.summary) }
  } catch {
    return { id: 'qgate-health', status: 'advisory', detail: 'health output unreadable' }
  }
}

export function buildReport({ requireQgateHealth = false } = {}) {
  const checks = [checkManifest(), checkDocs(), checkL2Parity(), checkReceipts()]
  const health = checkQgateHealth()
  if (requireQgateHealth) checks.push({ ...health, status: health.status === 'pass' ? 'pass' : 'fail' })
  else checks.push(health)
  const blocking = checks.filter((c) => c.status === 'fail')
  return { checks, status: blocking.length === 0 ? 'pass' : 'fail', blocking: blocking.map((c) => c.id) }
}

function gitHead() {
  const res = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  return res.status === 0 ? res.stdout.trim() : undefined
}

function gitTree() {
  const res = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: ROOT, encoding: 'utf8' })
  return res.status === 0 ? res.stdout.trim() : undefined
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (argv.includes('--help') || argv.includes('-h')) {
    out.write('usage: node scripts/merge-invariants.mjs [--check] [--record] [--json] [--quiet] [--require-qgate-health]\n')
    return 0
  }
  const report = buildReport({ requireQgateHealth: argv.includes('--require-qgate-health') })
  const record = { ts: new Date().toISOString(), head: gitHead(), treeHash: gitTree(), ...report }
  if (argv.includes('--record')) {
    mkdirSync(join(ROOT, '.swarm-yuan'), { recursive: true })
    appendFileSync(join(ROOT, LEDGER), JSON.stringify(record) + '\n')
  }
  if (argv.includes('--json')) out.write(JSON.stringify(record, null, 2) + '\n')
  else if (!argv.includes('--quiet')) {
    for (const c of report.checks) out.write(`${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '△'} ${c.id}: ${c.status}${c.detail ? ` — ${c.detail}` : ''}\n`)
    out.write(`merge-invariants: ${report.status}${report.blocking.length ? ` (blocking: ${report.blocking.join(', ')})` : ''}\n`)
  }
  return report.status === 'pass' ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export { main }
