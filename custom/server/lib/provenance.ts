// 跨模型 provenance（EvoTeam 吸收，2026-11-08）。
//
// 目的：经验/规则/组件是模型无关的文本资产，但“换模型后是否仍然有效”必须可判定。
// 纪律：缺值一律 null，不猜；跨模型复测三态（true/false/null=未知）。
// 环境变量：HARNESS_EXECUTOR_MODEL（产出资产时的模型）、HARNESS_ACTIVE_MODEL
// （当前执行模型）、HARNESS_EXECUTOR（执行者标识）。

export interface ArtifactProvenance {
  /** 产出该资产的模型标识；未知=null。 */
  model: string | null
  /** 执行者/宿主标识；未知=null。 */
  executor: string | null
  /** ISO 时刻。 */
  at: string
}

export function currentProvenance(now: Date = new Date()): ArtifactProvenance {
  return {
    model: process.env.HARNESS_EXECUTOR_MODEL?.trim() || null,
    executor: process.env.HARNESS_EXECUTOR?.trim() || null,
    at: now.toISOString(),
  }
}

/** 宽容解析：非对象返回 undefined；缺字段回落 null；at 非法回落当前时刻。 */
export function parseProvenance(raw: unknown): ArtifactProvenance | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const at = str(o.at)
  return {
    model: str(o.model),
    executor: str(o.executor),
    at: at ?? new Date().toISOString(),
  }
}

/**
 * 是否需要跨模型复测：资产模型 ≠ 当前执行模型 → true；任一未知 → null（不猜）。
 * 只在两侧都有模型标识时给确定判断。
 */
export function crossModelRetestNeeded(
  provenance: ArtifactProvenance | undefined | null,
  activeModel?: string | null,
): boolean | null {
  const active = String(activeModel ?? process.env.HARNESS_ACTIVE_MODEL ?? '').trim()
  const produced = provenance?.model?.trim() ?? ''
  if (!produced || !active) return null
  return produced !== active
}
