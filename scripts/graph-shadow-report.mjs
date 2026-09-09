#!/usr/bin/env node
// overlay/scripts/graph-shadow-report.mjs
// P1 Task 7 — shadow 双跑对比报告 CLI：
//   node scripts/graph-shadow-report.mjs --db .loop/graph-shadow.db [--run <runId>]
// 读 shadow 事件日志（node:sqlite），按可比词汇表（run.started / node.completed:<nodeId> /
// run.completed）输出事件序列摘要与相邻对齐率（完整一致率以 vitest e2e 的
// compareEventSequences 为准——legacy 侧事件在 store 里，脚本只报告 shadow 侧）。

import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const dbPath = arg('db') ?? '.loop/graph-shadow.db'
const runFilter = arg('run')

const COMPARABLE = new Set(['run.started', 'node.completed', 'run.completed'])

let db
try {
  db = new DatabaseSync(dbPath, { readOnly: true })
} catch (err) {
  console.error(`无法打开 shadow 日志 ${dbPath}: ${err.message}`)
  process.exit(1)
}

const rows = db.prepare(
  'SELECT run_id, graph_id, kind, node_id, seq FROM graph_events ORDER BY run_id, seq',
).all()

const byRun = new Map()
for (const row of rows) {
  if (!byRun.has(row.run_id)) byRun.set(row.run_id, [])
  byRun.get(row.run_id).push(row)
}

const runs = runFilter ? [...byRun.keys()].filter(r => r === runFilter) : [...byRun.keys()]
if (runs.length === 0) {
  console.log('shadow 日志中无 run。')
  process.exit(0)
}

for (const runId of runs) {
  const events = byRun.get(runId)
  const comparable = events
    .filter(e => COMPARABLE.has(e.kind))
    .map(e => (e.kind === 'node.completed' && e.node_id ? `node.completed:${e.node_id}` : e.kind))
  const failed = events.filter(e => e.kind === 'node.failed').length
  console.log(`\nrun ${runId} (${events[0]?.graph_id ?? '?'})`)
  console.log(`  事件总数 ${events.length} · node.failed ${failed}`)
  console.log(`  可比序列（${comparable.length}）:`)
  console.log('   ', comparable.join(' → '))
}

// 相邻对齐率：同一 run 的 shadow 序列自检（长度>0 且无 node.failed 的 run 占比）
const total = runs.length
const healthy = runs.filter(r => {
  const evts = byRun.get(r)
  return evts.some(e => e.kind === 'run.completed') && !evts.some(e => e.kind === 'node.failed')
}).length
console.log(`\n汇总：${healthy}/${total} 个 shadow run 完整跑通（run.completed 且零 node.failed）`)
