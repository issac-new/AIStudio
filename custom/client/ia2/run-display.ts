// overlay/custom/client/ia2/run-display.ts
// 运行标识的产品化展示（2026-10-19 产品走查批）。
// 运行目录名（如 20261017-v8-run21）是内部锚，用于端点参数与证据反查；
// 界面不把目录名与「第 N 轮」当标题展示——产品里只呈现可读日期，
// 原始目录名保留在 title/aria 供排查时反查。

const RUN_DATE = /^(\d{4})(\d{2})(\d{2})/

/** 完整展示名：20261017-v8-run21 → 「2026 年 10 月 17 日运行」。 */
export function runDisplayName(runId: string): string {
  const raw = String(runId ?? '').trim()
  const m = RUN_DATE.exec(raw)
  if (!m) return raw
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日运行`
}

/** 紧凑展示名（顶栏 chip / 左栏尾注）：20261017-v8-run21 → 「10/17 运行」。 */
export function runShortLabel(runId: string): string {
  const raw = String(runId ?? '').trim()
  const m = RUN_DATE.exec(raw)
  if (!m) return raw
  return `${Number(m[2])}/${Number(m[3])} 运行`
}
