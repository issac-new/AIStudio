// overlay/custom/client/ui/status.ts
// 状态色单一事实源桥（批 B3，spec 2026-10-17-frontend-ux-consolidation-redesign）。
// 此前双轨：cockpit STATUS_COLORS（语义九态：blocked/review/todo/ok/…）与
// ia2 五态 token（--ia-fresh/stale/fail/pass/compensated，WCAG 校准）各处自取。
// 本模块把两轨合一：语义态仍以 cockpit/styles/status-colors.ts 为正本（再导出），
// 流水线五态映射到 --ia-* token；组件层（UiStatusPill）经 toneColor 取色，
// 禁止再散点手写状态色值。
import { STATUS_COLORS, STATUS_BG, resolveStatusColors, type SemanticStatus } from '../cockpit/styles/status-colors'

export { STATUS_COLORS, STATUS_BG, resolveStatusColors }
export type { SemanticStatus }

/** 流水线五态（ia2.scss :root 的 --ia-* 五色，WCAG 双底校准，勿改值） */
export type PipelineTone = 'fresh' | 'stale' | 'fail' | 'pass' | 'compensated'

export const PIPELINE_TONE_VAR: Record<PipelineTone, string> = {
  fresh: 'var(--ia-fresh, #2e9e5b)',
  stale: 'var(--ia-stale, #b8860b)',
  fail: 'var(--ia-fail, #e06666)',
  pass: 'var(--ia-pass, #2f9e6e)',
  compensated: 'var(--ia-compensated, #9678c6)',
}

export type UiTone = SemanticStatus | PipelineTone

/** 任意 tone → CSS 色值（文字/前景用） */
export function toneColor(tone: UiTone): string {
  if (tone in PIPELINE_TONE_VAR) return PIPELINE_TONE_VAR[tone as PipelineTone]
  return STATUS_COLORS[tone as SemanticStatus]
}
