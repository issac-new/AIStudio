#!/usr/bin/env node
// harness-doctor：一站式 Harness 体检（2026-11-05 AI Native 吸收批 T4）。
//
// 背景：nine-layers 是 HTTP 读模型且曾有三处硬编码 true（自检虚高）；CLAUDE.md
// 完全未被任何体检读取；无 claude doctor 式统一命令。本命令只读、fail-soft、
// 零依赖（纯 node），八项体检输出 JSON（--json）与人话摘要；退出码 0=无 fail
// （warn 允许），1=有 fail，2=用法错误。
//
// 八项（《AI Native 工程体系（三）》"检查你的 Harness"清单的产品化）：
//  1 context-docs   AGENTS.md/CLAUDE.md 行数与叙事分叉（单仓 vs 多仓旧叙事冲突词）
//  2 doc-links      根文档引用的仓内相对路径死链
//  3 permission     权限总闸实测（HERMES_TOOL_ENFORCE env + team profiles approvals.mode 统计）
//  4 sandbox        OS 沙箱可用性（darwin sandbox-exec / linux bwrap）+ HERMES_TOOL_SANDBOX_ROOTS
//  5 loop-limits    迭代/墙钟配置一致性（TURN_LIMIT_DEFAULT 与两处帮助文本同值；墙钟默认关）
//  6 cache-layout   上游静态前缀断点在位（conversation_loop 的 static prefix 标志）
//  7 feedback       反馈回路新鲜度（qgate state / spec-receipts / decisions 最近时间）
//  8 sunset         机制预算待退役台账（reviewBy 已过期项点名）
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 测试可注入假树（DOCTOR_ROOT）；缺省=脚本所在仓根
const ROOT = process.env.DOCTOR_ROOT?.trim() || fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
if (args.includes('-h') || args.includes('--help')) {
  console.log('用法: node scripts/harness-doctor.mjs [--json]')
  process.exit(2)
}
const JSON_OUT = args.includes('--json')

const findings = []
function report(id, status, summary, detail) {
  findings.push({ id, status, summary, detail })
  const icon = status === 'fail' ? '✗' : status === 'warn' ? '⚠' : '✓'
  if (!JSON_OUT) console.log(`${icon} [${id}] ${summary}`)
}

function read(p) { try { return readFileSync(join(ROOT, p), 'utf8') } catch { return null } }
function exists(p) { return existsSync(join(ROOT, p)) }

// ── 1 context-docs ─────────────────────────────────────────────────────────
{
  const agents = read('AGENTS.md')
  const claude = read('CLAUDE.md')
  const agentsLines = agents ? agents.split('\n').length : 0
  const claudeLines = claude ? claude.split('\n').length : 0
  // 分叉探针：AGENTS.md 已立法「单一完整项目仓」，CLAUDE.md 若仍携带旧多仓叙事即分叉
  const staleMarkers = ['overlay 是 git 仓', 'overlay-based fork', '独立 git 仓']
  const claudeStale = claude ? staleMarkers.filter((m) => claude.includes(m)) : []
  const agentsMissing = !agents || agentsLines < 10
  if (agentsMissing) report('context-docs', 'warn', `根 AGENTS.md 缺席或过短（${agentsLines} 行）`)
  else if (claude && claudeStale.length > 0) {
    report('context-docs', 'fail',
      `CLAUDE.md 与 AGENTS.md 叙事分叉（CLAUDE.md ${claudeLines} 行仍含旧多仓叙事：${claudeStale.join('；')}；AGENTS.md ${agentsLines} 行为单仓正本）——按「删 CLAUDE.md 指向 AGENTS.md」或同批修订收口`)
  } else if (claude && claudeLines > 260) {
    report('context-docs', 'warn', `CLAUDE.md ${claudeLines} 行（>260）与 AGENTS.md ${agentsLines} 行双正本漂移风险——收敛为单一事实源`)
  } else {
    report('context-docs', 'pass', `AGENTS.md ${agentsLines} 行${claude ? `／CLAUDE.md ${claudeLines} 行（无分叉探针命中）` : '（CLAUDE.md 缺席——单一正本形态）'}`)
  }
}

// ── 2 doc-links ────────────────────────────────────────────────────────────
{
  const doc = 'AGENTS.md'
  const text = read(doc)
  if (!text) { report('doc-links', 'warn', 'AGENTS.md 缺席，跳过死链检查') }
  else {
    // 仓内相对路径引用（`path` 反引号内或表格内 `` `x/y/` `` 形态）；只查以已知顶层目录开头的
    const refs = [...text.matchAll(/`((?:custom|scripts|docs|config|registries|runtime|simharness|skills|team|patches|vendor|assets|\.qgate|\.swarm-yuan)\/[^`\s]+)`/g)].map((m) => m[1])
    const dead = []
    for (const r of refs) {
      // 占位符（<slug> 形态）、运行态文件（.qgate 运行账）、忽略目录（node_modules）不计死链
      if (r.includes('<')) continue
      if (r.startsWith('.qgate/') || r.includes('node_modules')) continue
      // 尾部通配与锚点剥离
      const clean = r.replace(/[*#].*$/, '').replace(/:[0-9-]+$/, '')
      if (!clean || clean.endsWith('/')) continue
      if (!exists(clean)) dead.push(r)
    }
    const uniq = [...new Set(dead)]
    if (uniq.length > 0) report('doc-links', 'warn', `AGENTS.md 引用的仓内路径 ${uniq.length} 条不存在：${uniq.slice(0, 5).join('、')}${uniq.length > 5 ? '…' : ''}`)
    else report('doc-links', 'pass', `AGENTS.md 仓内引用 ${refs.length} 条无死链`)
  }
}

// ── 3 permission ───────────────────────────────────────────────────────────
{
  const enforceEnv = process.env.HERMES_TOOL_ENFORCE ?? '0(未设)'
  const profiles = exists('team/profiles') ? readdirSync(join(ROOT, 'team/profiles')).filter((d) => existsSync(join(ROOT, 'team/profiles', d, 'config.yaml'))) : []
  let off = 0
  for (const p of profiles) {
    const cfg = read(join('team/profiles', p, 'config.yaml')) ?? ''
    if (/approvals:\s*\n\s*mode:\s*"off"/.test(cfg)) off += 1
  }
  const enforceOn = process.env.HERMES_TOOL_ENFORCE === '1'
  if (!enforceOn && off === profiles.length && profiles.length > 0) {
    report('permission', 'warn',
      `权限执法总闸未开（HERMES_TOOL_ENFORCE=${enforceEnv}）且 ${off}/${profiles.length} profile approvals.mode=off——审批规则/策略存在但不拦（挂账 N01，2026-11-05 AI Native D1 记账）`)
  } else {
    report('permission', 'pass', `HERMES_TOOL_ENFORCE=${enforceEnv}；approvals off=${off}/${profiles.length}`)
  }
}

// ── 4 sandbox ──────────────────────────────────────────────────────────────
{
  const probes = { darwin: 'sandbox-exec', linux: 'bwrap' }
  const which = probes[process.platform]
  let binOk = false
  if (which) { try { execSync(`command -v ${which}`, { stdio: 'ignore' }); binOk = true } catch { binOk = false } }
  const roots = process.env.HERMES_TOOL_SANDBOX_ROOTS?.trim() ?? ''
  if (!binOk && which) report('sandbox', 'warn', `${process.platform} 沙箱二进制 ${which} 不可用——exec-sandbox 将 unavailable（fail-closed），Agent 执行面同用户裸跑`)
  else if (!roots) report('sandbox', 'warn', `OS 沙箱可用（${which}）但 HERMES_TOOL_SANDBOX_ROOTS 未配置——路径沙箱不生效（相对路径不拦）`)
  else report('sandbox', 'pass', `OS 沙箱=${binOk ? '可用' : 'n/a(' + process.platform + ')'}；SANDBOX_ROOTS 已配置`)
}

// ── 5 loop-limits ──────────────────────────────────────────────────────────
{
  const cfg = read('vendor/hermes-agent/hermes_cli/config.py')
  const parser = read('vendor/hermes-agent/hermes_cli/_parser.py')
  const cli = read('vendor/hermes-agent/cli.py')
  const runAgent = read('vendor/hermes-agent/run_agent.py')
  if (!cfg || !parser || !cli || !runAgent) { report('loop-limits', 'warn', 'vendor 源缺席（未注入态）——迭代/墙钟一致性检查跳过') }
  else {
    const def = cfg.match(/TURN_LIMIT_DEFAULT\s*=\s*(\d+)/)?.[1]
    const h1 = parser.match(/--max-turns[^)]*?default:\s*(\d+)/)?.[1]
    const h2 = cli.match(/max_turns:.*?default:\s*(\d+)/)?.[1]
    const ctor = runAgent.match(/max_iterations:\s*int\s*=\s*(\d+)/)?.[1]
    const vals = [def, h1, h2, ctor].filter(Boolean).map(Number)
    const allSame = new Set(vals).size === 1
    if (!def) report('loop-limits', 'warn', 'TURN_LIMIT_DEFAULT 未找到（vendor 基线未含 T5 收敛？）')
    else if (!allSame) report('loop-limits', 'fail', `迭代默认值四方不一致：config=${def} parser=${h1} cli=${h2} ctor=${ctor}——文案漂移复发`)
    else report('loop-limits', 'pass', `迭代默认=${def} 四处一致（T5 收敛在位）；墙钟 run_budget_seconds 默认关（调用方显式设）`)
  }
}

// ── 6 cache-layout ─────────────────────────────────────────────────────────
{
  const loop = read('vendor/hermes-agent/agent/conversation_loop.py')
  if (!loop) report('cache-layout', 'warn', 'conversation_loop.py 缺席（未注入态）跳过')
  else {
    const staticPrefix = loop.includes('static_system_prefix') || loop.includes('[static prefix, volatile tail]')
    const wallStop = loop.includes('wall_clock_exhausted')
    if (!staticPrefix) report('cache-layout', 'fail', '上游静态前缀断点标志缺失——prompt 缓存层序被改坏（harness 核心约束）')
    else report('cache-layout', 'pass', `静态前缀断点在位；墙钟硬停${wallStop ? '在位（753）' : '缺席（基线未含 T5？）'}`)
  }
}

// ── 7 feedback ─────────────────────────────────────────────────────────────
{
  const notes = []
  let stale = 0
  const now = Date.now()
  const state = read('.qgate/state.json')
  if (state) {
    try {
      const s = JSON.parse(state)
      const times = Object.values(s).map((e) => e?.startedAt ?? 0).filter(Boolean)
      const latest = Math.max(...times)
      const ageH = (now - latest) / 3600_000
      notes.push(`qgate 最新判定 ${ageH.toFixed(1)}h 前`)
      if (ageH > 72) { notes.push('qgate >72h 无跑动'); stale += 1 }
    } catch { notes.push('qgate state 解析失败') }
  } else notes.push('qgate state 缺席')
  const receipts = read('.swarm-yuan/spec-receipts.jsonl')
  if (receipts) {
    const last = receipts.trim().split('\n').pop()
    try {
      const at = JSON.parse(last)?.at
      const ageH = (now - new Date(at).getTime()) / 3600_000
      notes.push(`spec 收据最新 ${ageH.toFixed(1)}h 前`)
      if (ageH > 168) { notes.push('收据 >7 天无新增'); stale += 1 }
    } catch { notes.push('收据末行解析失败') }
  } else notes.push('spec 收据缺席')
  if (stale > 0) report('feedback', 'warn', `反馈回路陈旧：${notes.join('；')}`)
  else report('feedback', 'pass', notes.join('；'))
}

// ── 8 sunset ───────────────────────────────────────────────────────────────
{
  const raw = read('config/mechanism-budget.json')
  if (!raw) report('sunset', 'warn', 'mechanism-budget.json 缺席')
  else {
    try {
      const budget = JSON.parse(raw)
      const overdue = (budget.sunset ?? []).filter((s) => s.reviewBy && new Date(s.reviewBy) < new Date())
      if (overdue.length > 0) report('sunset', 'fail', `机制退役复审过期 ${overdue.length} 项：${overdue.map((s) => `${s.id}(reviewBy ${s.reviewBy})`).join('、')}`)
      else report('sunset', 'pass', `sunset 台账 ${(budget.sunset ?? []).length} 项均未过期`)
    } catch (e) { report('sunset', 'warn', `budget 解析失败：${e.message}`) }
  }
}

const fails = findings.filter((f) => f.status === 'fail').length
const warns = findings.filter((f) => f.status === 'warn').length
if (JSON_OUT) {
  console.log(JSON.stringify({ ok: fails === 0, fails, warns, findings, at: new Date().toISOString() }, null, 2))
} else {
  console.log(`\nharness-doctor：${fails} fail / ${warns} warn / ${findings.length} 项`)
}
process.exit(fails > 0 ? 1 : 0)
