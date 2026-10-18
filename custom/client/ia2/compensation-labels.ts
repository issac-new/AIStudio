// overlay/custom/client/ia2/compensation-labels.ts
// 自动代处理类型的产品化命名（2026-10-19 产品走查批）。
// 台账里的 type 是 harness 内部代码（dispatch-preset / nudge / …），
// 界面显示人话；未登记的代码原样透出，并保留 code 供排查（title）。

const LABELS: Record<string, string> = {
  'dispatch-preset': '预设派发',
  nudge: '催办',
  'card-walk-done': '卡片代办完成',
  'card-backfill': '卡片补录',
  'parallel-redispatch': '并行重派',
  'defect-repair-redispatch': '缺陷修复重派',
  'gate-approve': '质量门代批',
  'manual-resume': '人工恢复',
}

/** 显示名：命中映射给人话，未命中原样返回（不假装认识未知类型）。 */
export function compensationLabel(type: string): string {
  const key = String(type ?? '').trim()
  return LABELS[key] ?? key
}
