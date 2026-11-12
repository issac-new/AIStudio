import { describe, it, expect } from 'vitest'
import { buildTraceGraph } from '../trace'

type Header = Parameters<typeof buildTraceGraph>[0]
type Chunk = Parameters<typeof buildTraceGraph>[1][number]

const header: Header = { type: 'header', version: '1', session_id: 's1', started_at: 100 }

function llmPre(id: string): Chunk {
  return { type: 'chunk', kind: 'llm_span', phase: 'pre', session_id: 's1', api_request_id: id, started_at: 100 }
}

function llmPost(id: string, usage?: { input_tokens?: number; output_tokens?: number }): Chunk {
  return { type: 'chunk', kind: 'llm_span', phase: 'post', session_id: 's1', api_request_id: id, usage }
}

describe('buildTraceGraph usage 汇总（T2：usage anchor 跨运行累计）', () => {
  it('Σ in/out tokens 与 api_calls 按已完成的 llm_span 累计', () => {
    const chunks = [
      llmPre('api-1'), llmPost('api-1', { input_tokens: 100, output_tokens: 40 }),
      llmPre('api-2'), llmPost('api-2', { input_tokens: 250, output_tokens: 60 }),
      llmPre('api-3'), // 只有 pre（进行中）不计入
      { type: 'chunk', kind: 'tool_span', phase: 'post', session_id: 's1', tool_call_id: 't1' } as Chunk,
    ]
    const { usage } = buildTraceGraph(header, chunks)
    expect(usage).toEqual({ input_tokens: 350, output_tokens: 100, api_calls: 2 })
  })

  it('缺 usage 的 post 计入 api_calls、token 计 0', () => {
    const { usage } = buildTraceGraph(header, [llmPre('a'), llmPost('a'), llmPost('b')])
    expect(usage).toEqual({ input_tokens: 0, output_tokens: 0, api_calls: 2 })
  })

  it('空 chunks 返回零值汇总且保留 workflow 根节点', () => {
    const { usage, nodes } = buildTraceGraph(header, [])
    expect(usage).toEqual({ input_tokens: 0, output_tokens: 0, api_calls: 0 })
    expect(nodes.some(n => n.kind === 'workflow')).toBe(true)
  })

  it('节点携带结构化 ref，客户端不需要解析展示 ID 猜 span', () => {
    const chunks = [
      llmPre('api-1'), llmPost('api-1', { input_tokens: 1, output_tokens: 1 }),
      { type: 'chunk', kind: 'tool_span', phase: 'post', session_id: 's1', api_request_id: 'api-1', tool_call_id: 'tool-1', tool_name: 'run_tests' } as Chunk,
    ]
    const { nodes } = buildTraceGraph(header, chunks)
    expect(nodes.find((n) => n.kind === 'workflow')?.ref).toEqual({ sessionId: 's1' })
    expect(nodes.find((n) => n.id.includes('api-1'))?.ref).toEqual({ sessionId: 's1', spanRef: 'api-1', spanKind: 'llm_span' })
    expect(nodes.find((n) => n.id.includes('tool-1'))?.ref).toEqual({ sessionId: 's1', spanRef: 'tool-1', spanKind: 'tool_span' })
  })
})

describe('schema 1.2 执行语义与证据链', () => {
  it('step/compaction/hitl span 渲染为节点，waiting/resolved 合并', () => {
    const chunks = [
      { type: 'chunk', kind: 'step_span', span_kind: 'step', span_phase: 'start', session_id: 's1', turn_id: 'turn-1', step_index: 1, model: 'm', started_at: 100 } as Chunk,
      { type: 'chunk', kind: 'step_span', span_kind: 'step', span_phase: 'end', session_id: 's1', turn_id: 'turn-1', step_index: 1, started_at: 100, ended_at: 101, duration_ms: 1000, status: 'ok' } as Chunk,
      { type: 'chunk', kind: 'compaction_span', span_kind: 'compaction', span_phase: 'end', session_id: 's1', compaction_kind: 'history', before_tokens: 1000, after_tokens: 400, started_at: 101, status: 'ok' } as Chunk,
      { type: 'chunk', kind: 'hitl_span', span_kind: 'hitl', span_phase: 'waiting', session_id: 's1', request_id: 'req-1', hitl_kind: 'approval', started_at: 102, status: 'waiting' } as Chunk,
      { type: 'chunk', kind: 'hitl_span', span_kind: 'hitl', span_phase: 'resolved', session_id: 's1', request_id: 'req-1', outcome: 'approved', started_at: 102, ended_at: 105, duration_ms: 3000, status: 'ok' } as Chunk,
    ]
    const { nodes } = buildTraceGraph(header, chunks)
    expect(nodes.find(n => n.kind === 'step')?.detail).toBeDefined()
    expect(nodes.find(n => n.kind === 'compaction')?.detail).toBe('1000→400 tokens')
    expect(nodes.find(n => n.kind === 'hitl')).toMatchObject({ status: 'ok', detail: 'approved' })
  })

  it('context_manifest 不生成节点，原样返回供消费面读取', () => {
    const chunks = [
      { type: 'chunk', kind: 'context_manifest', span_kind: 'context', span_phase: 'snapshot', session_id: 's1', manifest_version: '1.0', context_fingerprint: 'sha256:abc', sources: [{ source_type: 'system_prompt', content_hash: 'sha256:def' }] } as Chunk,
    ]
    const { nodes, contextManifests } = buildTraceGraph(header, chunks)
    expect(nodes.some(n => n.kind === 'unknown' || n.kind === 'step')).toBe(false)
    expect(contextManifests).toHaveLength(1)
    expect(contextManifests[0].manifest_version).toBe('1.0')
    expect(contextManifests[0].sources?.[0].source_type).toBe('system_prompt')
  })

  it('旧 JSONL（只有 kind/phase）仍按原语义渲染，不产生 unknown 噪音', () => {
    const chunks = [
      llmPre('api-1'), llmPost('api-1', { input_tokens: 1, output_tokens: 1 }),
      { type: 'chunk', kind: 'tool_span', phase: 'post', session_id: 's1', tool_call_id: 't1' } as Chunk,
      { type: 'chunk', kind: 'subagent_span', phase: 'start', session_id: 's1', subagent_label: 'sub' } as Chunk,
      { type: 'chunk', kind: 'subagent_span', phase: 'stop', session_id: 's1', subagent_label: 'sub' } as Chunk,
    ]
    const { nodes } = buildTraceGraph(header, chunks)
    expect(nodes.some(n => n.kind === 'unknown')).toBe(false)
    expect(nodes.find(n => n.kind === 'agent')?.label).toBe('sub')
  })

  it('未知 span_kind 落 unknown 节点，不静默丢弃', () => {
    const chunks = [
      { type: 'chunk', kind: 'future_span', span_kind: 'future_kind', span_phase: 'end', session_id: 's1', started_at: 100 } as Chunk,
    ]
    const { nodes } = buildTraceGraph(header, chunks)
    const unknown = nodes.find(n => n.kind === 'unknown')
    expect(unknown).toBeTruthy()
    expect(unknown?.label).toBe('future_span')
    expect(unknown?.detail).toBe('future_kind')
  })
})
