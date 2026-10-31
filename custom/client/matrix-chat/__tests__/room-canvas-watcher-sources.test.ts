// MatrixRoomCanvas 兜底 watcher 引用守门（2026-10-31 日常工作台回归批）。
// 实录：cd2742a8f 为治 run23「群时间线间歇不挂载」补的第二条自愈 watcher 写作
// roomStore.rooms.length，而 matrix-room store 只导出 roomList/sortedRooms——
// watcher 建立即求值 undefined.length，setup 抛错、房间画布不挂载（走查 pageerror
// TypeError reading 'length' 定谳）。本测试用静态源码断言锁两端的契约：
// 画布只准引用 store 真实导出的键，store 不准悄悄出现语义含混的裸 rooms 导出。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const canvas = readFileSync(
  resolve(__dirname, '../components/MatrixRoomCanvas.vue'), 'utf8')
const store = readFileSync(
  resolve(__dirname, '../stores/matrix-room.ts'), 'utf8')

describe('房间画布 watcher 引用守门', () => {
  it('画布不引用 store 未导出的 rooms 键（undefined.length 根治）', () => {
    expect(canvas).not.toMatch(/roomStore\.rooms\b/)
    expect(canvas).not.toMatch(/matrixRoom\.rooms\b/)
  })

  it('列表变化自愈 watcher 挂在 sortedRooms 上（selectRoom/activeRoom 同源）', () => {
    expect(canvas).toMatch(/watch\(\(\) => roomStore\.sortedRooms\.length/)
  })

  it('store 导出面保持 roomList＋sortedRooms，不新增裸 rooms 键（重命名守门）', () => {
    // store setup 返回块以缩进行形式导出键；按整文件断言两键在、裸 rooms 行不在
    expect(store).toMatch(/\bsortedRooms,/)
    expect(store).toMatch(/\broomList,/)
    expect(store).not.toMatch(/^\s+rooms,?\s*$/m)
  })
})
