// 名册树投影守门（routa §七#15：lead 聚合/delegates/descendants 计数）。
import { describe, it, expect } from 'vitest'
import { buildRosterTree } from '../utils/roster-tree'

describe('名册树（routa 团队视图语义）', () => {
  it('lead 聚合成员+delegates 直接计数+descendants 子树和+降序', () => {
    const tree = buildRosterTree({
      squads: {
        core: { leader: 'zcode', members: ['codex', 'mimo'] },
        review: { leader: 'codex', members: [] },
      },
      delegateCounts: { zcode: 3, codex: 2, mimo: 1 },
    })
    expect(tree[0]).toMatchObject({ id: 'core', lead: true, delegates: 3, descendants: 6 })
    expect(tree[1]).toMatchObject({ id: 'review', delegates: 2, descendants: 2 })
    expect(buildRosterTree({ squads: {}, delegateCounts: {} })).toEqual([])
  })
})
