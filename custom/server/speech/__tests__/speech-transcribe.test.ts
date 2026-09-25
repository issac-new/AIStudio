// 语音转写守门（antigravity：低置信标注/质量三档/分段判定）。
import { describe, it, expect } from 'vitest'
import { needsSplit, transcribeSummary, type TranscribeSegment } from '../speech-transcribe'

const seg = (id: string, text: string, confidence: number, durationMs = 5000): TranscribeSegment => ({
  segmentId: id, text, confidence, durationMs,
})

describe('语音转写（antigravity 语义）', () => {
  it('低置信标注（不冒充确定）；质量三档；分段判定', () => {
    const r = transcribeSummary([
      seg('s1', '你好', 0.9), seg('s2', '世界', 0.5), seg('s3', '呀', 0.95),
    ])
    expect(r.text).toBe('你好 世界 呀')
    expect(r.lowConfidenceSegments).toEqual(['s2'])
    expect(r.quality).toBe('fair')  // 均置信 (0.9+0.5+0.95)/3≈0.78 → fair
    expect(needsSplit(seg('long', 'x', 0.9, 90_000))).toBe(true)
    expect(needsSplit(seg('short', 'x', 0.9))).toBe(false)
    expect(transcribeSummary([])).toMatchObject({ text: '', quality: 'poor' })
  })
})
