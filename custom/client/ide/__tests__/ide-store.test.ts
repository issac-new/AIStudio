// overlay/custom/client/ide/__tests__/ide-store.test.ts
// ide store 纯逻辑守门：默认值（codex 底座）、持久化往返、agent 映射。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useIdeStore, ideAgentToChatAgent, DEFAULT_IDE_AGENT } from '../store/ide'

describe('ideAgentToChatAgent（coding agent → chat agent 映射）', () => {
  it('codex 默认底座映射正确（ChatPanel 新建会话配方抄送）', () => {
    expect(DEFAULT_IDE_AGENT).toBe('codex')
    expect(ideAgentToChatAgent('codex')).toBe('codex')
    expect(ideAgentToChatAgent('claude-code')).toBe('claude')
    expect(ideAgentToChatAgent('dsh')).toBe('dsh')
    expect(ideAgentToChatAgent('pi')).toBe('pi')
    expect(ideAgentToChatAgent('grok')).toBe('grok')
    expect(ideAgentToChatAgent('opencode')).toBe('opencode')
  })
})

describe('ide store（workspace/agent/布局持久化）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('默认：workspace 空、agent=codex、三列布局默认值', () => {
    const ide = useIdeStore()
    expect(ide.workspace).toBeNull()
    expect(ide.agentId).toBe('codex')
    expect(ide.chatTab).toBe('messages')
    expect(ide.layout).toMatchObject({
      workspaceVisible: true,
      chatVisible: true,
      terminalOpen: false,
    })
  })

  it('setWorkspace 持久化：设置/清空往返', () => {
    const ide = useIdeStore()
    ide.setWorkspace('/Users/x/.hermes/kanban/ws-1')
    expect(ide.workspace).toBe('/Users/x/.hermes/kanban/ws-1')
    expect(localStorage.getItem('hermes_ide_workspace')).toBe('/Users/x/.hermes/kanban/ws-1')
    ide.setWorkspace('  ')
    expect(ide.workspace).toBeNull()
    expect(localStorage.getItem('hermes_ide_workspace')).toBe('')
  })

  it('setAgentId 持久化且新 store 实例（新 pinia）回读保存值', () => {
    const ide = useIdeStore()
    ide.setAgentId('claude-code')
    expect(localStorage.getItem('hermes_ide_agent')).toBe('claude-code')
    // 新 pinia 实例强制重新执行 setup，验证从 localStorage 读回
    setActivePinia(createPinia())
    const second = useIdeStore()
    expect(second.agentId).toBe('claude-code')
  })

  it('terminalCwd：workspace 未设置回退 ~（与 CockpitTerminalPane 语义一致）', () => {
    const ide = useIdeStore()
    expect(ide.terminalCwd).toBe('~')
    ide.setWorkspace('/tmp/ws')
    expect(ide.terminalCwd).toBe('/tmp/ws')
  })
})
