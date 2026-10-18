// Cua 截图证据提取守门：三种到达形态、只认 node_repl/computer-use 工具、
// base64 image 转 data URL、URL 形态排除、新→旧排序。
import { describe, it, expect } from 'vitest'
import { collectCuaEvidence } from '../utils/cuaEvidence'

const b64 = 'aGVsbG8=' // "hello"
const msg = (over: Record<string, unknown>) => ({ id: 'm1', role: 'tool', toolName: 'mcp__node_repl__js', timestamp: 5, ...over })

describe('collectCuaEvidence', () => {
  it('形态 A：toolResult 直接是 content 数组 → 提取 image + note', () => {
    const out = collectCuaEvidence([msg({ toolResult: [
      { type: 'image', data: b64, mimeType: 'image/png' },
      { type: 'text', text: 'Captured 5 bytes PNG.' },
    ] })])
    expect(out).toHaveLength(1)
    expect(out[0].data).toBe(`data:image/png;base64,${b64}`)
    expect(out[0].note).toBe('Captured 5 bytes PNG.')
  })

  it('形态 B/C：{content:[...]} 与 {output:{content:[...]}}；字符串化 JSON 同解', () => {
    const payload = { content: [{ type: 'image', data: b64 }] }
    expect(collectCuaEvidence([msg({ toolResult: payload })])).toHaveLength(1)
    expect(collectCuaEvidence([msg({ toolResult: JSON.stringify(payload) })])).toHaveLength(1)
    expect(collectCuaEvidence([msg({ toolResult: { output: payload } })])).toHaveLength(1)
  })

  it('非 CUA 工具 / 无 image / 纯文本 / 非 JSON 字符串 → 空', () => {
    expect(collectCuaEvidence([msg({ toolName: 'bash', toolResult: [{ type: 'image', data: b64 }] })])).toHaveLength(0)
    expect(collectCuaEvidence([msg({ toolResult: [{ type: 'text', text: 'ok' }] })])).toHaveLength(0)
    expect(collectCuaEvidence([msg({ toolResult: 'plain output' })])).toHaveLength(0)
    expect(collectCuaEvidence([])).toHaveLength(0)
  })

  it('http(s) URL data 不算证据；损坏 JSON 忽略；非 image mime 忽略', () => {
    expect(collectCuaEvidence([msg({ toolResult: [{ type: 'image', data: 'https://x/y.png', mimeType: 'image/png' }] })])).toHaveLength(0)
    expect(collectCuaEvidence([msg({ toolResult: '{broken' })])).toHaveLength(0)
    expect(collectCuaEvidence([msg({ toolResult: [{ type: 'image', data: b64, mimeType: 'text/plain' }] })])).toHaveLength(0)
  })

  it('多条消息新→旧；data URL 形态原样保留', () => {
    const out = collectCuaEvidence([
      msg({ id: 'a', timestamp: 1, toolResult: [{ type: 'image', data: b64 }] }),
      msg({ id: 'b', timestamp: 9, toolResult: { content: [{ type: 'image', data: `data:image/png;base64,${b64}` }] } }),
    ])
    expect(out.map(x => x.id.startsWith('b') ? 'b' : 'a')).toEqual(['b', 'a'])
    expect(out[0].data).toBe(`data:image/png;base64,${b64}`)
  })
})
