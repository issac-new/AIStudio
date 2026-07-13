# RunTraceView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first-layer RunTraceView: a pure-frontend, overlay-only observability modal that renders live/replayed run events as a trustworthy Evidence Graph with skill drilldown and thinking-flow presentation.

**Architecture:** Add focused overlay modules under `overlay/custom/client/cockpit/`: a pure `run-trace-adapter.ts` for RunEvent→TraceNode/TraceEdge state, a `useRunTrace.ts` composable for parallel session event subscription, and small Vue components for modal shell, graph, time band, inspector, and skill drilldown. Integrate via the existing Cockpit store/modal pattern and trigger from `CockpitTimeline` run events.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Vitest, @vue/test-utils, existing CSS variables from `variables.scss`, existing `registerSessionHandlers` API from `@/api/hermes/chat`.

---

## Scope and guardrails

- Modify only `overlay/` and docs under `docs/superpowers/`.
- Do not modify `upstream/` directly.
- Use overlay tests only: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- --run <test-file>`.
- Before implementation, create a feature branch in the overlay repo:

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git checkout -b feat/run-trace-view
```

If `git checkout main` refuses due existing worktree changes, stop and ask the owner before touching unrelated files.

---

## File structure

### Create

- `overlay/custom/client/cockpit/adapters/run-trace-adapter.ts`  
  Pure types and reducer-style functions. No Vue imports. Converts `RunEvent`-like objects into `TraceState`.

- `overlay/custom/client/cockpit/composables/useRunTrace.ts`  
  Vue composable that calls `registerSessionHandlers`, provides all required callbacks/noops, owns attach/detach lifecycle, and delegates data updates to adapter functions.

- `overlay/custom/client/cockpit/components/CockpitRunTraceModal.vue`  
  Fullscreen modal shell: topbar, time band, graph/drilldown main area, inspector.

- `overlay/custom/client/cockpit/components/RunTraceGraph.vue`  
  SVG/CSS-based first implementation of the Evidence Graph. Do not introduce new dependencies; reserve vue-flow for later if needed.

- `overlay/custom/client/cockpit/components/RunTraceTimeBand.vue`  
  Top time band using plain div bars. Avoid echarts in first implementation to keep it testable and light.

- `overlay/custom/client/cockpit/components/RunTraceInspector.vue`  
  Right detail pane for focused node/timeline item.

- `overlay/custom/client/cockpit/components/RunTraceSkillDrilldown.vue`  
  Skill timeline view: thinking/tool/memory items in timestamp order.

- `overlay/custom/client/cockpit/__tests__/run-trace-adapter.test.ts`
- `overlay/custom/client/cockpit/__tests__/use-run-trace.test.ts`
- `overlay/custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts`

### Modify

- `overlay/custom/client/cockpit/store/cockpit.ts`  
  Add modal state and actions: `runTraceOpen`, `runTraceSessionId`, `runTraceTaskId`, `runTraceRunId`, `openRunTrace`, `closeRunTrace`.

- `overlay/custom/client/cockpit/components/CockpitTimeline.vue`  
  Add a RunTrace trigger for run events. Keep existing double-click title-detail behavior for non-run events.

- `overlay/custom/client/cockpit/views/CockpitView.vue`  
  Mount `<CockpitRunTraceModal />` alongside existing modal components.

---

## Task 1: Run trace adapter types and initial state

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/run-trace-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/run-trace-adapter.test.ts`

- [ ] **Step 1: Write failing tests for initial state and run node creation**

Create `overlay/custom/client/cockpit/__tests__/run-trace-adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createTraceState,
  applyRunEvent,
  getFocusedNode,
  type TraceState,
} from '../adapters/run-trace-adapter'

const evt = (over: Record<string, any> = {}) => ({
  event: 'run.started',
  run_id: 'run-1',
  session_id: 's1',
  timestamp: 1000,
  ...over,
})

describe('run-trace-adapter', () => {
  it('creates an empty trace state', () => {
    const state = createTraceState('s1')
    expect(state.sessionId).toBe('s1')
    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
    expect(state.focusedNodeId).toBeNull()
  })

  it('creates ingress and run nodes on run.started', () => {
    let state: TraceState = createTraceState('s1')
    state = applyRunEvent(state, evt())

    expect(state.nodes.map(n => [n.kind, n.label, n.evidence])).toEqual([
      ['ingress', '外部消息', 'L1'],
      ['workflow', 'Run run-1', 'L1'],
    ])
    expect(state.edges).toEqual([
      expect.objectContaining({ from: 'ingress:s1', to: 'run:s1:run-1', kind: 'spawn', evidence: 'L1' }),
    ])
    expect(state.focusedNodeId).toBe('run:s1:run-1')
    expect(getFocusedNode(state)?.label).toBe('Run run-1')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run test -- custom/client/cockpit/__tests__/run-trace-adapter.test.ts
```

Expected: FAIL because `run-trace-adapter.ts` does not exist.

- [ ] **Step 3: Implement minimal adapter types and run.started handling**

Create `overlay/custom/client/cockpit/adapters/run-trace-adapter.ts`:

```ts
import type { RunEvent } from '@/api/hermes/chat'

export type EvidenceTier = 'L1' | 'L2' | 'L3'
export type TraceNodeKind = 'ingress' | 'workflow' | 'agent' | 'skill' | 'tool' | 'memory' | 'service' | 'peer' | 'approval'
export type SpanStatus = 'running' | 'ok' | 'error' | 'cancelled'
export type EdgeKind = 'spawn' | 'call' | 'recall' | 'converge' | 'delegate'
export type TraceTimelineItemKind = 'thinking' | 'tool' | 'memory' | 'message'
export type TraceAttribution = 'inferred' | 'accurate'

export interface TraceTimelineItem {
  id: string
  kind: TraceTimelineItemKind
  ts: number
  text?: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  durationMs?: number
  status?: SpanStatus
  attribution: TraceAttribution
}

export interface TraceNode {
  id: string
  kind: TraceNodeKind
  label: string
  detail?: string
  status: SpanStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  evidence: EvidenceTier
  children?: TraceTimelineItem[]
  ref?: {
    sessionId?: string
    runId?: string
    toolCallId?: string
    workflowNodeId?: string
  }
}

export interface TraceEdge {
  id: string
  from: string
  to: string
  kind: EdgeKind
  evidence: EvidenceTier
}

export interface TraceState {
  sessionId: string
  runId: string | null
  nodes: TraceNode[]
  edges: TraceEdge[]
  focusedNodeId: string | null
  openToolNodeIds: Record<string, string>
  activeSkillNodeId: string | null
  sequence: number
  outputText: string
  usage?: RunEvent['usage']
}

function ts(event: RunEvent): number {
  return typeof event.timestamp === 'number' ? event.timestamp : Date.now()
}

function upsertNode(nodes: TraceNode[], node: TraceNode): TraceNode[] {
  const idx = nodes.findIndex(n => n.id === node.id)
  if (idx < 0) return [...nodes, node]
  const next = nodes.slice()
  next[idx] = { ...next[idx], ...node }
  return next
}

function upsertEdge(edges: TraceEdge[], edge: TraceEdge): TraceEdge[] {
  return edges.some(e => e.id === edge.id) ? edges : [...edges, edge]
}

export function createTraceState(sessionId: string): TraceState {
  return {
    sessionId,
    runId: null,
    nodes: [],
    edges: [],
    focusedNodeId: null,
    openToolNodeIds: {},
    activeSkillNodeId: null,
    sequence: 0,
    outputText: '',
  }
}

export function getFocusedNode(state: TraceState): TraceNode | null {
  return state.nodes.find(n => n.id === state.focusedNodeId) ?? null
}

function handleRunStarted(state: TraceState, event: RunEvent): TraceState {
  const runId = event.run_id || `local-${state.sequence + 1}`
  const ingressId = `ingress:${state.sessionId}`
  const runNodeId = `run:${state.sessionId}:${runId}`
  const startedAt = ts(event)
  const ingress: TraceNode = {
    id: ingressId,
    kind: 'ingress',
    label: '外部消息',
    detail: state.sessionId,
    status: 'ok',
    startedAt,
    evidence: 'L1',
    ref: { sessionId: state.sessionId },
  }
  const runNode: TraceNode = {
    id: runNodeId,
    kind: 'workflow',
    label: `Run ${runId}`,
    detail: 'Workflow DAG',
    status: 'running',
    startedAt,
    evidence: 'L1',
    children: [],
    ref: { sessionId: state.sessionId, runId },
  }
  const edge: TraceEdge = {
    id: `edge:${ingressId}->${runNodeId}`,
    from: ingressId,
    to: runNodeId,
    kind: 'spawn',
    evidence: 'L1',
  }
  return {
    ...state,
    runId,
    nodes: upsertNode(upsertNode(state.nodes, ingress), runNode),
    edges: upsertEdge(state.edges, edge),
    focusedNodeId: runNodeId,
    sequence: state.sequence + 1,
  }
}

export function applyRunEvent(state: TraceState, event: RunEvent): TraceState {
  switch (event.event) {
    case 'run.started':
      return handleRunStarted(state, event)
    default:
      return state
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run test -- custom/client/cockpit/__tests__/run-trace-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/cockpit/adapters/run-trace-adapter.ts custom/client/cockpit/__tests__/run-trace-adapter.test.ts
git commit -m "feat: add run trace adapter base"
```

---

## Task 2: Tool, reasoning, usage, and run completion reduction

**Files:**
- Modify: `overlay/custom/client/cockpit/adapters/run-trace-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/run-trace-adapter.test.ts`

- [ ] **Step 1: Add failing tests for tool lifecycle and thinking text**

Append to `run-trace-adapter.test.ts` inside `describe`:

```ts
  it('tracks tool lifecycle with duration and error status', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({
      event: 'tool.started', run_id: 'run-1', timestamp: 1100,
      tool: 'read_file', name: 'read_file', preview: '{"path":"src/auth.ts"}',
    }))
    state = applyRunEvent(state, evt({
      event: 'tool.completed', run_id: 'run-1', timestamp: 1600,
      tool: 'read_file', name: 'read_file', output: 'ok',
    }))

    const tool = state.nodes.find(n => n.kind === 'tool')!
    expect(tool.label).toBe('read_file')
    expect(tool.status).toBe('ok')
    expect(tool.durationMs).toBe(500)
    expect(tool.evidence).toBe('L1')
    expect(state.edges.some(e => e.kind === 'call' && e.to === tool.id)).toBe(true)
  })

  it('stores reasoning as a thinking timeline item on the run node', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'reasoning.delta', run_id: 'run-1', timestamp: 1200, text: '先读现有实现。' }))

    const run = state.nodes.find(n => n.kind === 'workflow')!
    expect(run.children).toEqual([
      expect.objectContaining({ kind: 'thinking', text: '先读现有实现。', attribution: 'inferred' }),
    ])
  })

  it('does not mix message.delta into thinking items', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'message.delta', run_id: 'run-1', timestamp: 1200, delta: '最终回答' }))

    const run = state.nodes.find(n => n.kind === 'workflow')!
    expect(run.children?.some(i => i.kind === 'thinking')).toBe(false)
    expect(state.outputText).toBe('最终回答')
  })

  it('marks run completed and stores usage', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({
      event: 'run.completed', run_id: 'run-1', timestamp: 3000,
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }))

    const run = state.nodes.find(n => n.kind === 'workflow')!
    expect(run.status).toBe('ok')
    expect(run.durationMs).toBe(2000)
    expect(state.usage?.total_tokens).toBe(30)
  })
```

- [ ] **Step 2: Run tests and verify failure**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run test -- custom/client/cockpit/__tests__/run-trace-adapter.test.ts
```

Expected: FAIL because these handlers are not implemented.

- [ ] **Step 3: Implement reducer handlers**

Modify `run-trace-adapter.ts`. Add helper functions below `handleRunStarted`:

```ts
function currentRunNodeId(state: TraceState): string | null {
  return state.runId ? `run:${state.sessionId}:${state.runId}` : null
}

function appendChildToNode(nodes: TraceNode[], nodeId: string, item: TraceTimelineItem): TraceNode[] {
  return nodes.map(n => n.id === nodeId ? { ...n, children: [...(n.children ?? []), item] } : n)
}

function firstOpenToolId(state: TraceState, toolName?: string): string | null {
  const entries = Object.entries(state.openToolNodeIds)
  if (!entries.length) return null
  if (!toolName) return entries[0][0]
  return entries.find(([id]) => id.includes(`:${toolName}:`))?.[0] ?? entries[0][0]
}

function handleToolStarted(state: TraceState, event: RunEvent): TraceState {
  const startedAt = ts(event)
  const toolName = event.tool || event.name || 'tool'
  const seq = state.sequence + 1
  const toolId = `tool:${state.sessionId}:${toolName}:${seq}`
  const parentId = state.activeSkillNodeId ?? currentRunNodeId(state)
  const node: TraceNode = {
    id: toolId,
    kind: 'tool',
    label: toolName,
    detail: event.preview,
    status: 'running',
    startedAt,
    evidence: 'L1',
    ref: { sessionId: state.sessionId, runId: state.runId ?? undefined, toolCallId: toolId },
  }
  let nodes = upsertNode(state.nodes, node)
  let edges = state.edges
  if (parentId) {
    edges = upsertEdge(edges, { id: `edge:${parentId}->${toolId}`, from: parentId, to: toolId, kind: 'call', evidence: 'L1' })
    if (state.activeSkillNodeId) {
      nodes = appendChildToNode(nodes, state.activeSkillNodeId, {
        id: `timeline:${toolId}`,
        kind: 'tool',
        ts: startedAt,
        toolName,
        toolArgs: event.preview,
        status: 'running',
        attribution: 'inferred',
      })
    }
  }
  return { ...state, nodes, edges, openToolNodeIds: { ...state.openToolNodeIds, [toolId]: toolId }, sequence: seq, focusedNodeId: toolId }
}

function handleToolCompleted(state: TraceState, event: RunEvent): TraceState {
  const endedAt = ts(event)
  const toolName = event.tool || event.name
  const toolId = firstOpenToolId(state, toolName)
  if (!toolId) return state
  const existing = state.nodes.find(n => n.id === toolId)
  if (!existing) return state
  const status: SpanStatus = event.error ? 'error' : 'ok'
  const durationMs = Math.max(0, endedAt - existing.startedAt)
  const nodes = state.nodes.map(n => {
    if (n.id === toolId) return { ...n, status, endedAt, durationMs, detail: event.output || event.error || n.detail }
    if (n.id === state.activeSkillNodeId) {
      return {
        ...n,
        children: (n.children ?? []).map(item => item.id === `timeline:${toolId}`
          ? { ...item, status, durationMs, toolResult: event.output || event.error }
          : item),
      }
    }
    return n
  })
  const openToolNodeIds = { ...state.openToolNodeIds }
  delete openToolNodeIds[toolId]
  return { ...state, nodes, openToolNodeIds, focusedNodeId: toolId }
}

function handleReasoning(state: TraceState, event: RunEvent): TraceState {
  const parentId = state.activeSkillNodeId ?? currentRunNodeId(state)
  const text = event.text || event.delta || ''
  if (!parentId || !text) return state
  const item: TraceTimelineItem = {
    id: `thinking:${state.sessionId}:${state.sequence + 1}`,
    kind: 'thinking',
    ts: ts(event),
    text,
    attribution: state.activeSkillNodeId ? 'inferred' : 'accurate',
  }
  return { ...state, nodes: appendChildToNode(state.nodes, parentId, item), sequence: state.sequence + 1 }
}

function handleMessageDelta(state: TraceState, event: RunEvent): TraceState {
  return { ...state, outputText: state.outputText + (event.delta || event.text || '') }
}

function handleRunFinished(state: TraceState, event: RunEvent, status: SpanStatus): TraceState {
  const runId = currentRunNodeId(state)
  if (!runId) return state
  const endedAt = ts(event)
  const nodes = state.nodes.map(n => n.id === runId
    ? { ...n, status, endedAt, durationMs: Math.max(0, endedAt - n.startedAt), detail: event.error || n.detail }
    : n)
  return { ...state, nodes, usage: event.usage ?? state.usage, focusedNodeId: runId }
}
```

Then update `applyRunEvent` switch:

```ts
export function applyRunEvent(state: TraceState, event: RunEvent): TraceState {
  switch (event.event) {
    case 'run.started': return handleRunStarted(state, event)
    case 'tool.started': return handleToolStarted(state, event)
    case 'tool.completed': return handleToolCompleted(state, event)
    case 'reasoning.delta':
    case 'thinking.delta':
    case 'reasoning.available': return handleReasoning(state, event)
    case 'message.delta': return handleMessageDelta(state, event)
    case 'run.completed': return handleRunFinished(state, event, 'ok')
    case 'run.failed': return handleRunFinished(state, event, 'error')
    case 'usage.updated': return { ...state, usage: event.usage ?? state.usage }
    default: return state
  }
}
```

- [ ] **Step 4: Run adapter tests**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run test -- custom/client/cockpit/__tests__/run-trace-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add custom/client/cockpit/adapters/run-trace-adapter.ts custom/client/cockpit/__tests__/run-trace-adapter.test.ts
git commit -m "feat: reduce run trace event stream"
```

---

## Task 3: Subagent and skill drilldown reduction

**Files:**
- Modify: `overlay/custom/client/cockpit/adapters/run-trace-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/run-trace-adapter.test.ts`

- [ ] **Step 1: Add failing tests for subagent and skill activation**

Append:

```ts
  it('creates subagent nodes with delegate edges', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'subagent.start', run_id: 'run-1', timestamp: 1200, name: 'subagent 1/2', preview: '调研鉴权方案' }))

    const sub = state.nodes.find(n => n.kind === 'agent' && n.label.includes('subagent'))!
    expect(sub.status).toBe('running')
    expect(sub.evidence).toBe('L1')
    expect(state.edges.some(e => e.kind === 'delegate' && e.to === sub.id)).toBe(true)
  })

  it('activates a skill node and attributes thinking/tool items as inferred', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = activateSkill(state, { skillName: 'auth-refactor', ts: 1100, detail: 'SKILL.md v2' })
    state = applyRunEvent(state, evt({ event: 'reasoning.delta', run_id: 'run-1', timestamp: 1200, text: '先读现有实现。' }))
    state = applyRunEvent(state, evt({ event: 'tool.started', run_id: 'run-1', timestamp: 1300, tool: 'read_file' }))

    const skill = state.nodes.find(n => n.kind === 'skill')!
    expect(skill.label).toBe('auth-refactor')
    expect(skill.children?.map(i => [i.kind, i.attribution])).toEqual([
      ['thinking', 'inferred'],
      ['tool', 'inferred'],
    ])
  })
```

Also import `activateSkill` at the top:

```ts
import { createTraceState, applyRunEvent, getFocusedNode, activateSkill, type TraceState } from '../adapters/run-trace-adapter'
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npm run test -- custom/client/cockpit/__tests__/run-trace-adapter.test.ts
```

Expected: FAIL because `activateSkill` and subagent handling do not exist.

- [ ] **Step 3: Implement `activateSkill` and subagent handling**

Add to `run-trace-adapter.ts`:

```ts
export function activateSkill(state: TraceState, input: { skillName: string; ts: number; detail?: string }): TraceState {
  const skillId = `skill:${state.sessionId}:${input.skillName}:${state.sequence + 1}`
  const parentId = currentRunNodeId(state)
  const node: TraceNode = {
    id: skillId,
    kind: 'skill',
    label: input.skillName,
    detail: input.detail,
    status: 'running',
    startedAt: input.ts,
    evidence: 'L1',
    children: [],
    ref: { sessionId: state.sessionId, runId: state.runId ?? undefined },
  }
  let nodes = upsertNode(state.nodes, node)
  let edges = state.edges
  if (parentId) {
    edges = upsertEdge(edges, { id: `edge:${parentId}->${skillId}`, from: parentId, to: skillId, kind: 'call', evidence: 'L1' })
  }
  return { ...state, nodes, edges, activeSkillNodeId: skillId, focusedNodeId: skillId, sequence: state.sequence + 1 }
}

function handleSubagent(state: TraceState, event: RunEvent): TraceState {
  const startedAt = ts(event)
  const label = event.name || event.tool || event.preview || event.event
  const nodeId = `agent:${state.sessionId}:${label}:${state.sequence + 1}`
  const parentId = currentRunNodeId(state)
  const status: SpanStatus = event.event.endsWith('.complete') ? 'ok' : 'running'
  const node: TraceNode = {
    id: nodeId,
    kind: 'agent',
    label,
    detail: event.preview,
    status,
    startedAt,
    evidence: 'L1',
    ref: { sessionId: state.sessionId, runId: state.runId ?? undefined },
  }
  let edges = state.edges
  if (parentId) {
    edges = upsertEdge(edges, { id: `edge:${parentId}->${nodeId}`, from: parentId, to: nodeId, kind: 'delegate', evidence: 'L1' })
  }
  return { ...state, nodes: upsertNode(state.nodes, node), edges, focusedNodeId: nodeId, sequence: state.sequence + 1 }
}
```

Update `applyRunEvent`:

```ts
case 'subagent.start':
case 'subagent.tool':
case 'subagent.progress':
case 'subagent.complete':
  return handleSubagent(state, event)
```

- [ ] **Step 4: Run adapter tests**

```bash
npm run test -- custom/client/cockpit/__tests__/run-trace-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add custom/client/cockpit/adapters/run-trace-adapter.ts custom/client/cockpit/__tests__/run-trace-adapter.test.ts
git commit -m "feat: add subagent and skill trace reduction"
```

---

## Task 4: `useRunTrace` composable with complete handler registration

**Files:**
- Create: `overlay/custom/client/cockpit/composables/useRunTrace.ts`
- Test: `overlay/custom/client/cockpit/__tests__/use-run-trace.test.ts`

- [ ] **Step 1: Write failing composable tests**

Create `overlay/custom/client/cockpit/__tests__/use-run-trace.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRunTrace } from '../composables/useRunTrace'

const registerSessionHandlers = vi.fn()
const cleanup = vi.fn()

vi.mock('@/api/hermes/chat', () => ({
  registerSessionHandlers: (...args: any[]) => registerSessionHandlers(...args),
}))

describe('useRunTrace', () => {
  beforeEach(() => {
    registerSessionHandlers.mockReset()
    cleanup.mockReset()
    registerSessionHandlers.mockReturnValue(cleanup)
  })

  it('registers all required session handlers and cleans up when session changes', async () => {
    const sessionId = ref<string | null>('s1')
    const trace = useRunTrace(sessionId)

    expect(registerSessionHandlers).toHaveBeenCalledTimes(1)
    const handlers = registerSessionHandlers.mock.calls[0][1]
    expect(Object.keys(handlers).sort()).toEqual([
      'onAbortCompleted', 'onAbortStarted', 'onCompressionCompleted', 'onCompressionStarted',
      'onMessageDelta', 'onReasoningAvailable', 'onReasoningDelta', 'onRunCompleted',
      'onRunFailed', 'onRunStarted', 'onSubagentEvent', 'onThinkingDelta', 'onToolCompleted',
      'onToolStarted', 'onUsageUpdated',
    ].sort())

    handlers.onRunStarted({ event: 'run.started', run_id: 'r1', session_id: 's1', timestamp: 1 })
    expect(trace.nodes.value.some(n => n.kind === 'workflow')).toBe(true)

    sessionId.value = 's2'
    await nextTick()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(registerSessionHandlers).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run and verify failure**

```bash
npm run test -- custom/client/cockpit/__tests__/use-run-trace.test.ts
```

Expected: FAIL because `useRunTrace.ts` does not exist.

- [ ] **Step 3: Implement composable**

Create `overlay/custom/client/cockpit/composables/useRunTrace.ts`:

```ts
import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { registerSessionHandlers, type RunEvent } from '@/api/hermes/chat'
import {
  applyRunEvent,
  createTraceState,
  type TraceState,
} from '../adapters/run-trace-adapter'

function noop(): void {}

export function useRunTrace(sessionId: Ref<string | null>) {
  const state = ref<TraceState | null>(null)
  const nodes = ref<TraceState['nodes']>([])
  const edges = ref<TraceState['edges']>([])
  const focusedNodeId = ref<string | null>(null)
  let cleanup: (() => void) | null = null

  function sync(next: TraceState) {
    state.value = next
    nodes.value = next.nodes
    edges.value = next.edges
    focusedNodeId.value = next.focusedNodeId
  }

  function route(event: RunEvent) {
    if (!state.value) return
    sync(applyRunEvent(state.value, event))
  }

  function detach() {
    cleanup?.()
    cleanup = null
  }

  function attach(sid: string) {
    sync(createTraceState(sid))
    cleanup = registerSessionHandlers(sid, {
      onMessageDelta: route,
      onReasoningDelta: route,
      onThinkingDelta: route,
      onReasoningAvailable: route,
      onToolStarted: route,
      onToolCompleted: route,
      onSubagentEvent: route,
      onRunStarted: route,
      onRunCompleted: route,
      onRunFailed: route,
      onCompressionStarted: noop,
      onCompressionCompleted: noop,
      onAbortStarted: noop,
      onAbortCompleted: noop,
      onUsageUpdated: route,
    })
  }

  watch(sessionId, (sid) => {
    detach()
    if (sid) attach(sid)
    else sync(createTraceState(''))
  }, { immediate: true })

  onScopeDispose(detach)

  return { state, nodes, edges, focusedNodeId, route }
}
```

- [ ] **Step 4: Run composable tests**

```bash
npm run test -- custom/client/cockpit/__tests__/use-run-trace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add custom/client/cockpit/composables/useRunTrace.ts custom/client/cockpit/__tests__/use-run-trace.test.ts
git commit -m "feat: subscribe to run trace events"
```

---

## Task 5: Cockpit store modal state

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts`

- [ ] **Step 1: Add failing store tests**

Append to `cockpit-store.test.ts`:

```ts
it('opens and closes the run trace modal with session and run references', () => {
  const s = useCockpitStore()
  s.openRunTrace({ taskId: 'task-1', sessionId: 'session-1', runId: 'run-1' })

  expect(s.runTraceOpen).toBe(true)
  expect(s.runTraceTaskId).toBe('task-1')
  expect(s.runTraceSessionId).toBe('session-1')
  expect(s.runTraceRunId).toBe('run-1')

  s.closeRunTrace()
  expect(s.runTraceOpen).toBe(false)
})
```

- [ ] **Step 2: Run store test and verify failure**

```bash
npm run test -- custom/client/cockpit/__tests__/cockpit-store.test.ts
```

Expected: FAIL because store properties/actions do not exist.

- [ ] **Step 3: Modify store state and return object**

In `store/cockpit.ts`, near existing modal refs (`historyOpen`, `titleDetail`, `notifyOpen`), add:

```ts
const runTraceOpen = ref(false)
const runTraceTaskId = ref<string | null>(null)
const runTraceSessionId = ref<string | null>(null)
const runTraceRunId = ref<string | null>(null)

function openRunTrace(input: { taskId?: string | null; sessionId: string; runId?: string | null }) {
  runTraceTaskId.value = input.taskId ?? null
  runTraceSessionId.value = input.sessionId
  runTraceRunId.value = input.runId ?? null
  runTraceOpen.value = true
}

function closeRunTrace() {
  runTraceOpen.value = false
}
```

Then add these refs/actions to the store return object:

```ts
runTraceOpen,
runTraceTaskId,
runTraceSessionId,
runTraceRunId,
openRunTrace,
closeRunTrace,
```

- [ ] **Step 4: Run store tests**

```bash
npm run test -- custom/client/cockpit/__tests__/cockpit-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add custom/client/cockpit/store/cockpit.ts custom/client/cockpit/__tests__/cockpit-store.test.ts
git commit -m "feat: add run trace modal state"
```

---

## Task 6: Modal shell, time band, graph, inspector, and skill drilldown components

**Files:**
- Create: `overlay/custom/client/cockpit/components/CockpitRunTraceModal.vue`
- Create: `overlay/custom/client/cockpit/components/RunTraceGraph.vue`
- Create: `overlay/custom/client/cockpit/components/RunTraceTimeBand.vue`
- Create: `overlay/custom/client/cockpit/components/RunTraceInspector.vue`
- Create: `overlay/custom/client/cockpit/components/RunTraceSkillDrilldown.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts`

- [ ] **Step 1: Write failing modal/component tests**

Create `cockpit-run-trace-modal.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CockpitRunTraceModal from '../components/CockpitRunTraceModal.vue'
import { useCockpitStore } from '../store/cockpit'

vi.mock('../composables/useRunTrace', () => ({
  useRunTrace: () => ({
    nodes: {
      value: [
        { id: 'run:s1:r1', kind: 'workflow', label: 'Run r1', status: 'running', startedAt: 1, evidence: 'L1', children: [] },
        { id: 'skill:s1:auth:1', kind: 'skill', label: 'auth-refactor', status: 'running', startedAt: 2, evidence: 'L1', children: [
          { id: 'think:1', kind: 'thinking', ts: 3, text: '先读现有实现。', attribution: 'inferred' },
        ] },
      ],
    },
    edges: { value: [{ id: 'e1', from: 'run:s1:r1', to: 'skill:s1:auth:1', kind: 'call', evidence: 'L1' }] },
    focusedNodeId: { value: 'run:s1:r1' },
  }),
}))

describe('CockpitRunTraceModal', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('does not render when closed', () => {
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    expect(w.find('[data-run-trace-modal]').exists()).toBe(false)
  })

  it('renders graph, time band, and inspector when opened', () => {
    const store = useCockpitStore()
    store.openRunTrace({ taskId: 'task-1', sessionId: 's1', runId: 'r1' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    expect(w.find('[data-run-trace-modal]').exists()).toBe(true)
    expect(w.text()).toContain('Run Observatory')
    expect(w.find('[data-run-trace-graph]').exists()).toBe(true)
    expect(w.find('[data-run-trace-timeband]').exists()).toBe(true)
    expect(w.find('[data-run-trace-inspector]').exists()).toBe(true)
  })

  it('opens skill drilldown when a skill node is selected', async () => {
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: 's1', runId: 'r1' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    await w.find('[data-node-id="skill:s1:auth:1"]').trigger('click')
    expect(w.find('[data-run-trace-skill-drilldown]').exists()).toBe(true)
    expect(w.text()).toContain('先读现有实现')
  })
})
```

- [ ] **Step 2: Run and verify failure**

```bash
npm run test -- custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts
```

Expected: FAIL because modal and subcomponents do not exist.

- [ ] **Step 3: Create `RunTraceTimeBand.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { TraceNode } from '../adapters/run-trace-adapter'
const props = defineProps<{ nodes: TraceNode[] }>()
const bars = computed(() => {
  const timed = props.nodes.filter(n => typeof n.durationMs === 'number' && n.durationMs! > 0)
  const max = Math.max(1, ...timed.map(n => n.durationMs ?? 1))
  return timed.map(n => ({ id: n.id, label: n.label, width: `${Math.max(6, Math.round(((n.durationMs ?? 1) / max) * 100))}%`, kind: n.kind, status: n.status }))
})
</script>
<template>
  <div class="run-trace-timeband" data-run-trace-timeband>
    <span class="run-trace-timeband__label">TIME BAND</span>
    <div class="run-trace-timeband__track">
      <span v-for="bar in bars" :key="bar.id" class="run-trace-timeband__bar" :class="[`is-${bar.kind}`, `is-${bar.status}`]" :style="{ width: bar.width }">{{ bar.label }}</span>
    </div>
  </div>
</template>
<style scoped lang="scss">
.run-trace-timeband { display: grid; grid-template-columns: 92px 1fr; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.run-trace-timeband__label { font-size: 9px; color: var(--text-muted); letter-spacing: 1px; }
.run-trace-timeband__track { display: flex; gap: 4px; align-items: center; min-width: 0; }
.run-trace-timeband__bar { display: inline-flex; min-width: 28px; max-width: 100%; height: 10px; align-items: center; overflow: hidden; white-space: nowrap; border-radius: 3px; padding: 0 4px; font-size: 8px; color: var(--text-on-accent); background: var(--text-muted); }
.run-trace-timeband__bar.is-error { background: var(--error); }
.run-trace-timeband__bar.is-running { background: var(--warning); }
</style>
```

- [ ] **Step 4: Create `RunTraceGraph.vue`**

```vue
<script setup lang="ts">
import type { TraceEdge, TraceNode } from '../adapters/run-trace-adapter'
const props = defineProps<{ nodes: TraceNode[]; edges: TraceEdge[]; focusedNodeId: string | null }>()
const emit = defineEmits<{ (e: 'focus-node', id: string): void }>()
function evidenceClass(e: { evidence: string }) { return `is-${e.evidence.toLowerCase()}` }
</script>
<template>
  <div class="run-trace-graph" data-run-trace-graph :class="{ 'has-focus': !!focusedNodeId }">
    <div class="run-trace-graph__edges" aria-hidden="true">
      <span v-for="edge in edges" :key="edge.id" class="run-trace-graph__edge" :class="[evidenceClass(edge)]">{{ edge.kind }}</span>
    </div>
    <button
      v-for="node in nodes"
      :key="node.id"
      type="button"
      class="run-trace-node"
      :class="[`is-${node.kind}`, `is-${node.status}`, evidenceClass(node), { 'is-focus': node.id === focusedNodeId }]"
      :data-node-id="node.id"
      @click="emit('focus-node', node.id)"
    >
      <span class="run-trace-node__dot"></span>
      <span class="run-trace-node__text"><b>{{ node.label }}</b><small>{{ node.detail || node.evidence }}</small></span>
    </button>
  </div>
</template>
<style scoped lang="scss">
.run-trace-graph { position: relative; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 10px; padding: 16px; min-height: 360px; overflow: auto; background: radial-gradient(circle at 1px 1px, var(--border-light) 1px, transparent 0) 0 0 / 16px 16px; }
.run-trace-graph__edges { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 6px; font-size: 9px; color: var(--text-muted); }
.run-trace-graph__edge.is-l2 { border-bottom: 1px dashed var(--text-muted); }
.run-trace-graph__edge.is-l3 { border-bottom: 1px dotted var(--text-muted); }
.run-trace-node { display: flex; align-items: center; gap: 7px; min-width: 120px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); cursor: pointer; font-family: inherit; text-align: left; }
.run-trace-node:hover { background: var(--bg-card-hover); }
.run-trace-node.is-focus { border-color: var(--accent-primary); border-width: 2px; box-shadow: 0 0 0 3px rgba(107, 163, 214, 0.16); }
.run-trace-node.is-l3 { border-style: dashed; }
.run-trace-node__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
.run-trace-node.is-agent .run-trace-node__dot { background: var(--success); }
.run-trace-node.is-skill .run-trace-node__dot { background: var(--accent-info); }
.run-trace-node.is-memory .run-trace-node__dot { background: var(--warning); }
.run-trace-node.is-error .run-trace-node__dot { background: var(--error); }
.run-trace-node__text { display: flex; flex-direction: column; min-width: 0; }
.run-trace-node__text b { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-trace-node__text small { font-size: 9px; color: var(--text-muted); }
</style>
```

- [ ] **Step 5: Create inspector and skill drilldown components**

Create `RunTraceInspector.vue`:

```vue
<script setup lang="ts">
import type { TraceNode } from '../adapters/run-trace-adapter'
defineProps<{ node: TraceNode | null }>()
</script>
<template>
  <aside class="run-trace-inspector" data-run-trace-inspector>
    <template v-if="node">
      <div class="run-trace-inspector__head"><span></span><b>{{ node.label }}</b><em>{{ node.evidence }}</em></div>
      <section><h5>概览</h5><p>{{ node.detail || '无详情' }}</p></section>
      <section><h5>状态</h5><p>{{ node.status }}<template v-if="node.durationMs"> · {{ node.durationMs }}ms</template></p></section>
    </template>
    <p v-else class="run-trace-inspector__empty">选择节点查看详情</p>
  </aside>
</template>
<style scoped lang="scss">
.run-trace-inspector { border-left: 1px solid var(--border-color); background: var(--bg-sidebar); padding: 16px; overflow: auto; }
.run-trace-inspector__head { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); margin-bottom: 14px; }
.run-trace-inspector__head span { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-info); }
.run-trace-inspector__head b { font-size: 13px; }
.run-trace-inspector__head em { margin-left: auto; font-size: 10px; color: var(--text-muted); font-style: normal; }
.run-trace-inspector section { margin-bottom: 14px; }
.run-trace-inspector h5 { font-size: 9px; color: var(--text-muted); letter-spacing: 1px; margin-bottom: 6px; }
.run-trace-inspector p { font-size: 11px; color: var(--text-secondary); line-height: 1.6; }
.run-trace-inspector__empty { color: var(--text-muted); }
</style>
```

Create `RunTraceSkillDrilldown.vue`:

```vue
<script setup lang="ts">
import type { TraceNode } from '../adapters/run-trace-adapter'
defineProps<{ skill: TraceNode }>()
defineEmits<{ (e: 'back'): void }>()
</script>
<template>
  <div class="run-trace-skill" data-run-trace-skill-drilldown>
    <header><button type="button" @click="$emit('back')">← 返回全局图</button><b>{{ skill.label }}</b><span>{{ skill.detail }}</span></header>
    <div class="run-trace-skill__line">
      <article v-for="item in skill.children || []" :key="item.id" class="run-trace-skill__item" :class="[`is-${item.kind}`]">
        <span class="run-trace-skill__kind">{{ item.kind }}</span>
        <span class="run-trace-skill__body">{{ item.text || item.toolName }}</span>
        <span class="run-trace-skill__attr">{{ item.attribution === 'inferred' ? '推断' : '准确' }}</span>
      </article>
    </div>
  </div>
</template>
<style scoped lang="scss">
.run-trace-skill { padding: 16px; overflow: auto; }
.run-trace-skill header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.run-trace-skill button { border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); border-radius: 6px; padding: 4px 8px; cursor: pointer; }
.run-trace-skill__line { position: relative; padding-left: 22px; }
.run-trace-skill__line::before { content: ''; position: absolute; left: 5px; top: 4px; bottom: 4px; width: 1px; background: var(--border-color); }
.run-trace-skill__item { position: relative; display: grid; grid-template-columns: 70px 1fr auto; gap: 8px; padding: 8px 10px; margin-bottom: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); font-size: 11px; color: var(--text-secondary); }
.run-trace-skill__item::before { content: ''; position: absolute; left: -21px; top: 10px; width: 9px; height: 9px; border-radius: 50%; background: var(--bg-primary); border: 2px solid var(--text-muted); }
.run-trace-skill__item.is-thinking::before { border-color: var(--accent-info); }
.run-trace-skill__item.is-tool::before { background: var(--text-muted); }
.run-trace-skill__attr { color: var(--warning); }
</style>
```

- [ ] **Step 6: Create modal shell**

Create `CockpitRunTraceModal.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '../store/cockpit'
import { useRunTrace } from '../composables/useRunTrace'
import RunTraceGraph from './RunTraceGraph.vue'
import RunTraceTimeBand from './RunTraceTimeBand.vue'
import RunTraceInspector from './RunTraceInspector.vue'
import RunTraceSkillDrilldown from './RunTraceSkillDrilldown.vue'

const store = useCockpitStore()
const sessionId = computed(() => store.runTraceSessionId)
const trace = useRunTrace(sessionId)
const focusedId = ref<string | null>(null)
const drilldownSkillId = ref<string | null>(null)
const focusedNode = computed(() => trace.nodes.value.find(n => n.id === (focusedId.value || trace.focusedNodeId.value)) ?? null)
const drilldownSkill = computed(() => trace.nodes.value.find(n => n.id === drilldownSkillId.value && n.kind === 'skill') ?? null)

function focusNode(id: string) {
  focusedId.value = id
  const node = trace.nodes.value.find(n => n.id === id)
  if (node?.kind === 'skill') drilldownSkillId.value = id
}
</script>
<template>
  <teleport to="body">
    <div v-if="store.runTraceOpen" class="run-trace-modal" data-run-trace-modal>
      <header class="run-trace-modal__top">
        <span class="run-trace-modal__dot"></span>
        <div><b>Run Observatory</b><small>{{ store.runTraceSessionId }}</small></div>
        <button type="button" data-action="close" @click="store.closeRunTrace">×</button>
      </header>
      <RunTraceTimeBand :nodes="trace.nodes.value" />
      <main class="run-trace-modal__main">
        <RunTraceSkillDrilldown v-if="drilldownSkill" :skill="drilldownSkill" @back="drilldownSkillId = null" />
        <RunTraceGraph v-else :nodes="trace.nodes.value" :edges="trace.edges.value" :focused-node-id="focusedNode?.id || null" @focus-node="focusNode" />
        <RunTraceInspector :node="focusedNode" />
      </main>
    </div>
  </teleport>
</template>
<style scoped lang="scss">
.run-trace-modal { position: fixed; inset: 0; z-index: 3000; display: grid; grid-template-rows: 52px auto 1fr; background: var(--bg-primary); color: var(--text-primary); }
.run-trace-modal__top { display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-sidebar); }
.run-trace-modal__top b { display: block; font-size: 13px; }
.run-trace-modal__top small { display: block; font-size: 11px; color: var(--text-muted); }
.run-trace-modal__top button { margin-left: auto; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; }
.run-trace-modal__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning); }
.run-trace-modal__main { min-height: 0; display: grid; grid-template-columns: 1fr 320px; }
</style>
```

- [ ] **Step 7: Run modal tests**

```bash
npm run test -- custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add custom/client/cockpit/components/CockpitRunTraceModal.vue custom/client/cockpit/components/RunTraceGraph.vue custom/client/cockpit/components/RunTraceTimeBand.vue custom/client/cockpit/components/RunTraceInspector.vue custom/client/cockpit/components/RunTraceSkillDrilldown.vue custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts
git commit -m "feat: add run trace modal components"
```

---

## Task 7: Mount modal and trigger it from Cockpit timeline

**Files:**
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`
- Modify: `overlay/custom/client/cockpit/components/CockpitTimeline.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-timeline.test.ts`

- [ ] **Step 1: Add failing timeline trigger test**

Open `cockpit-timeline.test.ts` and add this test inside the existing `describe('CockpitTimeline', ...)` block:

```ts
  it('double-clicking a run event opens RunTrace modal instead of title detail', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    getTask.mockResolvedValue({
      task: {
        id: 't1', title: 'T', body: null, assignee: 'agent', status: 'running', priority: 0,
        created_by: null, created_at: 0, started_at: null, completed_at: null,
        workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
        result: null, skills: null, latest_summary: null,
      },
      latest_summary: null,
      session: { id: 'session-1', title: 'S', source: 'cli', model: 'gpt', started_at: 0, ended_at: null, messages: [] },
      comments: [],
      events: [],
      runs: [{
        id: 7, task_id: 't1', profile: 'agent', status: 'running', outcome: null,
        summary: 'running trace', error: null, metadata: null, worker_pid: null,
        started_at: 1000, ended_at: null,
      }],
    })
    const s = useCockpitStore()
    await s.selectTask('t1')
    const spy = vi.spyOn(s, 'openRunTrace')
    const w = mount(CockpitTimeline)

    await w.find('[data-event-id="evt-run-7"]').trigger('dblclick')

    expect(spy).toHaveBeenCalledWith({ taskId: 't1', sessionId: 'session-1', runId: 'evt-run-7' })
  })
```

- [ ] **Step 2: Run and verify failure**

```bash
npm run test -- custom/client/cockpit/__tests__/cockpit-timeline.test.ts
```

Expected: FAIL because `CockpitTimeline` does not call `openRunTrace`.

- [ ] **Step 3: Mount modal in `CockpitView.vue`**

Add import near other cockpit component imports:

```ts
import CockpitRunTraceModal from '@/custom/cockpit/components/CockpitRunTraceModal.vue'
```

Add near existing modal components in template:

```vue
<CockpitRunTraceModal />
```

- [ ] **Step 4: Modify timeline double-click behavior**

In `CockpitTimeline.vue`, update `onEventDblClick`:

```ts
function onEventDblClick(ev: { taskId: string; fullText: string; source: string; actor: string; id?: string }) {
  if (ev.source === 'run') {
    const sessionId = store.selectedTaskDetail?.session?.id || ''
    if (sessionId) {
      store.openRunTrace({ taskId: ev.taskId, sessionId, runId: ev.id ?? null })
      return
    }
  }
  const titleMap: Record<string, string> = {
    event: '事件详情',
    run: '执行记录',
    comment: '评论',
    log: 'Worker Log',
    message: '对话消息',
  }
  const title = titleMap[ev.source] ?? '事件详情'
  store.openTitleDetail(ev.taskId, ev.fullText, title)
}
```

`selectedTaskDetail` is already returned by the store. If it is null because task detail has not loaded, keep the existing title-detail fallback instead of guessing a session id from tenant strings.

- [ ] **Step 5: Run timeline and modal tests**

```bash
npm run test -- custom/client/cockpit/__tests__/cockpit-timeline.test.ts custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add custom/client/cockpit/views/CockpitView.vue custom/client/cockpit/components/CockpitTimeline.vue custom/client/cockpit/__tests__/cockpit-timeline.test.ts
git commit -m "feat: open run trace from cockpit timeline"
```

---

## Task 8: Polish evidence styling, dual theme, and accessibility hooks

**Files:**
- Modify: `overlay/custom/client/cockpit/components/CockpitRunTraceModal.vue`
- Modify: `overlay/custom/client/cockpit/components/RunTraceGraph.vue`
- Modify: `overlay/custom/client/cockpit/components/RunTraceSkillDrilldown.vue`
- Modify: `overlay/custom/client/cockpit/components/RunTraceTimeBand.vue`
- Modify: `overlay/custom/client/cockpit/components/RunTraceInspector.vue`
- Test: `overlay/custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts`

- [ ] **Step 1: Add assertions for evidence classes and labels**

Append to modal test:

```ts
it('marks inferred skill timeline items and evidence tiers', async () => {
  const store = useCockpitStore()
  store.openRunTrace({ sessionId: 's1', runId: 'r1' })
  const w = mount(CockpitRunTraceModal)
  expect(w.find('.run-trace-node.is-l1').exists()).toBe(true)
  await w.find('[data-node-id="skill:s1:auth:1"]').trigger('click')
  expect(w.text()).toContain('推断')
})
```

- [ ] **Step 2: Run and verify test result**

```bash
npm run test -- custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts
```

Expected: PASS after Task 6, or FAIL if class/label names need adjustment.

- [ ] **Step 3: Ensure all visual styles use CSS variables**

Scan new component styles manually. Replace any hard-coded non-transparent color with existing variables:

```scss
/* Allowed examples */
background: var(--bg-primary);
background: var(--bg-card);
border-color: var(--border-color);
color: var(--text-secondary);
box-shadow: 0 0 0 3px rgba(107, 163, 214, 0.16); // allowed because existing design used rgba focus glow
```

Do not use raw blues/greens/reds except through `var(--accent-info)`, `var(--success)`, `var(--error)`, `var(--warning)`.

- [ ] **Step 4: Add ARIA roles and close keyboard handler**

In `CockpitRunTraceModal.vue` root modal div:

```vue
<div
  v-if="store.runTraceOpen"
  class="run-trace-modal"
  data-run-trace-modal
  role="dialog"
  aria-modal="true"
  aria-label="Run Observatory"
  tabindex="-1"
  @keydown.esc="store.closeRunTrace"
>
```

Add `aria-label` to graph node buttons in `RunTraceGraph.vue`:

```vue
:aria-label="`${node.kind}: ${node.label}`"
```

- [ ] **Step 5: Run modal tests**

```bash
npm run test -- custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add custom/client/cockpit/components/CockpitRunTraceModal.vue custom/client/cockpit/components/RunTraceGraph.vue custom/client/cockpit/components/RunTraceSkillDrilldown.vue custom/client/cockpit/components/RunTraceTimeBand.vue custom/client/cockpit/components/RunTraceInspector.vue custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts
git commit -m "style: polish run trace observatory"
```

---

## Task 9: Full verification and docs note

**Files:**
- Modify: `docs/superpowers/specs/2026-06-27-run-trace-view-design.md` only if implementation discovers a design correction.

- [x] **Step 1: Run targeted tests**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run test -- \
  custom/client/cockpit/__tests__/run-trace-adapter.test.ts \
  custom/client/cockpit/__tests__/use-run-trace.test.ts \
  custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts \
  custom/client/cockpit/__tests__/cockpit-timeline.test.ts \
  custom/client/cockpit/__tests__/cockpit-store.test.ts
```

Expected: all listed tests PASS.
Result: 5 targeted files PASS (run-trace-adapter 19, use-run-trace 5, cockpit-run-trace-modal 7, plus cockpit-timeline & cockpit-store).

- [x] **Step 2: Run all overlay tests**

```bash
npm run test
```

Expected: all overlay tests PASS. If unrelated existing tests fail, capture the exact failing output and do not claim success.
Result: 342 tests PASS across 35 files (0 failures). 跨任务会话聚合特性新增/修改的测试全部通过。

- [x] **Step 3: Run TypeScript/build smoke if upstream is injected**

```bash
npm run build
```

Expected: Vite build completes. If `vite.config.overlay.ts` is missing or upstream is not injected, run:

```bash
npm run inject
npm run build
```

Expected: inject succeeds, build succeeds.
Result: `npm run inject` 应用 patch 成功；`npm run build` 完成（`✓ built in 5-6s`），生成 CockpitView chunk（~131KB）。build 产物中验证到聚合特性关键符号：`loadRelatedSessions`、`relatedSession`(×12)、`aggregateMode`、`setAllSessionsRef`、`work kanban task` 字面量，证明源码正确编译打包。预先存在的 `[IMPORT_IS_UNDEFINED] fromLog` 警告（cockpit.ts:539 引用 event-adapter 未导出的方法）非本次改动引入，不影响 build。

- [x] **Step 4: Review generated UI manually**

Start dev server:

```bash
npm run dev
```

Manual checks:
- Open Cockpit.
- Select a task with run history.
- Double-click a run event in CockpitTimeline.
- Confirm Run Observatory opens fullscreen.
- Confirm close button and Escape close it.
- Confirm light/dark theme follows app variables.
- Confirm skill node click enters drilldown and `推断` labels appear.

Result (自动化部分): dev server（vite :8649）正常启动，HTTP 200 渲染 Hermes Studio 入口；CockpitRunTraceModal/useRunTrace/run-trace-adapter/trace-middlewares 模块经 vite alias 解析、build 打包无误。后端 dev:server（:8647）在 inject 正确应用后成功启动（bootstrap 完成：`listening on 0.0.0.0:8647`，所有 stores/routes/websocket 就绪）；API 需登录鉴权（`/api/hermes/sessions` 返回 401 属预期）。前后端均已就绪，可在浏览器打开 http://localhost:8649/ 登录后执行下列 6 项交互检查（agent 环境无浏览器自动化/iOS simctl，故实时交互需人工完成）。

Manual checks（待人工执行，环境已就绪）:
- Open Cockpit.
- Select a task with run history.
- Double-click a run event in CockpitTimeline.
- Confirm Run Observatory opens fullscreen.
- Confirm close button and Escape close it.
- Confirm light/dark theme follows app variables.
- Confirm skill node click enters drilldown and `推断` labels appear.

- [ ] **Step 5: Commit final verification note if docs changed**

If docs were changed:

```bash
git add ../docs/superpowers/specs/2026-06-27-run-trace-view-design.md
git commit -m "docs: update run trace design notes"
```

If docs are outside git (current workspace root has no `.git`), skip commit and mention that docs were written but not versioned.
Note: 仅 plan 文档（本文件）更新了 Task 9 进度，specs 设计文档未改动；工作区根无 .git，无需 commit。

---

## Self-review checklist

- Spec coverage:
  - TraceNode/TraceEdge data model: Tasks 1-3.
  - Parallel event subscription: Task 4.
  - Store/modal integration: Task 5 and Task 7.
  - Evidence Graph / TimeBand / Inspector / Skill Drilldown: Task 6.
  - Dual-theme variable-only styling and accessibility: Task 8.
  - Testing and verification: Task 9.
- Placeholder scan: no TBD/TODO/fill-later steps; each task has code/commands/expected output.
- Type consistency:
  - `TraceState`, `TraceNode`, `TraceEdge`, `TraceTimelineItem` names are consistent across tasks.
  - `activateSkill` is introduced before tests use skill drilldown.
  - `useRunTrace` returns `{ state, nodes, edges, focusedNodeId, route }`; modal uses these exact fields.
- Scope check: plan implements only Layer 1. L2/L3 are explicitly left as evidence tiers/future data, not implemented.
