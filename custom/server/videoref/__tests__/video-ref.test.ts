// 视频间接引用链路守门（kimi：间接引用/能力解析/20MB 降级链/物化幂等）。
import { describe, it, expect } from 'vitest'
import { resolveVideoPlan, materializeRef, VIDEO_MAX_BYTES, type VideoRef } from '../video-ref'

const ref = (over: Partial<VideoRef> = {}): VideoRef => ({
  uri: 'kimi-file:///tmp/demo.mp4', sizeBytes: 5 * 1024 * 1024, mime: 'video/mp4', ...over,
})
const MB = 1024 * 1024

describe('resolveVideoPlan（通道裁决+降级链）', () => {
  it('原生视频模型直传；图片模型走抽帧主通道；纯文本模型拒+建议转写', () => {
    expect(resolveVideoPlan(ref(), { nativeVideo: true, image: true }).mode).toBe('native-video')
    const frames = resolveVideoPlan(ref(), { nativeVideo: false, image: true })
    expect(frames.mode).toBe('frames')
    expect(frames.frameBudget).toEqual({ frames: 8, widthPx: 1280 })
    const textOnly = resolveVideoPlan(ref(), { nativeVideo: false, image: false })
    expect(textOnly.mode).toBe('reject')
    expect(textOnly.reason).toContain('转写')
  })

  it('降级链：>10MB 帧数减半；>16MB 帧数减半+分辨率降；>20MB 拒', () => {
    const over10 = resolveVideoPlan(ref({ sizeBytes: 12 * MB }), { nativeVideo: false, image: true })
    expect(over10.frameBudget?.frames).toBe(4)
    const over16 = resolveVideoPlan(ref({ sizeBytes: 18 * MB }), { nativeVideo: false, image: true })
    expect(over16.frameBudget).toEqual({ frames: 4, widthPx: 854 })
    const over20 = resolveVideoPlan(ref({ sizeBytes: VIDEO_MAX_BYTES + 1 }), { nativeVideo: true, image: true })
    expect(over20.mode).toBe('reject')
    expect(over20.reason).toContain('20MB')
  })

  it('非 kimi-file:// 引用拒（间接引用红线）', () => {
    expect(resolveVideoPlan(ref({ uri: 'data:video/mp4;base64,...' }), { nativeVideo: true, image: true }).mode).toBe('reject')
  })
})

describe('materializeRef（会话物化幂等）', () => {
  it('同 uri 二次注册去重返原 handle', () => {
    const first = materializeRef(new Map(), ref())
    expect(first.deduped).toBe(false)
    expect(first.handle).toContain('media:mp4:')
    const second = materializeRef(first.registry, ref())
    expect(second.deduped).toBe(true)
    expect(second.handle).toBe(first.handle)
  })
})
