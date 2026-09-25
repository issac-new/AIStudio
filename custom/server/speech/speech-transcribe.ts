// overlay/speech 域：语音转写（antigravity §四 P2-12 残留件，矩阵 §3.1 antigravity）。
//
// antigravity 语义（语音转写：语音输入转文字——A11 混合项的语音半边；定时任务编辑
// 视图已由 autosched+qoder Q5 覆盖，沙箱❌已裁）：语音→文本的转写面——**转写质量
// 判定**（置信度门槛：低置信标注不冒充确定）+**音频分段**（长语音按静音分段）。
// 纯判定面（转写引擎归 ASR 域）。
export interface TranscribeSegment {
  segmentId: string
  text: string
  /** ASR 置信度（0-1）。 */
  confidence: number
  durationMs: number
}

export interface TranscribeResult {
  text: string
  /** 低置信标注段（诚实标注——不冒充确定）。 */
  lowConfidenceSegments: string[]
  quality: 'good' | 'fair' | 'poor'
}

const CONFIDENCE_THRESHOLD = 0.7

/** 转写聚合（置信度门槛：低置信标注；质量档按均置信）。 */
export function transcribeSummary(segments: readonly TranscribeSegment[]): TranscribeResult {
  const lowConfidenceSegments = segments
    .filter((s) => s.confidence < CONFIDENCE_THRESHOLD)
    .map((s) => s.segmentId)
  const avgConf = segments.length
    ? segments.reduce((s, x) => s + x.confidence, 0) / segments.length
    : 0
  return {
    text: segments.map((s) => s.text).join(' ').trim(),
    lowConfidenceSegments,
    quality: avgConf >= 0.85 ? 'good' : avgConf >= 0.6 ? 'fair' : 'poor',
  }
}

/** 音频分段判定（长段超限拆分提示——antigravity 分段语义）。 */
export function needsSplit(segment: TranscribeSegment, maxDurationMs = 60_000): boolean {
  return segment.durationMs > maxDurationMs
}
