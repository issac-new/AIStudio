// overlay/evidence 域扩：泳道履历时间线（routa 任务=证据累积 laneSessions/laneHandoffs 半边，矩阵 §3.6 行 197 P0）。
//
// routa 语义（models/task.ts 泳道履历面）：任务=证据累积对象——
// - **lane_session**：泳道一次会话（进入/离开时间可稽）；
// - **lane_handoff**：泳道间交接（fromLane→toLane+承接 ref）。
// 本层=履历投影纯函数；kind 词表同 evidence-store EVIDENCE_KINDS（lane_session/
// lane_handoff 已预留），本层输入用轻结构，落库走 appendEvidence 平滑对接。
export type LaneEventKind = 'session' | 'handoff'

export interface LaneEvent {
  laneId: string
  kind: LaneEventKind
  ref: string
  at: number
  /** handoff 去向泳道（kind=handoff 才有）。 */
  peerLane?: string
}

export interface LaneTimelineRow {
  laneId: string
  kind: LaneEventKind
  ref: string
  at: number
  /** handoff 行展示 from→to。 */
  label: string
}

export interface LaneSummary {
  laneId: string
  sessions: number
  handoffsOut: number
  handoffsIn: number
}

/** 泳道履历时间线（按时间正序；跨泳道合并视图可再按 laneId 分组）。 */
export function laneTimeline(events: readonly LaneEvent[]): LaneTimelineRow[] {
  return [...events]
    .sort((a, b) => a.at - b.at)
    .map((e) => ({
      laneId: e.laneId,
      kind: e.kind,
      ref: e.ref,
      at: e.at,
      label: e.kind === 'handoff'
        ? `${e.laneId} → ${e.peerLane ?? '?'} (${e.ref})`
        : `${e.laneId} session ${e.ref}`,
    }))
}

/** 单泳道小结（会话数/出向入向交接数）。 */
export function laneSummary(events: readonly LaneEvent[], laneId: string): LaneSummary {
  let sessions = 0
  let handoffsOut = 0
  let handoffsIn = 0
  for (const e of events) {
    if (e.laneId === laneId && e.kind === 'session') sessions += 1
    if (e.laneId === laneId && e.kind === 'handoff') handoffsOut += 1
    if (e.peerLane === laneId && e.kind === 'handoff') handoffsIn += 1
  }
  return { laneId, sessions, handoffsOut, handoffsIn }
}
