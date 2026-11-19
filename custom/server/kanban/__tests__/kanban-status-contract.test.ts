// 看板状态词表对账守门（2026-11-19 流程地基批）。
//
// 目的：让「状态词表」只有一个正本（kernel kanban_workflow.py），同时把
// overlay 侧消费面常量与两份配置文件钉在同一集合上。任一侧增删列而另一侧没跟，
// 本测试即红——历史上正是这条漂移让 columns.yaml / handoff-rules.yaml 引用
// 不存在的列，自动派发链路整条静默失效。
//
// 断言三点：
//   1. KANBAN_STATUSES ≡ kernel DEFAULT_WORKFLOW 列键 ∪ {ARCHIVED}
//   2. runtime/roster/columns.yaml 的列键 ⊆ KANBAN_STATUSES
//   3. team/shared/handoff-rules.yaml 中 status: active 的 from/to ⊆ KANBAN_STATUSES
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { KANBAN_STATUSES } from '../kanban-status'

const ROOT = resolve(__dirname, '../../../..')
const KERNEL_WORKFLOW = resolve(ROOT, 'vendor/hermes-agent/hermes_cli/kanban_workflow.py')
const COLUMNS_YAML = resolve(ROOT, 'runtime/roster/columns.yaml')
const HANDOFF_RULES_YAML = resolve(ROOT, 'team/shared/handoff-rules.yaml')

/** 从 kernel 源码提取状态集合：DEFAULT_WORKFLOW 的 Column("<key>", ...) + ARCHIVED 常量。 */
function kernelStatuses(): string[] {
  const src = readFileSync(KERNEL_WORKFLOW, 'utf8')
  const keys: string[] = []
  const colRe = /Column\(\s*"([a-z_]+)"/g
  for (let m = colRe.exec(src); m; m = colRe.exec(src)) keys.push(m[1])
  const archived = /ARCHIVED\s*=\s*"([a-z_]+)"/.exec(src)
  expect(archived, 'kernel 未找到 ARCHIVED 常量定义').not.toBeNull()
  return [...keys, archived![1]]
}

/** 极简读取：只取顶层 columns 下的列名（两空格缩进 + 冒号）。 */
function columnsYamlKeys(): string[] {
  const lines = readFileSync(COLUMNS_YAML, 'utf8').split('\n')
  const out: string[] = []
  let inColumns = false
  for (const line of lines) {
    if (/^columns:\s*$/.test(line)) { inColumns = true; continue }
    if (!inColumns) continue
    if (/^\S/.test(line) && line.trim() !== '') break
    const m = /^ {2}([a-z_]+):\s*$/.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

/** 顺次扫 rules 块，收集 active 规则的 from/to 对。 */
function activeRuleEdges(): Array<{ ruleId: string; from: string; to: string }> {
  const lines = readFileSync(HANDOFF_RULES_YAML, 'utf8').split('\n')
  const out: Array<{ ruleId: string; from: string; to: string }> = []
  let cur: { ruleId?: string; from?: string; to?: string; status?: string } | null = null
  const flush = () => {
    if (cur && cur.status === 'active' && cur.from && cur.to) {
      out.push({ ruleId: cur.ruleId ?? '?', from: cur.from, to: cur.to })
    }
    cur = null
  }
  for (const line of lines) {
    if (/^ {6}- rule_id:\s*/.test(line)) {
      flush()
      cur = { ruleId: line.replace(/^ {6}- rule_id:\s*/, '').trim() }
      continue
    }
    if (!cur) continue
    const fm = /^ {8}from:\s*(\S+)/.exec(line)
    if (fm) { cur.from = fm[1]; continue }
    const tm = /^ {8}to:\s*(\S+)/.exec(line)
    if (tm) { cur.to = tm[1]; continue }
    const sm = /^ {8}status:\s*(\S+)/.exec(line)
    if (sm) { cur.status = sm[1]; continue }
  }
  flush()
  return out
}

describe('看板状态词表对账', () => {
  it('KANBAN_STATUSES 与 kernel DEFAULT_STATUSES 集合相等', () => {
    const kernel = kernelStatuses()
    expect(kernel.length, 'kernel 列解析为空，正则或源码结构已变').toBeGreaterThan(5)
    expect([...new Set(KANBAN_STATUSES)].sort()).toEqual([...new Set(kernel)].sort())
  })

  it('columns.yaml 的列键全部落在词表内', () => {
    const keys = columnsYamlKeys()
    expect(keys.length, 'columns.yaml 未解析出列条目').toBeGreaterThan(0)
    const unknown = keys.filter(k => !(KANBAN_STATUSES as readonly string[]).includes(k))
    expect(unknown, `columns.yaml 含词表外列名：${unknown.join(', ')}`).toEqual([])
  })

  it('handoff-rules.yaml 的 active 规则 from/to 全部落在词表内', () => {
    const edges = activeRuleEdges()
    expect(edges.length, 'handoff-rules.yaml 未解析出 active 规则').toBeGreaterThan(0)
    const known = new Set<string>(KANBAN_STATUSES)
    const bad = edges.filter(e => !known.has(e.from) || !known.has(e.to))
      .map(e => `${e.ruleId}(${e.from}→${e.to})`)
    expect(bad, `交接规则含词表外列名：${bad.join(', ')}`).toEqual([])
  })
})
