// overlay/hookswrite 域：Hooks 生命周期配置写档面（qoder Q11 吸收，矩阵 §3.2 Q11 写档面）。
//
// Q11 现状：hooks 只读面板（R4 旧账已落）；本层补**写档面**——hook 配置的
// upsert/禁用/重排/校验。事件词表锚 claude-code mods/types/claude-code.d.ts:402
// （{ PreToolUse: [{ matcher, hooks }] } 形态）：PreToolUse/PostToolUse/
// Notification/Stop/SubagentStop/SessionStart/PreCompact 七事件。
export const HOOK_EVENTS = [
  'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStop', 'SessionStart', 'PreCompact',
] as const
export type HookEvent = (typeof HOOK_EVENTS)[number]

export interface HookConfig {
  hookId: string
  event: HookEvent
  matcher: string
  command: string
  enabled: boolean
  order: number
}

/** hook 配置校验：事件词表+命令非空。 */
export function validateHook(h: Omit<HookConfig, 'order'>): { ok: boolean; problem?: string } {
  if (!HOOK_EVENTS.includes(h.event)) return { ok: false, problem: `unknown event: ${h.event}` }
  if (!h.command.trim()) return { ok: false, problem: 'empty command' }
  return { ok: true }
}

/** upsert（幂等 hookId；保留原 order 或顺尾）。 */
export function upsertHook(list: readonly HookConfig[], input: HookConfig): HookConfig[] {
  const idx = list.findIndex((h) => h.hookId === input.hookId)
  if (idx === -1) return [...list, { ...input, order: list.length }]
  const next = [...list]
  next[idx] = { ...input, order: list[idx].order }
  return next
}

/** 启停切换（写档面开关）。 */
export function setHookEnabled(list: readonly HookConfig[], hookId: string, enabled: boolean): HookConfig[] {
  return list.map((h) => (h.hookId === hookId ? { ...h, enabled } : h))
}

/** 重排：按给定 hookId 序重写 order（缺漏项顺尾补）。 */
export function reorderHooks(list: readonly HookConfig[], orderIds: readonly string[]): HookConfig[] {
  const seen = new Set(orderIds)
  const ordered = [
    ...orderIds.map((id) => list.find((h) => h.hookId === id)).filter((h): h is HookConfig => !!h),
    ...list.filter((h) => !seen.has(h.hookId)),
  ]
  return ordered.map((h, i) => ({ ...h, order: i }))
}
