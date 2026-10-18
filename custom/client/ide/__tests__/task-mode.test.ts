// overlay/custom/client/ide/__tests__/task-mode.test.ts
// 守门：任务模式派生（有 codingAgentId=编程，其余=工作）与新建载荷分流。
// 语义锚点：Qoder 编程/通用双模式共享引擎（web-products.md §3.11）；
// MiniMax AppMode=coding|work（tools-batch1.md §4）；OpenAI Work 隐藏 Git/shell/diff（§1.11）。
import { describe, it, expect } from 'vitest'
import { sessionTaskMode, buildNewTaskOptions, explicitTaskMode } from '../utils/task-mode'

describe('sessionTaskMode（派生零新增字段）', () => {
  it('有 codingAgentId → coding；无/空 → work（历史 hermes 会话=工作）', () => {
    expect(sessionTaskMode({ codingAgentId: 'zcode' })).toBe('coding')
    expect(sessionTaskMode({ codingAgentId: 'claude-code' })).toBe('coding')
    expect(sessionTaskMode({ codingAgentId: null })).toBe('work')
    expect(sessionTaskMode({})).toBe('work')
    expect(sessionTaskMode(null)).toBe('work')
    expect(sessionTaskMode(undefined)).toBe('work')
  })

  it('编码标记兜底：codingAgentMode scoped/global 或 source=coding_agent 也算编程', () => {
    expect(sessionTaskMode({ codingAgentMode: 'scoped' })).toBe('coding')
    expect(sessionTaskMode({ codingAgentMode: 'global' })).toBe('coding')
    expect(sessionTaskMode({ source: 'coding_agent' })).toBe('coding')
    expect(sessionTaskMode({ source: 'cli', agent: 'hermes' } as never)).toBe('work')
  })
})

describe('explicitTaskMode（只认显式标记，残缺数据返回 null）', () => {
  it('编码标记 → coding；cli/api_server/hermes → work；两头都没有 → null', () => {
    expect(explicitTaskMode({ codingAgentId: 'zcode' })).toBe('coding')
    expect(explicitTaskMode({ codingAgentMode: 'scoped' })).toBe('coding')
    expect(explicitTaskMode({ source: 'coding_agent' })).toBe('coding')
    expect(explicitTaskMode({ source: 'cli' })).toBe('work')
    expect(explicitTaskMode({ source: 'api_server' })).toBe('work')
    expect(explicitTaskMode({ agent: 'hermes' })).toBe('work')
    expect(explicitTaskMode({})).toBeNull()
    expect(explicitTaskMode({ id: 's1', model: '' } as never)).toBeNull()
    expect(explicitTaskMode(null)).toBeNull()
  })
})

describe('buildNewTaskOptions（编程/工作内核分流）', () => {
  it('编程：zcode scoped 会话 + 工作区 + 默认模型（现有配方不回归）', () => {
    const opts = buildNewTaskOptions({
      mode: 'coding', codingAgentId: 'zcode', chatAgent: 'zcode',
      workspace: '/repo', model: 'glm-5.3', provider: 'bigmodel',
    })
    expect(opts).toEqual({
      agent: 'zcode',
      codingAgentId: 'zcode',
      codingAgentMode: 'scoped',
      source: 'coding_agent',
      workspace: '/repo',
      model: 'glm-5.3',
      provider: 'bigmodel',
    })
  })

  it('编程：无默认模型时不带 model/provider 键（空对象不污染会话）', () => {
    const opts = buildNewTaskOptions({
      mode: 'coding', codingAgentId: 'zcode', chatAgent: 'zcode', workspace: '/repo',
    })
    expect(opts).not.toHaveProperty('model')
    expect(opts).not.toHaveProperty('provider')
  })

  it('工作：hermes 原生会话，无 codingAgentId、不绑仓库、不带 zcode 模型', () => {
    const opts = buildNewTaskOptions({
      mode: 'work', codingAgentId: 'zcode', chatAgent: 'zcode',
      workspace: '/repo', model: 'glm-5.3', provider: 'bigmodel',
    })
    expect(opts).toEqual({ agent: 'hermes', source: 'cli', workspace: null })
    expect(opts).not.toHaveProperty('codingAgentId')
    expect(opts).not.toHaveProperty('model')
  })

  it('claude-code 映射为 chat agent=claude（映射由调用方传入，不在本函数猜）', () => {
    const opts = buildNewTaskOptions({
      mode: 'coding', codingAgentId: 'claude-code', chatAgent: 'claude', workspace: '/repo',
    })
    expect(opts.agent).toBe('claude')
    expect(opts.codingAgentId).toBe('claude-code')
  })
})
