// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCockpitStore, type CockpitTask } from '@/custom/cockpit/store/cockpit'

const task = (over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: 't1',
  title: 'PR #142',
  category: 'human',
  priority: 'P0',
  status: 'review',
  assignee: '@张三',
  workspace: '~/ws/auth-svc',
  ...over,
})

describe('useCockpitStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('selects a task by id and exposes its workspace', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' }), task({ id: 't2', workspace: '~/ws/fe' })]
    s.selectTask('t2')
    expect(s.selectedTaskId).toBe('t2')
    expect(s.selectedTask?.workspace).toBe('~/ws/fe')
  })

  it('sorts tasks by priority (P0 first, then P1)', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 'b', priority: 'P1' }), task({ id: 'a', priority: 'P0' })]
    expect(s.sortedTasks.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('filters by priority, status, category', () => {
    const s = useCockpitStore()
    s.tasks = [
      task({ id: '1', priority: 'P0', status: 'review', category: 'human' }),
      task({ id: '2', priority: 'P1', status: 'blocked', category: 'cluster' }),
    ]
    s.filters = { priorities: ['P0'], statuses: [], categories: [] }
    expect(s.filteredTasks.map((t) => t.id)).toEqual(['1'])
  })

  it('empty filter array means "all" (not "none")', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: '1', priority: 'P0' }), task({ id: '2', priority: 'P2' })]
    s.filters = { priorities: [], statuses: [], categories: [] }
    expect(s.filteredTasks).toHaveLength(2)
  })

  it('toggles a column collapsed state', () => {
    const s = useCockpitStore()
    expect(s.collapsed.left).toBe(false)
    s.toggleCollapsed('left')
    expect(s.collapsed.left).toBe(true)
  })

  it('attention items derive a count', () => {
    const s = useCockpitStore()
    s.attention = [{ id: 'a1', severity: 'high', title: 'x', taskId: 't1' }]
    expect(s.attentionCount).toBe(1)
  })

  it('selectTask clears when id not found', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('nope')
    expect(s.selectedTaskId).toBeNull()
    expect(s.selectedTask).toBeNull()
  })

  it('toggleFilter adds then removes a value, and recomputes filteredTasks', () => {
    const s = useCockpitStore()
    s.tasks = [
      task({ id: '1', priority: 'P0', status: 'review', category: 'human' }),
      task({ id: '2', priority: 'P1', status: 'blocked', category: 'cluster' }),
    ]
    // add
    s.toggleFilter('priorities', 'P0')
    expect(s.filters.priorities).toEqual(['P0'])
    expect(s.filteredTasks.map((t) => t.id)).toEqual(['1'])
    // remove
    s.toggleFilter('priorities', 'P0')
    expect(s.filters.priorities).toEqual([])
    expect(s.filteredTasks.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('tasksByCategory groups filtered tasks by category', () => {
    const s = useCockpitStore()
    s.tasks = [
      task({ id: '1', category: 'human', priority: 'P0' }),
      task({ id: '2', category: 'cluster', priority: 'P0' }),
      task({ id: '3', category: 'human', priority: 'P1' }),
    ]
    expect(s.tasksByCategory.human.map((t) => t.id)).toEqual(['1', '3'])
    expect(s.tasksByCategory.cluster.map((t) => t.id)).toEqual(['2'])
    expect(s.tasksByCategory.direct).toEqual([])
  })

  it('selects a timeline node by id', () => {
    const s = useCockpitStore()
    s.events = [
      { id: 'e1', taskId: 't1', actor: 'review-agent', kind: 'A2A', what: '委派', when: '14:36', pending: true, ts: 1739 },
      { id: 'e2', taskId: 't1', actor: 'qa-agent', kind: 'A2H', what: '写用例', when: '14:40', pending: false, ts: 1740 },
    ]
    s.selectTimelineNode('e2')
    expect(s.selectedTimelineNodeId).toBe('e2')
    expect(s.selectedTimelineNode?.what).toBe('写用例')
  })

  it('eventsForSelectedTask filters by selected task id', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.events = [
      { id: 'e1', taskId: 't1', actor: 'a', kind: 'A2H', what: 'x', when: '14:00', pending: false, ts: 1 },
      { id: 'e2', taskId: 't2', actor: 'b', kind: 'A2A', what: 'y', when: '14:01', pending: false, ts: 2 },
    ]
    expect(s.eventsForSelectedTask.map((e) => e.id)).toEqual(['e1'])
  })

  it('topologyForTask returns app-level nodes by default', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1', workspace: '~/ws/auth-svc' })]
    s.selectTask('t1')
    s.appTopology = [
      { id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file', focus: true },
      { id: 'n2', taskId: 't1', label: 'auth.spec', kind: 'file', focus: false },
    ]
    const topo = s.topologyForSelectedTask
    expect(topo.level).toBe('app')
    expect(topo.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
  })

  it('switching topology level changes returned nodes', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.appTopology = [{ id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file', focus: true }]
    s.reqTopology = [{ id: 'r1', taskId: 't1', label: '认证重构', kind: 'req', focus: true }]
    s.projTopology = [{ id: 'p1', taskId: 't1', label: 'auth-platform', kind: 'project', focus: true }]
    s.topologyLevel = 'req'
    expect(s.topologyForSelectedTask.nodes[0].id).toBe('r1')
    s.topologyLevel = 'project'
    expect(s.topologyForSelectedTask.nodes[0].id).toBe('p1')
  })

  it('selecting a graph node sets selectedGraphNodeIds for that task', () => {
    const s = useCockpitStore()
    s.appTopology = [{ id: 'n1', taskId: 't1', label: 'refresh.ts', kind: 'file', focus: true }]
    s.toggleGraphNode('t1', 'n1')
    expect(s.selectedGraphNodeIds['t1']).toContain('n1')
    s.toggleGraphNode('t1', 'n1')
    expect(s.selectedGraphNodeIds['t1']).not.toContain('n1')
  })

  it('collapses older timeline events into a fold when more than threshold', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.events = Array.from({ length: 6 }, (_, i) => ({
      id: 'e' + i, taskId: 't1', actor: 'a', kind: 'A2H' as const, what: 'x' + i, when: '1' + i, pending: false, ts: i,
    }))
    const recent = s.recentEventsForSelectedTask(4)
    expect(recent.visible.map((e) => e.id)).toEqual(['e2', 'e3', 'e4', 'e5'])
    expect(recent.folded.length).toBe(2)
    expect(recent.folded.map((e) => e.id)).toEqual(['e0', 'e1'])
  })

  it('workItemForSelectedTask returns the work item bound to the selected task', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [
      { id: 'w1', taskId: 't1', decision: 'conditional', riskTags: ['concurrency', 'test-gap'], opinion: '补用例再合并', modifiedFiles: ['refresh.ts'] },
    ]
    expect(s.workItemForSelectedTask?.decision).toBe('conditional')
  })

  it('workItemForSelectedTask returns null when task has no work item', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = []
    expect(s.workItemForSelectedTask).toBeNull()
  })

  it('filesForSelectedTask returns files for the selected task workspace', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1', workspace: '~/ws/auth-svc' })]
    s.selectTask('t1')
    s.fileTrees = {
      't1': [
        { id: 'f1', name: 'src', isDir: true, children: [{ id: 'f2', name: 'refresh.ts', isDir: false, modified: true }] },
        { id: 'f3', name: 'package.json', isDir: false, modified: false },
      ],
    }
    const files = s.filesForSelectedTask
    expect(files.map((f) => f.id)).toEqual(['f1', 'f3'])
    expect(files[0].children?.[0].modified).toBe(true)
  })

  it('filesForSelectedTask returns empty array when task has no tree', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.fileTrees = {}
    expect(s.filesForSelectedTask).toEqual([])
  })

  it('selectFile sets selectedFileId', () => {
    const s = useCockpitStore()
    s.selectFile('f2')
    expect(s.selectedFileId).toBe('f2')
  })

  it('updateDecision updates the work item for selected task', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'conditional', riskTags: [], opinion: '', modifiedFiles: [] }]
    s.updateWorkItem({ decision: 'reject' })
    expect(s.workItemForSelectedTask?.decision).toBe('reject')
  })

  it('toggleRiskTag adds and removes a risk tag', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'conditional', riskTags: ['concurrency'], opinion: '', modifiedFiles: [] }]
    s.toggleRiskTag('test-gap')
    expect(s.workItemForSelectedTask?.riskTags).toContain('test-gap')
    s.toggleRiskTag('concurrency')
    expect(s.workItemForSelectedTask?.riskTags).not.toContain('concurrency')
  })

  it('switches workspace mode between work and chat', () => {
    const s = useCockpitStore()
    expect(s.workspaceMode).toBe('work')
    s.setWorkspaceMode('chat')
    expect(s.workspaceMode).toBe('chat')
  })

  it('channelsForSelectedTask returns channels bound to the task', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.channels = [
      { id: 'c1', taskId: 't1', kind: 'matrix', label: 'auth-svc 联调', members: ['张三', '李四', '你'] },
      { id: 'c2', taskId: 't2', kind: 'group', label: '其它', members: [] },
    ]
    expect(s.channelsForSelectedTask.map((c) => c.id)).toEqual(['c1'])
  })

  it('selectChannel sets active channel id and switches mode to chat', () => {
    const s = useCockpitStore()
    s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'x', members: [] }]
    s.selectChannel('c1')
    expect(s.activeChannelId).toBe('c1')
    expect(s.workspaceMode).toBe('chat')
  })

  it('messagesForActiveChannel returns messages for the active channel', () => {
    const s = useCockpitStore()
    s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'x', members: [] }]
    s.selectChannel('c1')
    s.messages = {
      c1: [
        { id: 'm1', channelId: 'c1', author: '张三', isMe: false, text: 'hello', ts: 1 },
        { id: 'm2', channelId: 'c1', author: '你', isMe: true, text: 'hi', ts: 2 },
      ],
    }
    expect(s.messagesForActiveChannel.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('sendMessage appends a message to the active channel', () => {
    const s = useCockpitStore()
    s.channels = [{ id: 'c1', taskId: 't1', kind: 'matrix', label: 'x', members: [] }]
    s.selectChannel('c1')
    s.sendMessage('ping')
    expect(s.messagesForActiveChannel.at(-1)?.text).toBe('ping')
    expect(s.messagesForActiveChannel.at(-1)?.isMe).toBe(true)
  })

  it('toggleMaximized toggles the right column maximized state', () => {
    const s = useCockpitStore()
    expect(s.maximized).toBe(false)
    s.toggleMaximized()
    expect(s.maximized).toBe(true)
  })
  it('terminalLines starts with seed intro lines', () => {
    const s = useCockpitStore()
    expect(s.terminalLines.length).toBeGreaterThan(0)
    expect(s.terminalMode).toBe(false)
  })

  it('enterTerminal switches workspace mode to term', () => {
    const s = useCockpitStore()
    s.enterTerminal()
    expect(s.terminalMode).toBe(true)
    expect(s.workspaceMode).toBe('term')
  })

  it('exitTerminal switches back to work mode', () => {
    const s = useCockpitStore()
    s.enterTerminal()
    s.exitTerminal()
    expect(s.terminalMode).toBe(false)
    expect(s.workspaceMode).toBe('work')
  })

  it('sendTerminalCommand appends a prompt line and a response line', () => {
    const s = useCockpitStore()
    const before = s.terminalLines.length
    s.sendTerminalCommand('ls')
    expect(s.terminalLines.length).toBe(before + 2)
    expect(s.terminalLines.at(-2)?.kind).toBe('prompt')
    expect(s.terminalLines.at(-2)?.text).toBe('ls')
  })

  it('history filters by action when filter set', () => {
    const s = useCockpitStore()
    s.history = [
      { id: 'h1', when: '今天 14:36', taskId: '1', action: '审批', title: '审批 PR', archived: false },
      { id: 'h2', when: '今天 13:20', taskId: '4', action: '决策', title: '决定延后', archived: false },
    ]
    s.historyFilters = { actions: ['审批'], archived: 'all' }
    expect(s.filteredHistory.map((h) => h.id)).toEqual(['h1'])
  })

  it('history filters archived-only', () => {
    const s = useCockpitStore()
    s.history = [
      { id: 'h1', when: '今天', taskId: '1', action: '审批', title: 'x', archived: false },
      { id: 'h2', when: '昨天', taskId: '2', action: '审批', title: 'y', archived: true },
    ]
    s.historyFilters = { actions: [], archived: 'only' }
    expect(s.filteredHistory.map((h) => h.id)).toEqual(['h2'])
  })

  it('recallHistoryItem sets archived mode when item archived', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.history = [{ id: 'h1', when: '昨天', taskId: 't1', action: '审批', title: 'y', archived: true }]
    s.recallHistoryItem('h1')
    expect(s.archivedMode).toBe(true)
    expect(s.selectedTaskId).toBe('t1')
  })

  it('recallHistoryItem clears archived mode when item not archived', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.history = [{ id: 'h1', when: '今天', taskId: 't1', action: '审批', title: 'x', archived: false }]
    s.recallHistoryItem('h1')
    expect(s.archivedMode).toBe(false)
  })
  it('templates list starts empty', () => {
    const s = useCockpitStore()
    expect(s.templates).toEqual([])
  })

  it('saveTemplateFromCurrentWorkItem creates a template from the selected task work item', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'conditional', riskTags: ['concurrency'], opinion: 'x', modifiedFiles: ['a.ts'] }]
    s.saveTemplateFromCurrentWorkItem('我的审核模板')
    expect(s.templates.length).toBe(1)
    expect(s.templates[0].name).toBe('我的审核模板')
    expect(s.templates[0].decision).toBe('conditional')
    expect(s.templates[0].riskTags).toContain('concurrency')
    expect(s.templates[0].id).toBeTruthy()
  })

  it('saveTemplateFromCurrentWorkItem does nothing when no work item', () => {
    const s = useCockpitStore()
    s.saveTemplateFromCurrentWorkItem('x')
    expect(s.templates).toEqual([])
  })

  it('deleteTemplate removes a template by id', () => {
    const s = useCockpitStore()
    s.templates = [{ id: 'tpl1', name: 'x', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [] }]
    s.deleteTemplate('tpl1')
    expect(s.templates).toEqual([])
  })

  it('applyTemplateToCurrentWorkItem copies template fields into the work item', () => {
    const s = useCockpitStore()
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    s.workItems = [{ id: 'w1', taskId: 't1', decision: 'reject', riskTags: [], opinion: '', modifiedFiles: [] }]
    s.templates = [{ id: 'tpl1', name: 't', decision: 'conditional', riskTags: ['perf'], opinion: 'ok', modifiedFiles: [] }]
    s.applyTemplateToCurrentWorkItem('tpl1')
    expect(s.workItemForSelectedTask?.decision).toBe('conditional')
    expect(s.workItemForSelectedTask?.riskTags).toContain('perf')
  })

  it('topology relations carry a2a/a2h labels', () => {
    const s = useCockpitStore()
    s.appRelations = [
      { id: 'rel1', taskId: 't1', from: 'n1', to: 'n2', label: 'A2A' },
      { id: 'rel2', taskId: 't1', from: 'n2', to: 'n3', label: 'A2H' },
    ]
    s.tasks = [task({ id: 't1' })]
    s.selectTask('t1')
    expect(s.relationsForSelectedTask.map((r) => r.id)).toEqual(['rel1', 'rel2'])
  })
})
