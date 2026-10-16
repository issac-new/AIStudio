#!/usr/bin/env node
// overlay/scripts/sec-tool-usage-report.mjs
// M6b 盘点脚本（2026-10-16 安全轮，预警先行版第二阶段的数据源）。
//
// 用途：按周产出各 profile 的工具使用分布，服务整改方案第五节的阻断项启用判据
// （M2 裁剪判据、M1 审批判据、M10 黑名单判据）。与巡检官的 collectProfileToolUsage
// 同源同口径（state.db messages.tool_calls 口径 A），但本脚本出人读的报告并落盘，
// 不依赖 studio server 在跑。
//
// 口径：近 N 天（默认 7）assistant 消息的 tool_calls（发起量）；role='tool' 的
// 完成量口径另出（两个口径对不上本身就是异常信号）。
//
// 用法：
//   node scripts/sec-tool-usage-report.mjs                    # 默认 7 天，全部 profile
//   node scripts/sec-tool-usage-report.mjs --days 30 --profile aiteam-scout
//   TOOL_USAGE_REPORT_DIR=/path node scripts/sec-tool-usage-report.mjs
//
// 只读：不写 profile 任何文件；报告落 <reportDir>/sec-tool-usage-YYYY-MM-DD.md。
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const argv = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const days = Math.max(1, Number(argOf('--days', '7')) || 7)
const onlyProfile = argOf('--profile', '')
const home = process.env.HERMES_HOME || join(homedir(), '.hermes')
const reportDir = process.env.TOOL_USAGE_REPORT_DIR?.trim()
  ? resolve(process.env.TOOL_USAGE_REPORT_DIR.trim())
  : join(homedir(), '.hermes-web-ui', 'sec-tool-usage')

const HIGH_RISK = new Set(['terminal', 'terminal_exec', 'execute_code', 'code_exec', 'delegate_task'])
const SENSITIVE_RES = [/\/etc\//, /\/private\/etc\//, /~\/\.ssh\//, /\/\.ssh\//, /\/root\//, /\/private\/var\/root\//]

function profileDbs() {
  const out = []
  const rootDb = join(home, 'state.db')
  if (existsSync(rootDb)) out.push({ profile: 'default', db: rootDb })
  const dir = join(home, 'profiles')
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    if (onlyProfile && name !== onlyProfile) continue
    const db = join(dir, name, 'state.db')
    if (existsSync(db)) out.push({ profile: name, db })
  }
  return out
}

function scan(dbPath) {
  let db
  try {
    const { DatabaseSync } = require('node:sqlite')
    db = new DatabaseSync(dbPath, { readOnly: true })
    const cutoff = (Date.now() - days * 86_400_000) / 1000
    const calls = db.prepare(
      `SELECT je.value ->> 'function' ->> 'name' AS tool,
              je.value ->> 'function' ->> 'arguments' AS args,
              m.timestamp AS ts
       FROM messages m, json_each(m.tool_calls) je
       WHERE m.role = 'assistant' AND m.tool_calls IS NOT NULL AND m.timestamp >= ?`,
    ).all(cutoff).map((r) => ({ tool: String(r.tool ?? ''), args: String(r.args ?? ''), ts: Number(r.ts ?? 0) }))
    const results = db.prepare(
      'SELECT tool_name AS tool, timestamp AS ts FROM messages WHERE role = ? AND tool_name IS NOT NULL AND timestamp >= ?',
    ).all('tool', cutoff).map((r) => ({ tool: String(r.tool ?? ''), ts: Number(r.ts ?? 0) }))
    return { calls, results }
  } catch (e) {
    return { calls: [], results: [], error: String(e.message).slice(0, 120) }
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

const me = homedir().split('/').pop() ?? ''
const otherHome = me
  ? new RegExp(`/(?:Users|home)/(?!${me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|\\b))[^/\\s"']+`)
  : null

const lines = []
lines.push('# 工具使用盘点报告（安全轮 M6b）')
lines.push('')
lines.push(`- 生成时间：${new Date().toISOString()}`)
lines.push(`- 统计窗口：近 ${days} 天`)
lines.push('- 数据源：各 profile state.db（口径 A=assistant 发起；口径 B=role=tool 完成）')
lines.push(`- 家目录：${home}`)
lines.push('')
lines.push('## 汇总表')
lines.push('')
lines.push('| profile | 发起量 | 完成量 | 高危 | 敏感路径 | 差异(A-B) |')
lines.push('|---|---|---|---|---|---|')
const details = []
let totalCalls = 0
let totalHigh = 0
let totalSensitive = 0
const riskProfiles = new Set()
const dbs = profileDbs()

for (const { profile, db } of dbs) {
  const { calls, results, error } = scan(db)
  if (error) {
    lines.push(`| ${profile} | 读取失败 | - | - | - | - |`)
    details.push(`### ${profile}\n\n读取失败：${error}\n`)
    continue
  }
  const perTool = new Map()
  let high = 0
  let sensitive = 0
  for (const c of calls) {
    perTool.set(c.tool, (perTool.get(c.tool) ?? 0) + 1)
    if (HIGH_RISK.has(c.tool)) high += 1
    if (SENSITIVE_RES.some((re) => re.test(c.args)) || (otherHome && otherHome.test(c.args))) sensitive += 1
  }
  totalCalls += calls.length
  totalHigh += high
  totalSensitive += sensitive
  if (high > 0) riskProfiles.add(profile)
  lines.push(`| ${profile} | ${calls.length} | ${results.length} | ${high} | ${sensitive} | ${calls.length - results.length} |`)
  const top = [...perTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  details.push(`### ${profile}\n\n发起 ${calls.length} 次（完成 ${results.length} 次），高危 ${high} 次，敏感路径 ${sensitive} 次。\n\n工具分布 top：\n\n${top.map(([t, n]) => `- ${t}: ${n}`).join('\n') || '- （无）'}\n`)
}

lines.push('')
lines.push('## 判据数据（供第三阶段决策）')
lines.push('')
lines.push(`- 涉及高危工具的 profile 数：${riskProfiles.size} / ${dbs.length}`)
lines.push(`- 高危调用总数：${totalHigh}`)
lines.push(`- 敏感路径参数命中总数：${totalSensitive}`)
lines.push('- M2 裁剪判据：某岗对某高危工具零调用才可裁，逐 profile 看上面的工具分布。')
lines.push('- M10 黑名单判据：敏感路径命中为零才可硬拒；非零则逐个枚举合法读取再加白。')
lines.push('')
lines.push('## 明细')
lines.push('')
lines.push(...details)

const stamp = new Date().toISOString().slice(0, 10)
mkdirSync(reportDir, { recursive: true })
const out = join(reportDir, `sec-tool-usage-${stamp}.md`)
writeFileSync(out, lines.join('\n'))
console.log(`[sec-tool-usage] OK: ${dbs.length} 个库，发起 ${totalCalls} 次，高危 ${totalHigh} 次，敏感路径 ${totalSensitive} 次`)
console.log(`[sec-tool-usage] 报告：${out}`)
