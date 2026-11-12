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
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RECEIPTS = '.swarm-yuan/spec-receipts.jsonl'
const LEDGER = '.swarm-yuan/merge-invariants.jsonl'
const CLI = 'custom/qgate/dist/cli.js'

function checkManifest() {
  const script = join(ROOT, 'scripts/verify-release-manifest.mjs')
  if (!existsSync(script)) return { id: 'release-manifest', status: 'skip', detail: 'verify-release-manifest.mjs missing' }
  const res = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  const ok = res.status === 0
  return { id: 'release-manifest', status: ok ? 'pass' : 'fail', detail: ok ? 'carriers aligned' : `${res.stdout ?? ''}${res.stderr ?? ''}`.slice(-800) }
}

function checkDocs() {
  // 2026-11-12 文档口径收敛：覆盖义务从「手维护的附录 A」迁到「生成的机械索引」。
  // 附录 A 冻结为历史档案（只保留无幽灵/无重复的结构校验，见 docs-ssot-guard），
  // 单一事实源=gen-doc-indexes 的 --check（链接集合＝specs 直接根集合＋头计数一致）。
  try {
    const script = join(ROOT, 'scripts/maintenance/gen-doc-indexes.mjs')
    if (!existsSync(script)) return { id: 'docs-index', status: 'fail', detail: 'gen-doc-indexes.mjs missing' }
    const res = spawnSync(process.execPath, [script, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 })
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim()
    const ok = res.status === 0
    return { id: 'docs-index', status: ok ? 'pass' : 'fail', detail: ok ? (out.split('\n')[0] || 'design-index covered') : out.slice(-800) }
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
