/**
 * 换窗可观测性（C4，DSH dsh-smart-compact「engine-state 探针」对等物）。
 *
 * 每次 advance 把结果/原因落到归档根目录 state.json（tmp+rename）：触发了几窗、
 * 哪个会话、不可用原因（库缺席/表缺席）。GET /api/context-archive/state
 * 读它 + 实时扫盘汇总——"为什么没有归档"必须可答（不静默）。
 */
import { listArchivedSessions, readArchiveJson, writeArchiveJson } from './archive-store'

/** 一次 advance 的结构化结果（advance.ts 产出）。 */
export interface AdvanceResult {
  available: boolean
  /** 不可用原因（库缺席/表缺席），空数组=可用。 */
  reasons: string[]
  /** 快照表里可见的压缩会话数。 */
  sessionsScanned: number
  /** 本次实际写出新窗的会话数。 */
  sessionsArchived: number
  /** 本次新建窗口数。 */
  windowsCreated: number
  windows: Array<{ session: string; window: number; messageCount: number }>
}

/** state.json 文件体（只存"最近一次"，累计面读盘汇总——盘是事实源）。 */
interface RolloverStateFile {
  lastAdvanceAt: number | null
  lastResult: AdvanceResult | null
}

const STATE_REL = 'state.json'

/** 记录一次 advance 结果（advance.ts 尾部调用；fail-soft）。 */
export function recordAdvance(result: AdvanceResult): void {
  const file: RolloverStateFile = { lastAdvanceAt: Date.now(), lastResult: result }
  try {
    writeArchiveJson(STATE_REL, file)
  } catch (err) {
    console.warn(`[context-archive] rollover state 写入失败（fail-soft）：${err instanceof Error ? err.message : String(err)}`)
  }
}

export interface RolloverStateView {
  lastAdvanceAt: number | null
  /** 当前盘上有归档的会话数（实时扫盘，非缓存）。 */
  sessionsArchived: number
  /** 当前盘上窗口总数。 */
  windowCount: number
  lastResult: AdvanceResult | null
  /** 最近一次 advance 的不可用原因（可用=空数组）。 */
  unavailable: string[]
}

/** /api/context-archive/state 视图：state.json 最近一次 + 实时盘面汇总。 */
export function getRolloverState(): RolloverStateView {
  const file = readArchiveJson<RolloverStateFile>(STATE_REL) ?? { lastAdvanceAt: null, lastResult: null }
  const sessions = listArchivedSessions()
  return {
    lastAdvanceAt: file.lastAdvanceAt,
    sessionsArchived: sessions.length,
    windowCount: sessions.reduce((acc, s) => acc + s.windowCount, 0),
    lastResult: file.lastResult,
    unavailable: file.lastResult?.reasons ?? [],
  }
}
