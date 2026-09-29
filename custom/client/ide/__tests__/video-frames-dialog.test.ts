// A7 守门：IdeVideoFramesDialog 抽帧链（/api/ide/video-frames 客户端零消费者根治）。
// @vitest-environment jsdom
// 契约：相对路径按 workspace 解析为绝对路径；帧数默认 8；成功产出 PNG File[]
// 经 frames 事件上抛（IdeChatPane 接 ChatInput.addFiles）；失败如实显错不关窗。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import IdeVideoFramesDialog from '../components/IdeVideoFramesDialog.vue'

// 1x1 PNG 的最小合法 base64（组件只解 base64→bytes，不校验图像内容）
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('IdeVideoFramesDialog（A7）', () => {
  beforeEach(() => fetchMock.mockReset())

  it('相对路径按 workspace 解析；成功产出 PNG File 并关窗', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ ok: true, count: 2, frames: [{ index: 0, dataBase64: PNG_B64 }, { index: 1, dataBase64: PNG_B64 }] }),
    }))
    const w = mount(IdeVideoFramesDialog, { props: { workspace: '/w' } })
    await w.find('[data-testid="ide-vf-path"]').setValue('rec/demo.mp4')
    await w.find('[data-testid="ide-vf-extract"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe('/api/ide/video-frames')
    expect(JSON.parse(String(call[1]?.body))).toEqual({ videoPath: '/w/rec/demo.mp4', frames: 8, widthPx: 1280 })
    const framesEvents = w.emitted('frames')
    expect(framesEvents).toBeTruthy()
    const files = framesEvents![0][0] as File[]
    expect(files).toHaveLength(2)
    expect(files[0].name).toBe('video-frame-1.png')
    expect(files[0].type).toBe('image/png')
    expect(files[0].size).toBeGreaterThan(0)
    expect(w.emitted('close')).toBeTruthy()
  })

  it('绝对路径原样透传（不按 workspace 拼接）', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ ok: true, frames: [{ index: 0, dataBase64: PNG_B64 }] }) }))
    const w = mount(IdeVideoFramesDialog, { props: { workspace: '/w' } })
    await w.find('[data-testid="ide-vf-path"]').setValue('/tmp/abs.mp4')
    await w.find('[data-testid="ide-vf-extract"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).videoPath).toBe('/tmp/abs.mp4')
  })

  it('失败（视频不存在 404/抽帧失败 422）：显错不关窗不上抛', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 422, json: async () => ({ ok: false, detail: 'ffmpeg 不可用' }) }))
    const w = mount(IdeVideoFramesDialog, { props: { workspace: '/w' } })
    await w.find('[data-testid="ide-vf-path"]').setValue('bad.mp4')
    await w.find('[data-testid="ide-vf-extract"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-vf-error"]').text()).toContain('ffmpeg 不可用')
    expect(w.emitted('frames')).toBeFalsy()
    expect(w.emitted('close')).toBeFalsy()
  })

  it('空路径按钮禁用', async () => {
    const w = mount(IdeVideoFramesDialog, { props: { workspace: null } })
    expect((w.find('[data-testid="ide-vf-extract"]').element as HTMLButtonElement).disabled).toBe(true)
  })
})
