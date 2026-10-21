// overlay/governance 域：全局紧急停止 + 停后活性复核（2026-10-21 AGT 吸收轮 E，用户裁定「全做」）。
//
// 语义如实（对齐 AGT LIMITATIONS「kill switch 是合作式机制，不是保命符」）：
//   - 停止 = 对每个在跑/排队会话调 ChatRunSocket.abortSession（合作式中止，
//     置 isAborting + 中断 bridge run），不杀进程、不承诺强停；
//   - 复核 = 等待 recheckMs 后重查 fleet 快照，仍在跑的如实标红——「确认真的
//     停了」靠复核面，不靠 abort 调用返回值；
//   - 留痕 = govbus system/high 事件（谁在何时为什么停了什么）。
import { getFleetLiveEntries, abortFleetSession } from '../services/hermes/fleet-tap'
import type { FleetLiveEntry } from '../services/hermes/fleet-snapshot'

export interface EmergencyStopTarget {
  sessionId: string
  profile: string
  isWorking: boolean
  queueLength: number
}

export interface EmergencyStopReport {
  at: number
  reason: string
  /** 停止令目标数（在跑或排队中的会话）。 */
  targets: number
  results: Array<{ sessionId: string; profile: string; ok: boolean; error?: string }>
  /** 复核时刻（epoch ms）。 */
  recheckAt: number
  /** 复核仍在跑的会话（合作式中止未兑现——如实标红，不粉饰 allStopped）。 */
  stillWorking: Array<{ sessionId: string; profile: string; isAborting: boolean }>
  /** 全部目标确认停止（复核后无 isWorking 残留）。 */
  allStopped: boolean
  tapReady: boolean
}

export interface EmergencyStopDeps {
  /** 注入面（测试用）；缺省走真实 fleet-tap。 */
  liveEntries?: () => FleetLiveEntry[]
  abort?: (sessionId: string, reason: string) => Promise<{ ok: boolean; error?: string }>
  delay?: (ms: number) => Promise<void>
  now?: () => number
}

function targetsOf(live: FleetLiveEntry[]): EmergencyStopTarget[] {
  return live
    .filter((e) => e.isWorking || e.queueLength > 0)
    .map((e) => ({ sessionId: e.id, profile: e.profile, isWorking: e.isWorking, queueLength: e.queueLength }))
}

function targetIds(t: EmergencyStopTarget[]): Set<string> {
  return new Set(t.map((x) => x.sessionId))
}

/** 全局紧急停止：并发 abort 全部在跑/排队会话 → 等 recheckMs → 复核活性。
 *  confirm 闸在 controller 层（必须字面 'STOP-ALL'）；本函数只做事不留确认逻辑。 */
export async function emergencyStopAll(
  opts: { reason?: string; recheckMs?: number } = {},
  deps: EmergencyStopDeps = {},
): Promise<EmergencyStopReport> {
  const now = deps.now ?? (() => Date.now())
  const delay = deps.delay ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const liveEntries = deps.liveEntries ?? getFleetLiveEntries
  const abort = deps.abort ?? abortFleetSession
  const reason = opts.reason?.slice(0, 200) || '全局紧急停止（治理姿态面板）'
  const recheckMs = Math.min(15_000, Math.max(500, Math.round(opts.recheckMs ?? 3_000)))

  const before = targetsOf(liveEntries())
  const targetSet = targetIds(before)
  const settled = await Promise.all(
    before.map(async (t) => ({ sessionId: t.sessionId, profile: t.profile, ...(await abort(t.sessionId, reason)) })),
  )

  await delay(recheckMs)

  const after = liveEntries()
  const stillWorking = after
    .filter((e) => targetSet.has(e.id) && e.isWorking)
    .map((e) => ({ sessionId: e.id, profile: e.profile, isAborting: e.isAborting === true }))

  const report: EmergencyStopReport = {
    at: now(),
    reason,
    targets: before.length,
    results: settled,
    recheckAt: now(),
    stillWorking,
    allStopped: stillWorking.length === 0,
    tapReady: true,
  }

  // 留痕（fire-and-forget；总线故障不影响停止主链路）
  import('../govbus/event-log')
    .then(({ appendGovEvent }) => {
      appendGovEvent({
        domain: 'system',
        severity: 'high',
        type: 'emergency.stop-all',
        source: 'governance/emergency-stop',
        summary: `全局紧急停止：目标 ${before.length} 个会话，复核 ${stillWorking.length} 个仍在跑（${reason}）`,
        refs: {},
        payload: {
          reason, targets: before.length, stopped: before.length - stillWorking.length,
          stillWorking: stillWorking.map((s) => s.sessionId),
        },
      })
    })
    .catch(() => { /* fail-soft */ })

  return report
}
