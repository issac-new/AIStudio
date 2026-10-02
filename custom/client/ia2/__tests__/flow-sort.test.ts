// overlay/custom/client/ia2/__tests__/flow-sort.test.ts
// 房间列表卫生守门（2026-10-01 吸收二期·建议 3）：排序器三档行为
// （element-web skip-list sorters 范式）+ 面板切换器接线静态断言。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { sortFlowRows, type FlowSessionRow } from '../adapters/flow'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

function row(id: string, name: string, unread: number, lastActivityAt: number | null): FlowSessionRow {
  return { kind: 'room', id, name, unread, taskIds: [], teamTag: '', dutyName: null, lastActivityAt }
}

describe('sortFlowRows 三档排序（单一事实源）', () => {
  const base = [
    row('a', '支付群', 0, 100),
    row('b', '交付群', 3, 50),
    row('c', 'abc 群', 1, 200),
  ]

  it('recent：透传上游活跃倒序（不重排）', () => {
    expect(sortFlowRows(base, 'recent').map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('unread：未读数倒序，同数按活跃倒序', () => {
    expect(sortFlowRows(base, 'unread').map(r => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('alpha：名称 localeCompare 稳定排序（拉丁名用例，不依赖 CJK ICU 序假设）', () => {
    const latin = [row('x', 'delta', 0, 1), row('y', 'alpha', 0, 2), row('z', 'charlie', 0, 3)]
    expect(sortFlowRows(latin, 'alpha').map(r => r.id)).toEqual(['y', 'z', 'x'])
  })

  it('不动原数组（纯函数）', () => {
    const before = base.map(r => r.id)
    sortFlowRows(base, 'alpha')
    expect(base.map(r => r.id)).toEqual(before)
  })
})

describe('FlowNavPanel 排序切换器接线', () => {
  const panel = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ia2/components/flow/FlowNavPanel.vue'), 'utf8')

  it('切换器三档 testid（模板插值模式）+ settings-layers user 层持久化 + sortFlowRows 消费', () => {
    // 模板里是 `flow-sort-${sm}` 插值——断言插值锚点与三档数组字面量
    expect(panel).toContain('flow-sort-${sm}')
    expect(panel).toContain("'recent', 'unread', 'alpha'")
    // 2026-10-02 #13 步二：偏好走分层（user 层 sl:user:flow.sortMode），
    // 遗留裸键 ia2.flow.sortMode 一次性收养后退役
    expect(panel).toContain("writeSetting('user', 'flow.sortMode'")
    expect(panel).toContain("adoptLegacySetting('flow.sortMode', 'ia2.flow.sortMode')")
    expect(panel).toContain('sortFlowRows')
  })

  it('同名房从属标注深化：悬停含房 ID + 最后活动时间', () => {
    expect(panel).toContain('toLocaleString()')
    expect(panel).toContain('flow-dup-suffix')
  })
})
