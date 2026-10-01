// overlay/custom/client/matrix-chat/__tests__/state-event-group-and-permalink.test.ts
// 吸收二期 B 批守门（2026-10-01）：
// B1 系统事件聚合折叠（element-web 成员事件合并行范式）——连续 ≥3 条状态事件
//    折叠为一行摘要、点击展开；1-2 条直渲。源码级断言聚合分支与模板锚点。
// B2 permalink 改 studio 内链（hash 路由 + event 查询参数编码）+ MatrixRoomCanvas
//    消费 route.query.event 直跳（jumpToEvent 全链路为 C6 修过的版本）。
// 行为级断言覆盖 permalink 产出格式（useEventTileData 纯函数无 store 依赖）。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { useEventTileData } from '../composables/useEventTileData'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

/** 最小假事件：够过 useEventTileData 的面。 */
function fakeEvent(roomId: string | null, eventId: string | null) {
  return {
    getRoomId: () => roomId,
    getId: () => eventId,
    getContent: () => ({ body: 'x' }),
    getSender: () => '@u:s',
    getDate: () => null,
    // isEmote/isBigEmoji 分支探测
  } as never
}

describe('B2 permalink = studio 内链（matrix.to 外链退役）', () => {
  it('产出 hash 路由内链：#/app/s/room/<roomId>?event=<eventId>，特殊字符编码', () => {
    const { permalink } = useEventTileData({ event: fakeEvent('!r/oom:s', '$ev:ent') } as never)
    expect(permalink.value).toContain('#/app/s/room/')
    expect(permalink.value).toContain(encodeURIComponent('!r/oom:s'))
    expect(permalink.value).toContain(`?event=${encodeURIComponent('$ev:ent')}`)
    expect(permalink.value).not.toContain('matrix.to')
  })

  it('缺 roomId/eventId 返回 #（不产出断链）', () => {
    expect(useEventTileData({ event: fakeEvent(null, 'e1') } as never).permalink.value).toBe('#')
    expect(useEventTileData({ event: fakeEvent('r1', null) } as never).permalink.value).toBe('#')
  })
})

describe('B2 路由 event 参数直跳接线（MatrixRoomCanvas 消费）', () => {
  it('画布读 route.query.event 并在房间选中后 jumpToEvent', () => {
    const canvas = readOverlay('custom/client/matrix-chat/components/MatrixRoomCanvas.vue')
    expect(canvas).toContain('route.query.event')
    expect(canvas).toContain('jumpToEvent')
    // 消费时机守卫：须等房间选中（activeRoom）后才跳，防打空时间线
    expect(canvas).toMatch(/routeEventId[\s\S]*roomStore\.activeRoom[\s\S]*jumpToEvent/)
  })
})

describe('B1 系统事件聚合折叠（≥3 连续折叠，1-2 直渲）', () => {
  it('groupedItems 含 stateEventGroup 聚合分支（阈值 ≥3）', () => {
    const panel = readOverlay('custom/client/matrix-chat/components/MatrixTimelinePanel.vue')
    expect(panel).toContain("type: 'stateEventGroup'")
    expect(panel).toMatch(/pendingState\.length\s*>=\s*3/)
    // 循环首尾 flush：连续段跨日期分隔符/循环末尾都要结算
    expect(panel).toContain('flushState()')
  })

  it('模板渲染聚合组锚点与展开/收起交互', () => {
    const panel = readOverlay('custom/client/matrix-chat/components/MatrixTimelinePanel.vue')
    expect(panel).toContain('state-event-group-')
    expect(panel).toContain('toggleStateGroup')
    expect(panel).toContain('expandedStateGroups')
  })

  it('聚合词条入消息面本地字典（zh/en 双键）', () => {
    const dict = readOverlay('custom/client/ia2/i18n-msg-surface.ts')
    expect(dict).toContain('stateEventsCollapsed')
    expect(dict).toContain("'展开'")
    expect(dict).toContain("'Expand'")
  })
})
