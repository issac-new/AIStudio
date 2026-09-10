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
})
