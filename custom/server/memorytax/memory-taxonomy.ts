// overlay/memorytax 域：auto memory 四类型+新鲜度（claude-code §五差距表 P2 吸收，矩阵 §3.7 P2）。
//
// cc 语义（auto memory 四类型+新鲜度）：自动沉淀的记忆按**四类型**归档——
// - **preference**：用户偏好（怎么做的习惯）；
// - **convention**：项目约定（怎么做的规矩）；
// - **fact**：事实记录（是什么——含锚点）；
// - **lesson**：经验教训（踩过什么坑）。
// **新鲜度**：记忆带时效（fresh/aging/stale 按 age 天数），stale 检索时降权提示
// 重新核实（防过期记忆误导）。分类=调用方给类型（LLM 分类列后续），本层=类型
// 契约+新鲜度判定+归档（衔接 406 记忆 FTS 索引）。
export const MEMORY_TYPES = ['preference', 'convention', 'fact', 'lesson'] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

export type Freshness = 'fresh' | 'aging' | 'stale'

export interface MemoryEntry {
  text: string
  type: MemoryType
  at: number
  /** 事实类锚点（fact 必带：file:line/命令——400 done 同纪律）。 */
  anchor?: string
}

export interface ClassifiedMemory extends MemoryEntry {
  freshness: Freshness
  ageDays: number
  /** stale 降权提示（检索时展示"请重新核实"）。 */
  needsRecheck: boolean
}

const FRESH_DAYS = 7
const AGING_DAYS = 30

export function isMemoryType(v: unknown): v is MemoryType {
  return typeof v === 'string' && (MEMORY_TYPES as readonly string[]).includes(v)
}

/** 新鲜度判定（7 天 fresh / 30 天 aging / 其后 stale 降权）。 */
export function freshnessOf(at: number, now: number = Date.now()): { freshness: Freshness; ageDays: number; needsRecheck: boolean } {
  const ageDays = Math.max(0, Math.floor((now - at) / (24 * 60 * 60 * 1000)))
  const freshness: Freshness = ageDays <= FRESH_DAYS ? 'fresh' : ageDays <= AGING_DAYS ? 'aging' : 'stale'
  return { freshness, ageDays, needsRecheck: freshness === 'stale' }
}

/** 批量归档判定（fact 缺锚点=告警标注——400 done 同纪律）。 */
export function classifyMemories(entries: readonly MemoryEntry[], now: number = Date.now()): Array<ClassifiedMemory & { anchorMissing?: boolean }> {
  return entries.map((e) => {
    const f = freshnessOf(e.at, now)
    return {
      ...e,
      ...f,
      ...(e.type === 'fact' && !e.anchor ? { anchorMissing: true } : {}),
    }
  })
}

/** 四类型汇总（auto memory 检索视图分桶）。 */
export function memoryTypeSummary(entries: readonly ClassifiedMemory[]): Record<MemoryType, number> {
  const out: Record<MemoryType, number> = { preference: 0, convention: 0, fact: 0, lesson: 0 }
  for (const e of entries) out[e.type] += 1
  return out
}
