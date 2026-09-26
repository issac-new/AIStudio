// 行缓存+fork 锚守门（2-B：三 op 维护/removed 截断/锚定位=最后 complete assistantText）。
import { describe, it, expect } from 'vitest'
import { ZcodeSessionProjection, type ProjectionRow } from '../session-projection'
import { findForkAnchor } from '../../../../custom/client/ide/utils/zcode-fork'

// 轻桩：只驱动公开行为（watchSession/listRows）——agent port 用假帧回调。
function makeFake() {
  let convCb: ((wire: unknown) => void) | null = null
  const agent = {
    helloConversationV4: async () => ({ protocolVersion: 4 }),
    initializeConversationV4: async () => ({}),
    subscribeSessionsIndexV4: async () => ({ ack: {} }),
    subscribeConversationV4: async () => ({ ack: {} }),
    onDynamicSessionsIndexFrame: () => () => ({ dispose() {} }),
    onDynamicConversationFrame: () => (cb: (wire: unknown) => void) => { convCb = cb; return { dispose() {} } },
  }
  return { agent, emit: (wire: unknown) => convCb?.(wire) }
}

function deltaFrame(sessionId: string, deltas: unknown[]): unknown {
  return {
    kind: 'complete',
    frame: { topic: `conversation/${sessionId}`, payload: { kind: 'deltas', deltas }, fromSeq: 1, toSeq: 2 },
  }
}

describe('行缓存（v4 三 op）', () => {
  it('appended/upserted 入缓存；removed 截断（分支语义）；listRows 升序', async () => {
    const fake = makeFake()
    const p = new ZcodeSessionProjection({ agent: fake.agent as never, now: () => 0, log: () => undefined })
    await p.watchWorkspace('/w')
    await p.watchSession('/w', 's1')
    fake.emit(deltaFrame('s1', [
      { op: 'row.appended', row: { rowId: 1, kind: 'userInput', text: '问'.repeat(100) } },
      { op: 'row.appended', row: { rowId: 2, entityId: 'e2', kind: 'assistantText', state: 'streaming', text: '答前半' } },
    ]))
    fake.emit(deltaFrame('s1', [
      { op: 'row.upserted', row: { rowId: 2, entityId: 'e2', kind: 'assistantText', state: 'complete', text: '完整回答' } },
    ]))
    let rows: ProjectionRow[] = p.listRows('/w', 's1')
    expect(rows.map((r) => r.rowId)).toEqual([1, 2])
    expect(rows[0].text).toHaveLength(80) // 摘要截 80 字
    expect(rows[1].state).toBe('complete')
    // 分支：从行 2 截断
    fake.emit(deltaFrame('s1', [{ op: 'row.removed', fromRowId: 2 }]))
    rows = p.listRows('/w', 's1')
    expect(rows.map((r) => r.rowId)).toEqual([1])
  })
})

describe('fork 锚定位（findForkAnchor）', () => {
  it('取最后一条 complete 且带 entityId 的 assistantText 行', () => {
    const rows = [
      { rowId: 1, kind: 'userInput', text: 'q' },
      { rowId: 2, entityId: 'a1', kind: 'assistantText', state: 'complete', text: '答1' },
      { rowId: 3, kind: 'toolCall', text: '' },
      { rowId: 4, entityId: 'a2', kind: 'assistantText', state: 'streaming', text: '流中' },
      { rowId: 5, entityId: 'a3', kind: 'assistantText', state: 'complete', text: '答2' },
    ]
    expect(findForkAnchor(rows)).toMatchObject({ rowId: 5, entityId: 'a3' })
    expect(findForkAnchor([{ rowId: 9, entityId: 'x', kind: 'assistantText', state: 'streaming', text: '' }])).toBeNull()
  })
})

describe('分支事件（fork 回显）', () => {
  it('removed 截断时发 conversation.branch（fromRowId/removedRows）；非截断不发', async () => {
    const fake = makeFake()
    const events: Array<Record<string, unknown>> = []
    const p = new ZcodeSessionProjection({ agent: fake.agent as never, now: () => 0, log: () => undefined })
    p.onEvent((e) => events.push(e as unknown as Record<string, unknown>))
    await p.watchWorkspace('/w')
    await p.watchSession('/w', 's1')
    fake.emit(deltaFrame('s1', [
      { op: 'row.appended', row: { rowId: 1, kind: 'userInput', text: 'q' } },
      { op: 'row.appended', row: { rowId: 2, entityId: 'e', kind: 'assistantText', state: 'complete', text: 'a' } },
      { op: 'row.appended', row: { rowId: 3, entityId: 'e2', kind: 'assistantText', state: 'complete', text: 'b' } },
    ]))
    fake.emit(deltaFrame('s1', [{ op: 'row.removed', fromRowId: 2 }]))
    const branch = events.filter((e) => e.type === 'conversation.branch') as Array<{ fromRowId: number; removedRows: number; sessionId: string }>
    expect(branch).toHaveLength(1)
    expect(branch[0]).toMatchObject({ fromRowId: 2, removedRows: 2, sessionId: 's1' })
  })
})
