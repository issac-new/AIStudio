// overlay/custom/client/matrix-chat/__tests__/share-link.test.ts
// B1（2026-10-20 驾驶舱整治）：分享链接产品内链化守门。
// 背景正文见 docs/superpowers/specs/2026-10-20-cockpit-split-and-hygiene.md §B1：
// matrix.to 外链在私有 homeserver 上解析不到房间；房间 ID 禁外发第三方二维码服务。
// 源码级断言（与 state-event-group-and-permalink.test.ts 同范式）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
function read(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

describe('B1 分享弹窗 = 产品内链（matrix.to 退役）', () => {
  const dialog = read('custom/client/matrix-chat/components/MatrixShareDialog.vue')

  it('不再产出 matrix.to 外链', () => {
    expect(dialog).not.toContain('https://matrix.to')
    expect(dialog).not.toContain('matrix://')
  })

  it('房间链接走 hash 内链路由（与 permalink 规范同源）', () => {
    expect(dialog).toContain('#/app/s/room/')
    expect(dialog).toContain('encodeURIComponent(roomId.value)')
  })

  it('二维码本地生成，房间 ID 不外发第三方服务', () => {
    expect(dialog).not.toContain('qrserver')
    expect(dialog).toMatch(/import QRCode from 'qrcode'/)
    expect(dialog).toContain('QRCode.toDataURL')
  })
})

describe('B1 房间摘要卡 matrix:// URI 不再裸外链', () => {
  it('移除 matrix:// 自动 <a target=_blank>（保留 https 自动链接）', () => {
    const card = read('custom/client/matrix-chat/components/MatrixRoomSummaryCard.vue')
    expect(card).not.toMatch(/matrix:\/\/[^\n]*<a href/)
    expect(card).toContain('https?:\\/' + '\\/')  // 源码里的 https 正则锚仍在
  })
})

describe('B1 历史加载错误折叠呈现', () => {
  it('错误条默认人话一句话，原始错误进 <details> 折叠', () => {
    const panel = read('custom/client/matrix-chat/components/MatrixTimelinePanel.vue')
    expect(panel).toContain('timeline-error__detail')
    expect(panel).toMatch(/historyLoadError.*\n[\s\S]{0,200}<details/)
    // 不再把原始错误串内联到正文（裸 homeserver URL 直出）
    expect(panel).not.toMatch(/\{\{ t\('matrixChat\.historyLoadError'\) \}\}（\{\{ historyError \}\}）/)
  })
})
