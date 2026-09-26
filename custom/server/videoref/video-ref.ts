// overlay/videoref 域：视频/媒体间接引用链路数据面（kimi 视频输入吸收，矩阵 §3.3 ④——
// 条件启动项，2026-09-26 通道成本裁决后实施层 1）。
//
// **通道成本裁决（本域核心决策）**：视频入 LLM 四通道——
//   ①base64 全量内嵌：20MB 级视频必爆上下文 ❌；
//   ②provider 原生视频帧 API：能力依赖强，仅 GLM-4V 类支持（可遇不可求）；
//   ③**抽帧图片化（主通道）**：视频→预算内 N 关键帧图片走通用多模态——
//     通用性最好，成本可控（帧数×分辨率双预算）✅；
//   ④转写文本化：信息损失大，仅 text-only 模型兜底建议。
// kimi 语义保留：kimi-file:// **间接引用**（消息只带引用不内嵌）+**会话物化**
// （引用注册进会话媒体册，幂等）+**按模型能力解析**+**20MB 上限降级链**。
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024

export interface VideoRef {
  /** kimi-file:// 间接引用（不内嵌内容）。 */
  uri: string
  sizeBytes: number
  /** 媒体类型。 */
  mime: 'video/mp4' | 'video/webm' | 'video/quicktime'
}

export interface ModelCaps {
  /** 原生视频帧输入。 */
  nativeVideo: boolean
  /** 图片多模态。 */
  image: boolean
}

export interface VideoPlan {
  mode: 'native-video' | 'frames' | 'reject'
  /** frames 档帧数×分辨率（降级链后终值）。 */
  frameBudget?: { frames: number; widthPx: number }
  reason: string
}

export interface FrameBudgetInput {
  /** 上限帧数（kimi 语义默认 8）。 */
  maxFrames: number
  /** 上限分辨率宽（默认 1280）。 */
  maxWidthPx: number
}

/** 按模型能力+大小解析计划（kimi：按模型能力解析+20MB 降级链）。 */
export function resolveVideoPlan(
  ref: VideoRef,
  caps: ModelCaps,
  budget: FrameBudgetInput = { maxFrames: 8, maxWidthPx: 1280 },
): VideoPlan {
  if (ref.sizeBytes > VIDEO_MAX_BYTES) {
    return { mode: 'reject', reason: `超过 20MB 上限（${(ref.sizeBytes / 1024 / 1024).toFixed(1)}MB）——裁剪后再投喂` }
  }
  if (!ref.uri.startsWith('kimi-file://')) {
    return { mode: 'reject', reason: '仅接受 kimi-file:// 间接引用（不内嵌）' }
  }
  if (caps.nativeVideo) {
    return { mode: 'native-video', reason: 'provider 原生视频帧——间接引用直传' }
  }
  if (caps.image) {
    // 降级链：帧预算随体积收缩（>10MB 减半帧数；>16MB 再降分辨率）
    let { maxFrames, maxWidthPx } = budget
    let note = '抽帧图片化（主通道）'
    if (ref.sizeBytes > 16 * 1024 * 1024) {
      maxFrames = Math.max(2, Math.floor(maxFrames / 2))
      maxWidthPx = Math.min(maxWidthPx, 854)
      note += '；>16MB 降级：帧数减半+分辨率 854px'
    } else if (ref.sizeBytes > 10 * 1024 * 1024) {
      maxFrames = Math.max(2, Math.floor(maxFrames / 2))
      note += '；>10MB 降级：帧数减半'
    }
    return { mode: 'frames', frameBudget: { frames: maxFrames, widthPx: maxWidthPx }, reason: note }
  }
  return { mode: 'reject', reason: '模型无多模态能力——建议先转写为文本再投喂' }
}

/** 会话物化（媒体册注册幂等：同 uri 二次注册返回原 handle）。 */
export function materializeRef(
  registry: ReadonlyMap<string, string>,
  ref: VideoRef,
): { registry: Map<string, string>; handle: string; deduped: boolean } {
  const existing = registry.get(ref.uri)
  if (existing) {
    return { registry: new Map(registry), handle: existing, deduped: true }
  }
  const handle = `media:${ref.mime.split('/')[1]}:${ref.sizeBytes}:${ref.uri.slice('kimi-file://'.length).slice(0, 40)}`
  const next = new Map(registry)
  next.set(ref.uri, handle)
  return { registry: next, handle, deduped: false }
}
