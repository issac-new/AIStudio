// overlay/custom/client/ia2/utils/director-run.ts
// 导演 run 识别与改道单一事实源（2026-10-20 W3 两体系贯通批，spec=
// docs/superpowers/specs/2026-10-20-cockpit-residual-fixes.md D4/D5）。
// 导演台以 spec.id=`sim-director-*` 起跑（custom/server/loop/graph/graph-rest.ts），
// runId 形如 `run-sim-director-*`。26 步旧体系（run-state/journal/deliverables/issues/
// branches）读不到这类运行——与其逐端点 404 刷噪音，不如在 API 层即时拒答并指往
// 导演台（导演运行数据走图运行时 API：/api/graph/runs/*）。

export const DIRECTOR_RUN_PREFIX = 'run-sim-director-'

export function isDirectorRun(runId: string): boolean {
  return runId.startsWith(DIRECTOR_RUN_PREFIX)
}

/** 旧体系 API 守卫：导演 run 返回改道错误（调用方即时 reject，零网络探测）；否则 null。 */
export function directorRunGuideError(runId: string): Error | null {
  return isDirectorRun(runId)
    ? new Error('导演运行——26 步视图不适用，运行详情见「导演台」')
    : null
}
