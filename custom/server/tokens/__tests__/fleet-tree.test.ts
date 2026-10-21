// overlay/custom/server/tokens/__tests__/fleet-tree.test.ts
// Fleet 子树聚合 fold 守门：定根/父子卡/子女排序与截断/子树合计/孤儿与环防御。
import { describe, it, expect } from 'vitest'
import { foldFleetTree, FLEET_MAX, type FleetSessionRow } from '../fleet-tree'

function row(id: string, parent: string | null, tokens: number, cost = 0, lastActive = 1, title = ''): FleetSessionRow {
  return {
    id, parent_session_id: parent, title, agent: 'main', model: 'm',
    message_count: 1, tool_call_count: 0,
    input_tokens: tokens, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
    reasoning_tokens: 0, estimated_cost_usd: cost, actual_cost_usd: null,
    last_active: lastActive, is_archived: 0,
  }
}

describe('foldFleetTree', () => {
  it('三代树：定根、父/当前/子女卡、子树合计（含孙代）', () => {
    // root ← mid(当前) ← c1/c2；root 另有 sibling
    const rows = [
      row('root', null, 100, 1, 1, '根'),
      row('mid', 'root', 200, 2, 2, '当前'),
      row('c1', 'mid', 300, 3, 5, '子1'),
      row('c2', 'mid', 400, 4, 4, '子2'),
      row('sibling', 'root', 50, 0.5, 3, '兄弟'),
    ]
    const r = foldFleetTree(rows, 'mid')!
    expect(r.rootId).toBe('root')
    expect(r.parent!.sessionId).toBe('root')
    expect(r.current.sessionId).toBe('mid')
    expect(r.current.subtreeTokens).toBe(200 + 300 + 400) // 当前子树=自身+两子
    expect(r.children.map(c => c.sessionId)).toEqual(['c1', 'c2']) // last_active 降序
    expect(r.totals).toEqual({ sessions: 5, billedTokens: 1050, costUsd: 10.5 })
  })

  it('独立会话（无父无子）：root=自身，父 null，子女空——不编造', () => {
    const r = foldFleetTree([row('solo', null, 10)], 'solo')!
    expect(r.parent).toBeNull()
    expect(r.rootId).toBe('solo')
    expect(r.children.map(c => c.sessionId)).toEqual([])
    expect(r.totals).toEqual({ sessions: 1, billedTokens: 10, costUsd: 0 })
  })

  it('父链环防御：不无限上行', () => {
    const rows = [row('a', 'b', 1), row('b', 'a', 1)]
    const r = foldFleetTree(rows, 'a')!
    expect(['a', 'b']).toContain(r.rootId)
    expect(r.totals.sessions).toBe(2)
  })

  it('目标会话不在集合 → null（调用方 fail-soft）', () => {
    expect(foldFleetTree([row('x', null, 1)], 'missing')).toBeNull()
  })

  it('子女超 FLEET_MAX 截断并标注', () => {
    const rows = [row('p', null, 1)]
    for (let i = 0; i < FLEET_MAX + 5; i++) rows.push(row(`c${i}`, 'p', 1, 0, i))
    const r = foldFleetTree(rows, 'p')!
    expect(r.children).toHaveLength(FLEET_MAX)
    expect(r.childrenTruncated).toBe(true)
    // 截断只影响展示，不影响合计
    expect(r.totals.sessions).toBe(FLEET_MAX + 6)
  })

  it('成本取 actual 优先、estimated 兜底', () => {
    const rows = [{
      ...row('cur', null, 0),
      estimated_cost_usd: 1, actual_cost_usd: 9,
    }]
    expect(foldFleetTree(rows, 'cur')!.current.costUsd).toBe(9)
  })
})
