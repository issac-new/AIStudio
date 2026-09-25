// MCP 目录化守门（antigravity：工具级禁用/Store 装机数/可用工具）。
import { describe, it, expect } from 'vitest'
import { availableTools, catalogView, toggleTool } from '../mcp-catalog'

const entry = {
  serverId: 'm1', name: 'M1', storeSource: 'store://m1',
  tools: ['read', 'write', 'search'], disabledTools: [],
}

describe('MCP 目录化（antigravity 语义）', () => {
  it('工具级禁用（非全有全无）；可用工具扣减；目录汇总', () => {
    let entries = toggleTool([entry], 'm1', 'write', true)
    expect(entries[0].disabledTools).toEqual(['write'])
    expect(availableTools(entries[0])).toEqual(['read', 'search'])
    entries = toggleTool(entries, 'm1', 'write', false)  // 解禁
    expect(entries[0].disabledTools).toEqual([])
    expect(catalogView(entries)).toEqual({ installed: 1, storeInstalled: 1, disabledToolCount: 0 })
    expect(toggleTool([entry], 'nope', 'read', true)).toHaveLength(1)  // 未知 server 原样
  })
})
