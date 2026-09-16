// overlay/custom/client/ide/__tests__/agents.test.ts
// IDE agent 选项适配层守门：codex 置顶排序、未安装态透出。
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/api/coding-agents', () => ({
  fetchCodingAgentsStatus: vi.fn(),
}))

import { toAgentOptions } from '../api/agents'
import type { CodingAgentToolStatus } from '@/api/coding-agents'

function tool(id: string, overrides: Partial<CodingAgentToolStatus> = {}): CodingAgentToolStatus {
  return {
    id: id as CodingAgentToolStatus['id'],
    name: id,
    provider: '',
    command: id,
    packageName: id,
    installed: true,
    version: '1.0.0',
    rawVersion: '1.0.0',
    ...overrides,
  }
}

describe('toAgentOptions（agent 选择器选项）', () => {
  it('codex 置顶（用户指定的底座），其余按既定顺序', () => {
    const options = toAgentOptions([
      tool('grok'),
      tool('claude-code'),
      tool('codex'),
      tool('dsh'),
    ])
    expect(options.map((o) => o.id)).toEqual(['codex', 'claude-code', 'dsh', 'grok'])
  })

  it('未安装项保留且 installed=false（选择器禁用并显示状态）', () => {
    const options = toAgentOptions([
      tool('codex', { installed: false, version: '' }),
    ])
    expect(options).toHaveLength(1)
    expect(options[0].installed).toBe(false)
    expect(options[0].version).toBe('')
  })
})
