// overlay/runlog 域：执行日志每 run 一行投影（multica execution log 吸收，矩阵 §3.2 multica P2）。
//
// multica 语义（execution log：每 run 一行——runId/结论/耗时/退出码一眼可读）：
// - **一行一 run**：面板行投影，不展开全量输出；
// - **结论三态**：success（退出码 0）/ failed（非 0）/ timeout（超时标记）；
// - **排序默认时间倒序**；筛选按结论。
// 衔接 runs 契约与 RunTrace 时序（deepseek 吸收件）：本层=行投影纯函数。
export type RunOutcome = 'success' | 'failed' | 'timeout'

export interface RunRecord {
  runId: string
  startedAt: number
  durationMs: number
  exitCode: number | null
  timedOut: boolean
  command: string
}

export interface RunLogLine {
  runId: string
  outcome: RunOutcome
  durationMs: number
  command: string
  /** 行摘要：结论+耗时（秒，一位小数）+命令截断 40 字。 */
  summary: string
}

/** run → 一行日志投影（multica 语义）。 */
export function runLogLine(run: RunRecord): RunLogLine {
  const outcome: RunOutcome = run.timedOut ? 'timeout' : run.exitCode === 0 ? 'success' : 'failed'
  const secs = (run.durationMs / 1000).toFixed(1)
  const cmd = run.command.length > 40 ? run.command.slice(0, 39) + '…' : run.command
  return {
    runId: run.runId,
    outcome,
    durationMs: run.durationMs,
    command: run.command,
    summary: `${outcome} ${secs}s ${cmd}`,
  }
}

/** 日志面投影：筛选（可选结论）+时间倒序。 */
export function runLogView(
  runs: readonly RunRecord[],
  filter?: RunOutcome,
): RunLogLine[] {
  return runs
    .filter((r) => !filter || runLogLine(r).outcome === filter)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(runLogLine)
}
