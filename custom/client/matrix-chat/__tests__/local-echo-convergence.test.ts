// overlay/custom/client/matrix-chat/__tests__/local-echo-convergence.test.ts
// D1 守门：乐观回显「发送中…」收敛链路（2026-09-23 驾驶舱回归 P1 修复）。
// 根因链：SDK 发送确认只发 RoomEvent.LocalEchoUpdated（对同一 MatrixEvent
// 原地翻 id 与 status，不发 Timeline）→ 零监听 + 非响应式对象 → 回显永不收敛。
// 修复链三环节均为源契约（组件级全链需真实 SDK，由 8649 走查实证）：
//   ① matrix-events 总线声明 onLocalEchoUpdated；
//   ② matrix-client 监听 RoomEvent.LocalEchoUpdated 并派发；
//   ③ matrix-room 接线 refreshMessages({ force: true })——force 路径替换
//      messageList 数组，驱动 v-for key（msg-<id>）变化重挂行、重读 status。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const base = resolve(__dirname, '..')

function read(rel: string): string {
  return readFileSync(resolve(base, rel), 'utf8')
}

describe('D1 本地回显收敛（LocalEchoUpdated 链路）', () => {
  it('① 事件总线声明 onLocalEchoUpdated', () => {
    expect(read('stores/matrix-events.ts')).toContain('onLocalEchoUpdated: ref<(() => void) | null>(null)')
  })

  it('② client store 监听 RoomEvent.LocalEchoUpdated 并派发总线', () => {
    const src = read('stores/matrix-client.ts')
    expect(src).toContain('RoomEvent.LocalEchoUpdated')
    expect(src).toMatch(/on\(RoomEvent\.LocalEchoUpdated[\s\S]*?onLocalEchoUpdated\.value\?\.\(\)/)
  })

  it('③ room store 接线 force 刷新；force 路径替换 messageList 数组', () => {
    const src = read('stores/matrix-room.ts')
    expect(src).toContain('matrixEventBus.onLocalEchoUpdated.value = () => getRoomStore().refreshMessages({ force: true })')
    expect(src).toContain('opts?.force')
    // v-for key 必须含 event id：id 原地翻转后 key 变化才能重挂行
    const panel = read('components/MatrixTimelinePanel.vue')
    expect(panel).toContain("item.type === 'stateEvent' ? 'state-' + item.event.getId() : 'msg-' + item.event.getId()")
  })
})
