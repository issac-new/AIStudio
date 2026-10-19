// overlay/custom/client/ia2/utils/run-options.ts
// 运行选择器选项构造（2026-10-19 0→1 复验）：纯函数，视图与测试同源。
//
// 背景：`useRunContext` 无 query 时回落 localStorage 的「最近一次运行」。
// 清场重建后 runs/ 已空，但记忆值仍在——旧实现无条件把当前值补进选项，
// 结果是选择器显示一个不存在的运行、所有面板打 run-state 404。
// 规则：
// - 列表为空且加载中：保留当前值（避免加载窗口闪空）；
// - 列表为空且加载完：返回空（调用方清记忆与 query）；
// - 列表非空：当前值不在列表时补进首位（显式深链仍可查看），并截断上限。
export function buildRunOptions(
  runIds: readonly string[],
  current: string,
  loading: boolean,
  limit = 40,
): string[] {
  const list = Array.from(new Set(runIds.map(normalizeRunId).filter(Boolean)))
  if (list.length === 0) {
    return loading && current ? [current] : []
  }
  if (current && !list.includes(current)) list.unshift(current)
  return list.slice(0, limit)
}

/** 运行中心列表的 sim 运行 ID 带 `sim-` 前缀；run-state/报告端点只认目录名。 */
export function normalizeRunId(id: string): string {
  return id.startsWith('sim-') ? id.slice(4) : id
}
