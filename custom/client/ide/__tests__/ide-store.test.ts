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
    // v12.4 栏控语义：三列各有 folded/maximized；visible 族布尔已随死开关清理退役
    expect(ide.layout).toMatchObject({
      terminalHeight: 240,
      sidebar: { folded: false, maximized: false },
      workspace: { folded: false, maximized: false },
      chat: { folded: false, maximized: false },
    })
    expect(ide.layout).not.toHaveProperty('workspaceVisible')
    expect(ide.layout).not.toHaveProperty('chatVisible')
    expect(ide.layout).not.toHaveProperty('terminalOpen')
  })

  it('浮窗开关默认关闭、toggleFloat 翻转（瞬态不持久化）', () => {
    const ide = useIdeStore()
    expect(ide.floats).toEqual({ plan: false, agents: false })
    ide.toggleFloat('plan')
    ide.toggleFloat('agents')
    expect(ide.floats).toEqual({ plan: true, agents: true })
    ide.toggleFloat('plan')
    expect(ide.floats.plan).toBe(false)
  })

  it('维度持久化：历史残留 chain 回落 task（链路维度退役守门）', () => {
    localStorage.setItem('hermes_ide_dim', 'chain')
    setActivePinia(createPinia())
    const ide = useIdeStore()
    expect(ide.dimension).toBe('task')
    ide.setDimension('project')
    expect(localStorage.getItem('hermes_ide_dim')).toBe('project')
  })

  it('旧偏好（仅 organize）加载回填 sessionView=active', () => {
    localStorage.setItem('hermes_ide_sidebar', JSON.stringify({ organize: 'grouped' }))
    setActivePinia(createPinia())
    const ide = useIdeStore()
    expect(ide.sidebar.organize).toBe('grouped')
    expect(ide.sidebar.sessionView).toBe('active')
  })

  it('侧栏组织模式持久化：organize 往返（view 字段已退役）', () => {
    const ide = useIdeStore()
    expect(ide.sidebar.organize).toBe('project')
    ide.setOrganize('timeline')
    setActivePinia(createPinia())
    const second = useIdeStore()
    expect(second.sidebar.organize).toBe('timeline')
    expect('view' in second.sidebar).toBe(false)
  })

  it('三段视图 sessionView 持久化：active→done 往返', () => {
    const ide = useIdeStore()
    expect(ide.sidebar.sessionView).toBe('active')
    ide.setSessionView('done')
    setActivePinia(createPinia())
    const second = useIdeStore()
    expect(second.sidebar.sessionView).toBe('done')
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
