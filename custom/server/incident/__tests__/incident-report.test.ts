// overlay/custom/server/incident/__tests__/incident-report.test.ts
// 事故报告汇编器守门测试（2026-10-08 六文调研轮 A+B）。
// 断言面：17 要素齐全、诚实降级（缺席标 absent 不造数）、自治度对账黄条、
// 报告层最小暴露（内容只留预览、凭证不带原文）、Markdown 渲染可读。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIncidentReport } from '../incident-report'
import { renderIncidentMarkdown } from '../incident-markdown'
import type { IncidentElement, IncidentReport } from '../incident-types'

let dbDir: string
let traceDir: string
let dbFile: string
let report: IncidentReport

const SESSION = 'sess-incident-test-1'

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'incident-db-'))
  traceDir = mkdtempSync(join(tmpdir(), 'incident-trace-'))
  mkdirSync(join(dbDir, 'data'), { recursive: true })
  dbFile = join(dbDir, 'data', 'hermes-web-ui.db')
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(dbFile)
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, profile TEXT, created_at INTEGER);
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '', tool_call_id TEXT, tool_calls TEXT, tool_name TEXT,
      run_marker TEXT, timestamp INTEGER NOT NULL, token_count INTEGER, finish_reason TEXT,
      reasoning TEXT, reasoning_details TEXT, reasoning_content TEXT
    );
    CREATE TABLE workflow_runs (
      id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, status TEXT, snapshot_nodes_json TEXT, snapshot_edges_json TEXT, created_at INTEGER
    );
    CREATE TABLE workflow_run_node_sessions (
      execution_id TEXT, run_id TEXT, session_id TEXT, node_key TEXT, iterations INTEGER, error TEXT
    );
    CREATE TABLE workflow_run_edge_evaluations (
      run_id TEXT, edge_id TEXT, route TEXT, reason TEXT
    );
  `)
  db.prepare('INSERT INTO sessions (id, title, profile, created_at) VALUES (?, ?, ?, ?)').run(SESSION, '事故演练会话', 'coding-agent', 1790000000000)
  const ins = db.prepare('INSERT INTO messages (session_id, role, content, tool_name, timestamp, token_count, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?)')
  ins.run(SESSION, 'user', '帮我跑一下构建', null, 1790000001000, 10, null)
  ins.run(SESSION, 'assistant', '好的，开始执行', null, 1790000002000, 20, '先检查构建脚本')
  ins.run(SESSION, 'tool', '{"ok":true}', 'terminal_exec', 1790000003000, 5, null)
  ins.run(SESSION, 'tool', '{"error":"rm denied"}', 'terminal_exec', 1790000004000, 5, null)
  db.prepare('INSERT INTO workflow_runs (id, workflow_id, status, snapshot_nodes_json, snapshot_edges_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('wf-run-1', 'wf-1', 'done', '[{"id":"n1"},{"id":"n2"}]', '[{"id":"e1"}]', 1790000005000)
  db.prepare('INSERT INTO workflow_run_node_sessions (execution_id, run_id, session_id, node_key, iterations, error) VALUES (?, ?, ?, ?, ?, ?)')
    .run('ex1', 'wf-run-1', SESSION, 'n1', 2, null)
  db.prepare('INSERT INTO workflow_run_edge_evaluations (run_id, edge_id, route, reason) VALUES (?, ?, ?, ?)')
    .run('wf-run-1', 'e1', 'next', 'n1 done')
  db.close()
  // trace 文件：一次带工具调用+子代理的轨迹
  const traceFile = join(traceDir, `${SESSION}.jsonl`)
  const lines = [
    JSON.stringify({ type: 'header', version: '1', session_id: SESSION, started_at: 1790000001000, model: 'test-model', provider: 'test' }),
    JSON.stringify({ type: 'chunk', kind: 'tool_span', tool_name: 'terminal_exec', tool_call_id: 'tc1', status: 'ok', ts: 1790000003000, duration_ms: 120, args: { command: 'npm run build' } }),
    JSON.stringify({ type: 'chunk', kind: 'tool_span', tool_name: 'browser_navigate', tool_call_id: 'tc2', status: 'ok', ts: 1790000003500, duration_ms: 80, args: { url: 'https://example.com' } }),
    JSON.stringify({ type: 'chunk', kind: 'subagent_span', subagent_label: 'sub-build', phase: 'stop', status: 'ok', started_at: 1790000003100, ended_at: 1790000003900 }),
    JSON.stringify({ type: 'chunk', kind: 'llm_span', phase: 'post', usage: { input_tokens: 100, output_tokens: 50 } }),
    JSON.stringify({ type: 'trailer', session_id: SESSION, ended_at: 1790000004000, duration_ms: 3000, outcome: 'completed' }),
  ]
  writeFileSync(traceFile, lines.join('\n') + '\n', 'utf8')
  // describe 体在收集阶段立即执行——fixture 建好后才能构造报告（本轮实测教训）
  report = buildIncidentReport(SESSION, { dbPath: dbFile, traceDir, now: 1790000100000 })
})

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true })
  rmSync(traceDir, { recursive: true, force: true })
})

function byKey(elements: IncidentElement[], key: string): IncidentElement {
  const e = elements.find((x) => x.key === key)
  if (!e) throw new Error(`missing element ${key}`)
  return e
}

describe('incident report assembler', () => {

  it('17 要素齐全且分类正确', () => {
    expect(report.elements).toHaveLength(17)
    expect(report.elements.filter((e) => e.category === 'trajectory')).toHaveLength(6)
    expect(report.elements.filter((e) => e.category === 'capability')).toHaveLength(7)
    expect(report.elements.filter((e) => e.category === 'orchestration')).toHaveLength(4)
  })

  it('消息历史要素如实采集（计数与预览，不全文）', () => {
    const e = byKey(report.elements, 'message_history')
    expect(e.status).toBe('collected')
    expect((e.detail as { total: number }).total).toBe(4)
    const preview = (e.detail as { preview: Array<{ contentPreview: string }> }).preview
    expect(preview[0].contentPreview).toBe('帮我跑一下构建')
    expect(preview.every((p) => p.contentPreview.length <= 160)).toBe(true)
  })

  it('推理要素：1 轮 reasoning 如实计数', () => {
    const e = byKey(report.elements, 'reasoning_tokens')
    expect(e.status).toBe('collected')
    expect(e.summary).toContain('1 轮')
  })

  it('实际工具调用：terminal_exec×1 + browser_navigate×1（trace span 为准，消息表 tool 行不重复计）', () => {
    const e = byKey(report.elements, 'effective_tool_use')
    expect(e.status).toBe('collected')
    const byName = (e.detail as { byName: Record<string, number> }).byName
    expect(byName['terminal_exec']).toBe(1)
    expect(byName['browser_navigate']).toBe(1)
  })

  it('数据来源：browser_navigate 命中外部触达面（partial 如实）', () => {
    const e = byKey(report.elements, 'data_sources')
    expect(e.status).toBe('partial')
    expect(e.summary).toContain('browser_navigate')
  })

  it('OS 交互：trace 面 terminal_exec×1 落 collected', () => {
    const e = byKey(report.elements, 'os_interactions')
    expect(e.status).toBe('collected')
    expect((e.detail as { count: number }).count).toBe(1)
  })

  it('设计/运行拓扑：workflow 快照 2 节点 + 实际 1 节点会话', () => {
    const design = byKey(report.elements, 'design_topology')
    expect(design.status).toBe('collected')
    expect((design.detail as { nodes: number }).nodes).toBe(2)
    const rt = byKey(report.elements, 'runtime_topology')
    expect(rt.status).toBe('collected')
  })

  it('诚实降级：身份册为空时 agent_identity/委托链/凭证 = absent 且注明原因', () => {
    for (const key of ['agent_identity', 'delegation_chain', 'auth_credentials']) {
      const e = byKey(report.elements, key)
      expect(e.status).toBe('absent')
      expect(e.note).toBeTruthy()
    }
  })

  it('自治度对账：无配置面 + 活跃运行面 → 黄条告警', () => {
    expect(report.autonomy.theoretical.status).toBe('absent')
    expect(report.autonomy.effective.status).toBe('collected')
    const warns = report.autonomy.divergences.filter((d) => d.severity === 'warn')
    expect(warns.some((w) => w.finding.includes('设计态零约束'))).toBe(true)
  })

  it('报告层最小暴露：elements 序列化后不含密钥原文字段名', () => {
    const s = JSON.stringify(report)
    expect(s).not.toContain('apiKey')
    expect(s).not.toContain('secret')
  })

  it('coverage 计数自洽', () => {
    const c = report.coverage
    expect(c.total).toBe(17)
    expect(c.collected + c.partial + c.absent).toBe(17)
  })

  it('Markdown 渲染：含四节标题、黄条与要素行', () => {
    const md = renderIncidentMarkdown(report)
    expect(md).toContain('# Agent 事故报告')
    expect(md).toContain('一、执行轨迹')
    expect(md).toContain('二、能力与权限')
    expect(md).toContain('三、子组件与编排')
    expect(md).toContain('四、自治度对账')
    expect(md).toContain('⚠️ 黄条')
    expect(md).toContain('message_history')
  })

  it('空 session：17 要素仍齐全、不抛异常（查到 0 条=合法数据，非 undefined）', () => {
    const empty = buildIncidentReport('sess-not-exist', { dbPath: dbFile, traceDir, now: 1 })
    expect(empty.elements).toHaveLength(17)
    expect(empty.coverage.total).toBe(17)
    expect(empty.subject.messages).toBe(0)
    expect(empty.subject.traceFile).toBeUndefined()
    expect(byKey(empty.elements, 'message_history').status).toBe('collected')
    expect(byKey(empty.elements, 'effective_tool_use').status).toBe('absent')
  })
})
