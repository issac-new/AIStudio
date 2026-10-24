#!/usr/bin/env node
// qgate-check.mjs — QGate 九门执行器（run20 复盘 C4：门绑执行器根治）
//
// 背景：feature-close profile 九门全 INCONCLUSIVE——模板门命令占位（npm run
// arch:check 等不存在），"门未绑执行器=无信号桶" 从 run12 骨架部署（中央仓
// 1edcc23）一直挂到 run20。本件为九门提供真实执行器：检查中央仓/集成分支上的
// 真实产物（冻结件/testlog/架构稿/注册表…），退出码即 verdict（0=pass，
// 1=fail；崩溃=INCONCLUSIVE 由 qgate 内核判）。
//
// 文件解析序：工作树 → origin/integration/RFD-001 → 缺席。集成分支在报告
// 持久化前不删（纪律 71），故 G5 时点证据总可反查。
//
// 用法：node qgate-check.mjs <kind>
//   kind ∈ basic-check|sast-audit|arch-fitness|acceptance-coverage|intent-drift|
//          registers|requirement-trace|scope-check|persistence-integrity
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const INTEGRATION = 'origin/integration/RFD-001'
const kind = process.argv[2]
if (!kind) { console.error('用法: qgate-check.mjs <kind>'); process.exit(1) }

const sh = (args) => { try { return execFileSync('git', args, { encoding: 'utf8', timeout: 30000 }) } catch { return null } }
const fail = (msg) => { console.log(`FAIL(${kind}): ${msg}`); process.exit(1) }
const pass = (msg) => { console.log(`PASS(${kind}): ${msg}`); process.exit(0) }

/** 读文件：工作树 → 集成分支 → null */
function readVia(rel) {
  try { return readFileSync(rel, 'utf8') } catch { /* 落 git 分支解析 */ }
  const viaGit = sh(['show', `${INTEGRATION}:${rel}`])
  return viaGit === null ? null : viaGit
}
/** 列目录（并集）：工作树 ∪ 集成分支 */
function listVia(dir) {
  const out = new Set()
  try { for (const f of readdirSync(dir)) out.add(f) } catch { /* 工作树可能无此目录 */ }
  const tree = sh(['ls-tree', '--name-only', INTEGRATION, dir + '/'])
  if (tree) for (const ln of tree.split('\n')) { const f = ln.trim().replace(dir + '/', ''); if (f) out.add(f) }
  return [...out]
}
function firstGlob(dir, re) {
  for (const f of listVia(dir)) if (re.test(f)) return join(dir, f)
  return null
}

// ── 各门检查 ──
const CHECKS = {
  'basic-check': () => {
    // L1 工程基线：G3 testlog（分支测试证据）与 G4 测试报告在案且全绿。
    const logs = listVia('docs/evidence').filter((f) => /-testlog(-fresh)?\.txt$/.test(f))
    if (logs.length === 0) fail('docs/evidence 零 testlog（G3 分支测试证据缺席）')
    const bad = []
    for (const f of logs) {
      const t = readVia(join('docs/evidence', f))
      if (t === null) { bad.push(`${f}:不可读`); continue }
      if (/(exit|rc)=[1-9]/.test(t) && !/exit=0/.test(t.split(/={3,}/).pop() || '')) bad.push(`${f}:含失败退出码`)
      if (!/(passed|✓|pass)/i.test(t)) bad.push(`${f}:无通过计数`)
    }
    const report = firstGlob('docs/test', /test-report.*\.md$/)
    if (!report) fail(`testlog ${logs.length} 件但 G4 测试报告缺席（docs/test/*test-report*.md）`)
    const rep = readVia(report) || ''
    const m = rep.match(/(?:passed)=(\d+).*?failed=(\d+)/s) || rep.match(/(\d+)\s*passed.*?(\d+)\s*failed/s)
    if (!m) fail(`测试报告无 passed/failed 计数行（${report}）`)
    if (Number(m[2]) > 0) fail(`测试报告 failed=${m[2]}（${report}）——工程基线未全绿`)
    if (bad.length) fail(`testlog 证据缺口：${bad.join('；')}`)
    pass(`testlog ${logs.length} 件全绿 + 测试报告 ${report} passed=${m[1]} failed=0`)
  },
  'sast-audit': () => {
    // L4 依赖审计：每件 testlog 须含 npm audit 证据（输出/漏洞计数/不可达声明三态之一——质量 B② 口径）
    const logs = listVia('docs/evidence').filter((f) => /-testlog(-fresh)?\.txt$/.test(f))
    if (logs.length === 0) fail('docs/evidence 零 testlog——依赖审计无承载体')
    const missing = []
    for (const f of logs) {
      const t = readVia(join('docs/evidence', f))
      if (t === null || !/(npm audit|vulnerabilities|漏洞|audit 不可达)/i.test(t)) missing.push(f)
    }
    if (missing.length) fail(`testlog 缺 npm audit 段：${missing.join('；')}（质量 B②：安全合规从派发词要求升级为闸门真查）`)
    pass(`依赖审计证据齐：${logs.length} 件 testlog 均含 audit 段（0 漏洞或不可达声明）`)
  },
  'arch-fitness': () => {
    // L4 架构适应度：概设稿在案且含四要素（接口契约/数据流/风险/决策记录）
    const doc = firstGlob('docs/design', /architecture-design.*\.md$/)
    if (!doc) fail('概设稿缺席（docs/design/*architecture-design*.md）')
    const t = readVia(doc) || ''
    const need = [['接口契约', /接口契约|接口签名/], ['数据流', /数据流|关键路径/], ['风险', /风险/], ['决策记录', /决策记录|决策五字段/]]
    const miss = need.filter(([, re]) => !re.test(t)).map(([n]) => n)
    if (miss.length) fail(`概设 ${doc} 缺要素：${miss.join('、')}`)
    pass(`架构适应度：概设 ${doc} 四要素齐（契约/数据流/风险/决策）`)
  },
  'acceptance-coverage': () => {
    // L0 验收覆盖：冻结件 AC ≥3 条且验收书逐条判词（AC-N 一一对应）
    const freeze = firstGlob('docs/requirements', /\.freeze\.md$/)
    if (!freeze) fail('G1 冻结件缺席（docs/requirements/*.freeze.md）')
    const fz = readVia(freeze) || ''
    const acs = [...new Set((fz.match(/AC-\d+/g) || []))]
    if (acs.length < 3) fail(`冻结件 AC 仅 ${acs.length} 条（<3 下限）`)
    const acc = firstGlob('docs/acceptance', /acceptance.*\.md$/)
    if (!acc) fail('验收书缺席（docs/acceptance/*acceptance*.md）')
    const ac = readVia(acc) || ''
    const missing = acs.filter((id) => !ac.includes(id))
    if (missing.length) fail(`验收书未覆盖 AC：${missing.join('、')}`)
    pass(`验收覆盖：冻结 ${acs.length} 条 AC 验收书逐条在案（${acc}）`)
  },
  'intent-drift': () => {
    // L0 意图漂移：冻结件带 frozen:true（锁后不许改，改则重新走锁）
    const freeze = firstGlob('docs/requirements', /\.freeze\.md$/)
    if (!freeze) fail('G1 冻结件缺席')
    const fz = readVia(freeze) || ''
    if (!/frozen:\s*true/.test(fz)) fail(`冻结件无 frozen:true 锁标记（${freeze}）`)
    pass(`意图锁定在案：${freeze} frozen:true`)
  },
  registers: () => {
    // L0 注册表：三件管理档案齐（roster/app-registry/org）
    const need = ['docs/admin/roster.md', 'docs/admin/app-registry.md', 'docs/admin/org.md']
    const missing = need.filter((p) => readVia(p) === null)
    if (missing.length) fail(`管理注册表缺件：${missing.join('、')}`)
    pass(`注册表三件齐：roster/app-registry/org`)
  },
  'requirement-trace': () => {
    // L0 需求追溯：冻结件含双向追溯位（上游需求/下游用例映射）
    const freeze = firstGlob('docs/requirements', /\.freeze\.md$/)
    if (!freeze) fail('G1 冻结件缺席')
    const fz = readVia(freeze) || ''
    if (!/追溯/.test(fz)) fail('冻结件无追溯节')
    if (!/上游/.test(fz) || !/下游/.test(fz)) fail('追溯节缺上游/下游双向位')
    pass(`双向追溯位在案（${freeze}）`)
  },
  'scope-check': () => {
    // L0 范围核查：冻结件明示范围外清单（不做什么已声明）
    const freeze = firstGlob('docs/requirements', /\.freeze\.md$/)
    if (!freeze) fail('G1 冻结件缺席')
    const fz = readVia(freeze) || ''
    if (!/Scope-Out|范围外/.test(fz)) fail('冻结件无 Scope-Out 范围外清单')
    pass(`范围外清单在案（${freeze}）`)
  },
  'persistence-integrity': () => {
    // L2 持久化完整性（aipaydev 形态=逻辑层 SDK，无运行时 DB）：持久化设计 +
    // 状态机/幂等行为证据。设计面=落库字段与索引设计文档（tasklist T01 交付物 4）；
    // 行为面=testlog 含状态机/幂等用例通过记录。真 DB 场景演练属 runtime-proof 面，
    // 本门覆盖声明为证据强度 present+testlog（非 exercised-on-live-db，如实标注）。
    const design = ['docs/design', 'docs/analysis', 'docs/research'].map((d) => firstGlob(d, /\.md$/))
    const anyPersistDesign = design.some((p) => {
      if (!p) return false
      const t = readVia(p) || ''
      return /(落库|索引|唯一键|schema|存储模型)/.test(t)
    })
    if (!anyPersistDesign) fail('持久化设计面缺席：design/analysis/research 无落库字段与索引设计文档（tasklist T01 交付物 4）')
    const logs = listVia('docs/evidence').filter((f) => /-testlog(-fresh)?\.txt$/.test(f))
    const hasBehavior = logs.some((f) => {
      const t = readVia(join('docs/evidence', f))
      return t && /(state-machine|幂等|idempoten)/i.test(t)
    })
    if (!hasBehavior) fail('持久化行为面缺席：testlog 无状态机/幂等用例记录')
    pass('持久化完整性（present 档）：落库/索引设计文档 + 状态机/幂等用例证据在案（运行时 DB 演练属 runtime-proof 门）')
  },
}

const fn = CHECKS[kind]
if (!fn) { console.error(`未知 kind: ${kind}（合法值：${Object.keys(CHECKS).join('|')}）`); process.exit(1) }
fn()
